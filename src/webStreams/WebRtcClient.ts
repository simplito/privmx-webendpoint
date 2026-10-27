import { Key, TurnCredentials, RemoteStreamListener, StreamRoomConnectionState } from "../Types.js";
import {
    DecryptedDataChannelMessage,
    Jsep,
    StreamHandle,
    StreamRoomId,
    StreamTrack,
} from "./types/ApiTypes.js";
import { ConnectionType, PeerConnectionManager, SessionId } from "./PeerConnectionManager.js";
import { PeerConnectionFactory } from "./PeerConnectionFactory.js";
import { PublisherManager } from "./PublisherManager.js";
import { SubscriberManager } from "./SubscriberManager.js";
import { E2eeWorker } from "./E2eeWorker.js";
import { KeySyncManager } from "./KeySyncManager.js";
import { StateChangeDispatcher } from "./EventDispatcher.js";
import { AudioManager, AudioLevelsStats, ActiveSpeakerDetectorConfig } from "./AudioManager.js";
import { RemoteStreamListenerRegistry } from "./RemoteStreamListenerRegistry.js";
import { ReconnectManager } from "./ReconnectManager.js";

export interface StreamsCallbackInterface {
    trickle(sessionId: SessionId, candidate: RTCIceCandidate): Promise<void>;
    setNewOfferOnReconfigure(sessionId: SessionId, jsep: Jsep): Promise<void>;
    restartSubscriberIce(streamRoomId: StreamRoomId): Promise<void>;
    decryptDataChannelMessage(
        streamRoomId: StreamRoomId,
        remoteStreamId: string,
        encryptedData: Uint8Array,
    ): Promise<DecryptedDataChannelMessage>;
}

export type { AudioLevelsStats, ActiveSpeakerDetectorConfig };

/**
 * Thin facade that wires all WebRTC sub-systems together and exposes the
 * stable public API consumed by `StreamApi`. All business logic lives in the
 * focused service classes injected via the constructor.
 *
 * Dependency groups:
 *  - `publisher`       - `PublisherManager`: outbound media tracks, SDP offer/answer
 *  - `subscriber`      - `SubscriberManager`: inbound tracks, reconfigure queue
 *  - `keys`            - `KeySyncManager`: keeps the E2EE worker's media keys in sync
 *  - `eventsDispatcher`- `StateChangeDispatcher`: RTCPeerConnection state change events
 *  - `listenerRegistry`- `RemoteStreamListenerRegistry`: remote stream callbacks
 *
 * Data channel messages are encrypted/decrypted natively via `StreamApiLow`
 * (bound in through {@link bindApiInterface}), not by this class.
 */
export class WebRtcClient {
    private streamsApiInterface: StreamsCallbackInterface | undefined;

    constructor(
        private readonly publisher: PublisherManager,
        private readonly subscriber: SubscriberManager,
        private readonly keys: KeySyncManager,
        private readonly eventsDispatcher: StateChangeDispatcher,
        private readonly listenerRegistry: RemoteStreamListenerRegistry,
        private readonly pcFactory: PeerConnectionFactory,
        private readonly audioManager: AudioManager,
        private readonly e2eeWorker: E2eeWorker,
        private readonly reconnect: ReconnectManager,
        private readonly pcm: PeerConnectionManager,
    ) {}

    /**
     * Binds the native WASM callback interface used to forward ICE trickle
     * candidates to the server and to decrypt inbound data channel frames.
     * Must be called once before any peer connection is established.
     */
    bindApiInterface(impl: StreamsCallbackInterface): void {
        this.streamsApiInterface = impl;
    }

    /**
     * Forwards an ICE trickle candidate to the signalling server.
     * Delegates to the bound `StreamsCallbackInterface`.
     * @throws if `bindApiInterface` has not been called yet.
     */
    trickle(sessionId: SessionId, candidate: RTCIceCandidate): Promise<void> {
        if (!this.streamsApiInterface) throw new Error("StreamsApiInterface not yet bound");
        return this.streamsApiInterface.trickle(sessionId, candidate);
    }

    /**
     * Sends a publisher offer (e.g. one restarting ICE) to the media server.
     * The library applies the answer itself, through
     * `setAnswerAndSetRemoteDescription`.
     * @throws if `bindApiInterface` has not been called yet.
     */
    setNewOfferOnReconfigure(sessionId: SessionId, jsep: Jsep): Promise<void> {
        if (!this.streamsApiInterface) throw new Error("StreamsApiInterface not yet bound");
        return this.streamsApiInterface.setNewOfferOnReconfigure(sessionId, jsep);
    }

    /**
     * Asks the media server to restart ICE on the room's subscriber stream; the
     * offer it produces arrives through `createAnswerAndSetDescriptions`.
     * @throws if `bindApiInterface` has not been called yet.
     */
    restartSubscriberIce(streamRoomId: StreamRoomId): Promise<void> {
        if (!this.streamsApiInterface) throw new Error("StreamsApiInterface not yet bound");
        return this.streamsApiInterface.restartSubscriberIce(streamRoomId);
    }

