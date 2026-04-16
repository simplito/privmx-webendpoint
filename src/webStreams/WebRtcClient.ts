import { Key, TurnCredentials, StreamHandle, RemoteStreamListener } from "../Types";
import { Jsep, StreamRoomId, StreamTrack } from "./types/ApiTypes";
import { ConnectionType, SessionId } from "./PeerConnectionManager";
import { PeerConnectionFactory } from "./PeerConnectionFactory";
import { PublisherManager } from "./PublisherManager";
import { SubscriberManager } from "./SubscriberManager";
import { DataChannelSession } from "./DataChannelSession";
import { E2eeWorker } from "./E2eeWorker";
import { KeySyncManager } from "./KeySyncManager";
import { StateChangeDispatcher } from "./EventDispatcher";
import { AudioManager, AudioLevelFuncCallback } from "./AudioManager";
import { RemoteStreamListenerRegistry } from "./RemoteStreamListenerRegistry";

export interface StreamsCallbackInterface {
    trickle(sessionId: SessionId, candidate: RTCIceCandidate): Promise<void>;
    acceptOffer(sessionId: SessionId, sdp: Jsep): Promise<void>;
}

export { AudioLevelFuncCallback };
export type { AudioLevelsStats } from "./AudioManager";

/**
 * Thin facade that wires all WebRTC sub-systems together and exposes the
 * stable public API consumed by `StreamApi`. All business logic lives in the
 * focused service classes injected via the constructor.
 *
 * Dependency groups:
 *  - `publisher`       — `PublisherManager`: outbound media tracks, SDP offer/answer
 *  - `subscriber`      — `SubscriberManager`: inbound tracks, reconfigure queue
 *  - `dataChannel`     — `DataChannelSession`: encrypted data channel messages
 *  - `keys`            — `KeySyncManager`: keeps main-thread and worker keys in sync
 *  - `eventsDispatcher`— `StateChangeDispatcher`: RTCPeerConnection state change events
 *  - `listenerRegistry`— `RemoteStreamListenerRegistry`: remote stream callbacks
 */
export class WebRtcClient {
    private streamsApiInterface: StreamsCallbackInterface | undefined;

    constructor(
        private readonly publisher: PublisherManager,
        private readonly subscriber: SubscriberManager,
        private readonly dataChannel: DataChannelSession,
        private readonly keys: KeySyncManager,
        private readonly eventsDispatcher: StateChangeDispatcher,
        private readonly listenerRegistry: RemoteStreamListenerRegistry,
        private readonly pcFactory: PeerConnectionFactory,
        private readonly audioManager: AudioManager,
        private readonly e2eeWorker: E2eeWorker,
    ) {}

    /**
     * Binds the native WASM callback interface used to forward ICE trickle
     * candidates and SDP accept-offer calls back to the server. Must be called
     * once before any peer connection is established.
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
     * Registers a callback that receives periodic audio-level statistics for
     * all active speakers (local and remote). Replaces any previously registered callback.
     */
    setAudioLevelCallback(func: AudioLevelFuncCallback): void {
        this.audioManager.setAudioLevelCallback(func);
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
     * Encrypts `data` using the active session key and returns the wire-format
     * frame ready to be sent over an `RTCDataChannel`.
     */
    async encryptDataChannelData(data: Uint8Array): Promise<Uint8Array> {
        return this.dataChannel.encrypt(data);
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
        this.publisher.removeAndCleanup(streamRoomId, stream);
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
     * Terminates the E2EE worker thread and stops all local audio level meters.
     * Called automatically by `StreamApi.destroyRefs()` during `Connection.disconnect()`.
     */
    destroy(): void {
        this.e2eeWorker.stop();
        this.audioManager.destroy();
    }
}
