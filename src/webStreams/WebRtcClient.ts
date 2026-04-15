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
 * stable public API consumed by StreamApi. All business logic lives in the
 * focused service classes injected via the constructor.
 *
 * Dependency groups:
 *  - publisher   : PublisherManager  — outbound media tracks, SDP offer/answer
 *  - subscriber  : SubscriberManager — inbound tracks, reconfigure queue
 *  - dataChannel : DataChannelSession — encrypted data channel messages
 *  - keys        : KeySyncManager   — keeps main-thread and worker keys in sync
 *  Cross-cutting:
 *  - eventsDispatcher  — RTCPeerConnection state change events
 *  - listenerRegistry  — remote stream callbacks
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

    // -------------------------------------------------------------------------
    // Public API — StreamApi calls these methods
    // -------------------------------------------------------------------------

    bindApiInterface(impl: StreamsCallbackInterface): void {
        this.streamsApiInterface = impl;
    }

    trickle(sessionId: SessionId, candidate: RTCIceCandidate): Promise<void> {
        if (!this.streamsApiInterface) throw new Error("StreamsApiInterface not yet bound");
        return this.streamsApiInterface.trickle(sessionId, candidate);
    }

    setAudioLevelCallback(func: AudioLevelFuncCallback): void {
        this.audioManager.setAudioLevelCallback(func);
    }

    addRemoteStreamListener(listener: RemoteStreamListener): void {
        this.listenerRegistry.add(listener);
    }

    getStreamStateChangeDispatcher(): StateChangeDispatcher {
        return this.eventsDispatcher;
    }

    async setTurnCredentials(credentials: TurnCredentials[]): Promise<void> {
        this.pcFactory.setTurnCredentials(credentials);
    }

    async updateKeys(streamRoomId: StreamRoomId, keys: Key[]): Promise<void> {
        await this.keys.updateKeys(streamRoomId, keys);
    }

    async encryptDataChannelData(data: Uint8Array): Promise<Uint8Array> {
        return this.dataChannel.encrypt(data);
    }

    // -- Publisher --

    async createPeerConnectionWithLocalStream(
        streamHandle: StreamHandle,
        streamRoomId: StreamRoomId,
        stream?: MediaStream,
        dataTracks?: StreamTrack[],
    ): Promise<RTCPeerConnection> {
        return this.publisher.createWithLocalStream(streamHandle, streamRoomId, stream, dataTracks);
    }

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

    removeSenderPeerConnectionOnUnpublish(streamRoomId: StreamRoomId, stream: MediaStream): void {
        this.publisher.removeAndCleanup(streamRoomId, stream);
    }

    async createPublisherOffer(roomId: StreamRoomId): Promise<string> {
        return this.publisher.createOffer(roomId);
    }

    async setPublisherRemoteDescription(
        roomId: StreamRoomId,
        sdp: string,
        type: RTCSdpType,
    ): Promise<void> {
        return this.publisher.setRemoteDescription(roomId, sdp, type);
    }

    // -- Subscriber --

    initializeSubscriberConnection(roomId: StreamRoomId): void {
        this.subscriber.initialize(roomId);
    }

    async onSubscriptionUpdated(room: StreamRoomId, offer: Jsep): Promise<void> {
        return this.subscriber.onSubscriptionUpdated(room, offer);
    }

    getLastProcessedAnswer(room: StreamRoomId): Jsep {
        return this.subscriber.getLastProcessedAnswer(room);
    }

    // -- Connection lifecycle (used by WebRtcInterfaceImpl) --

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

    closeConnection(roomId: StreamRoomId, connectionType: ConnectionType): void {
        if (connectionType === "publisher") {
            this.publisher.close(roomId);
        } else {
            this.subscriber.close(roomId);
        }
    }

    destroy(): void {
        this.e2eeWorker.stop();
        this.audioManager.destroy();
    }
}