    /**
     * Registers the callback receiving `streamRoomId`'s connection state
     * (connected / reconnecting / lost) while the room is joined.
     */
    setConnectionStateListener(
        streamRoomId: StreamRoomId,
        listener: (state: StreamRoomConnectionState) => void,
    ): void {
        this.reconnect.setListener(streamRoomId, listener);
    }

    /**
     * Drops the connection state listener and all recovery state for
     * `streamRoomId`, on leaving the room.
     */
    clearConnectionStateListener(streamRoomId: StreamRoomId): void {
        this.reconnect.clearListener(streamRoomId);
    }

    /**
     * Registers the callback receiving the raw `RTCPeerConnection` state of
     * `streamRoomId`'s subscriber connection - the counterpart of the publisher
     * states `StateChangeDispatcher` delivers per stream handle.
     */
    setSubscriberStateListener(
        streamRoomId: StreamRoomId,
        listener: (state: RTCPeerConnectionState) => void,
    ): void {
        this.reconnect.setRawStateListener(streamRoomId, "subscriber", listener);
    }

    /** Drops the subscriber state listener for `streamRoomId`. */
    clearSubscriberStateListener(streamRoomId: StreamRoomId): void {
        this.reconnect.clearRawStateListener(streamRoomId, "subscriber");
    }

    /**
     * Reads the current audio-level statistics for all active speakers
     * (local and remote) right now. No internal polling - call this as
     * often as needed.
     */
    async readAudioStats(): Promise<AudioLevelsStats> {
        return this.audioManager.readAudioStats();
    }

    /**
     * Overrides any subset of the active-speaker detector's tuning
     * parameters (EMA smoothing, threshold, hold time); omitted fields keep
     * their current value.
     */
    configureActiveSpeakerDetector(config: Partial<ActiveSpeakerDetectorConfig>): void {
        this.audioManager.configureActiveSpeakerDetector(config);
    }

    /**
     * Registers a listener for incoming remote media tracks and data channel
     * messages within a stream room.
     */
    addRemoteStreamListener(listener: RemoteStreamListener): void {
        this.listenerRegistry.add(listener);
    }

    /**
     * Returns the `StateChangeDispatcher` used to subscribe to
     * `RTCPeerConnection` state changes for a given stream handle.
     */
    getStreamStateChangeDispatcher(): StateChangeDispatcher {
        return this.eventsDispatcher;
    }

    /**
     * Updates the TURN server credentials used for all subsequent
     * `RTCPeerConnection` configurations.
     */
    async setTurnCredentials(credentials: TurnCredentials[]): Promise<void> {
        this.pcFactory.setTurnCredentials(credentials);
    }

    /**
     * Atomically updates the AES-256-GCM session keys on both the main thread
     * (`KeyStore`) and the E2EE worker thread.
     */
    async updateKeys(streamRoomId: StreamRoomId, keys: Key[]): Promise<void> {
        await this.keys.updateKeys(streamRoomId, keys);
    }

    /**
     * Decrypts a wire-format frame received from `remoteStreamId` using the
     * native `StreamApiLow` message encryptor. Replay-protection state for a
     * previously unseen `remoteStreamId` is created natively on the first
     * decrypted frame - no explicit registration is needed.
     * @throws if `bindApiInterface` has not been called yet.
     */
    async decryptDataChannelMessage(
        streamRoomId: StreamRoomId,
        remoteStreamId: string,
        encryptedData: Uint8Array,
    ): Promise<DecryptedDataChannelMessage> {
        if (!this.streamsApiInterface) throw new Error("StreamsApiInterface not yet bound");
        return this.streamsApiInterface.decryptDataChannelMessage(
            streamRoomId,
            remoteStreamId,
            encryptedData,
        );
    }

    /**
     * Creates the publisher peer connection for `streamHandle` in `streamRoomId`,
     * adds all tracks in `stream` (installing E2EE sender transforms), and creates
     * data channels for any `dataTracks`.
     */
    async createPeerConnectionWithLocalStream(
        streamHandle: StreamHandle,
        streamRoomId: StreamRoomId,
        stream?: MediaStream,
        dataTracks?: StreamTrack[],
    ): Promise<RTCPeerConnection> {
        return this.publisher.createWithLocalStream(streamHandle, streamRoomId, stream, dataTracks);
    }

    /**
     * Adds and removes tracks on the existing publisher peer connection for
     * `streamRoomId`. E2EE sender transforms are installed on newly added tracks.
     */
    async updatePeerConnectionWithLocalStream(
        streamRoomId: StreamRoomId,
        localStream: MediaStream,
        tracksToAdd: MediaStreamTrack[],
        tracksToRemove: MediaStreamTrack[],
    ): Promise<RTCPeerConnection> {
        return this.publisher.updateLocalStream(
            streamRoomId,
            localStream,
            tracksToAdd,
            tracksToRemove,
        );
    }

    /**
     * Stops audio level metering for all tracks in `stream` and closes the
     * publisher peer connection for `streamRoomId`.
     */
    removeSenderPeerConnectionOnUnpublish(streamRoomId: StreamRoomId, stream: MediaStream): void {
        this.publisher.stopAndClose(streamRoomId, stream);
    }

    /**
     * Creates an SDP offer on the publisher connection for `roomId`, sets it as
     * the local description, and returns the raw SDP string.
     */
    async createPublisherOffer(roomId: StreamRoomId): Promise<string> {
        return this.publisher.createOffer(roomId);
    }

    /**
     * Sets the remote SDP answer on the publisher connection for `roomId`.
     */
    async setPublisherRemoteDescription(
        roomId: StreamRoomId,
        sdp: string,
        type: RTCSdpType,
    ): Promise<void> {
        return this.publisher.setRemoteDescription(roomId, sdp, type);
    }

    /**
     * Initialises the subscriber peer connection for `roomId` so it is ready
     * to receive incoming offers from the signalling server.
     */
    initializeSubscriberConnection(roomId: StreamRoomId): void {
        this.subscriber.initialize(roomId);
    }

    /**
     * Enqueues and processes a new SDP offer from the server for `room`,
     * creating an answer and updating the subscriber peer connection.
     */
    async onSubscriptionUpdated(room: StreamRoomId, offer: Jsep): Promise<void> {
        return this.subscriber.onSubscriptionUpdated(room, offer);
    }

    /**
     * IDs of `roomId`'s Streams whose remote track the media server took away
     * while they were still subscribed - a Stream republished under the same ID
     * looks exactly like this, and its subscriptions deliver nothing until they
     * are made anew.
     */
    getStaleStreams(roomId: StreamRoomId): ReadonlySet<number> {
        return this.subscriber.getStaleStreams(roomId);
    }

    /** Forgets one stale Stream of `roomId`, once its subscription was redone or dropped. */
    forgetStaleStream(roomId: StreamRoomId, streamId: number): void {
        this.subscriber.forgetStaleStream(roomId, streamId);
    }

    /**
     * Announces that `streamId` is being unsubscribed in `roomId`, so its remote
     * track going away is not taken for the media server dropping it.
     */
    expectStreamRemoval(roomId: StreamRoomId, streamId: number): void {
        this.subscriber.expectStreamRemoval(roomId, streamId);
    }

    /** Forgets every stale Stream of `roomId` (its subscriber stream was rebuilt). */
    clearStaleStreams(roomId: StreamRoomId): void {
        this.subscriber.clearStaleStreams(roomId);
    }

    /**
     * Returns the last SDP answer produced for `room` during reconfiguration.
     * Used by `WebRtcInterfaceImpl` to reply to the server's accept-offer call.
     * @throws if no answer has been produced for the given room yet.
     */
    getLastProcessedAnswer(room: StreamRoomId): Jsep {
        return this.subscriber.getLastProcessedAnswer(room);
    }

    /**
     * Updates the Janus session ID for an existing publisher or subscriber
     * connection in `roomId` and flushes any queued ICE candidates.
     */
    updateConnectionSessionId(
        roomId: StreamRoomId,
        sessionId: SessionId,
        connectionType: ConnectionType,
    ): void {
        if (connectionType === "publisher") {
            this.publisher.updateSessionId(roomId, sessionId);
        } else {
            this.subscriber.updateSessionId(roomId, sessionId);
        }
    }

    /**
     * Closes the publisher or subscriber peer connection for `roomId` and
     * cleans up associated state.
     */
    closeConnection(roomId: StreamRoomId, connectionType: ConnectionType): void {
        if (connectionType === "publisher") {
            this.publisher.close(roomId);
        } else {
            this.subscriber.close(roomId);
        }
    }

    /**
     * Tears the whole WebRTC session down: closes every peer connection of this
     * connection (publisher and subscriber, in every room), stops any pending ICE
     * recovery, terminates the E2EE worker thread and clears all watched audio
     * senders/receivers.
     *
     * Called automatically by `StreamApi.destroyRefs()` during
     * `Connection.disconnect()`. Closing the peer connections here does not
     * depend on the native layer calling back, so a connection that died
     * (`libDisconnected`) leaves no sender transmitting from a dead session. The
     * local `MediaStreamTrack`s are left alone - they belong to the application,
     * which may reuse them on the next connection.
     */
    destroy(): void {
        this.pcm.closeAll();
        this.reconnect.destroy();
        this.e2eeWorker.stop();
        this.audioManager.destroy();
    }
}
