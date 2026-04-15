import { Key, TurnCredentials, StreamHandle, RemoteStreamListener } from "../Types";
import { Jsep, StreamRoomId, StreamTrack } from "./types/ApiTypes";
import { ConnectionType, SessionId } from "./PeerConnectionsManager";
import { PeerConnectionFactory } from "./PeerConnectionFactory";
import { PeerConnectionManager } from "./PeerConnectionsManager";
import { PublisherManager } from "./PublisherManager";
import { SubscriberManager } from "./SubscriberManager";
import { DataChannelSession } from "./DataChannelSession";
import { KeySyncManager } from "./KeySyncManager";
import { KeyStore } from "./KeyStore";
import { DataChannelCryptor } from "./DataChannelCryptor";
import { StateChangeDispatcher } from "./EventDispatcher";
import { AudioManager, AudioLevelFuncCallback } from "./AudioManager";
import { E2eeWorker } from "./E2eeWorker";
import { E2eeTransformManager } from "./E2eeTransformManager";
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
    ) {}

    // -------------------------------------------------------------------------
    // Static factory — the only place where concrete types are instantiated.
    // Everything below the constructor works exclusively through injected deps.
    // -------------------------------------------------------------------------

    static create(assetsDir: string): WebRtcClient {
        const keyStore = new KeyStore();
        const dataChannelCryptor = new DataChannelCryptor(keyStore);
        const dataChannelSession = new DataChannelSession(dataChannelCryptor);
        const eventsDispatcher = new StateChangeDispatcher();
        const listenerRegistry = new RemoteStreamListenerRegistry();

        const e2eeWorker = new E2eeWorker(assetsDir, (publisherId, rms) => {
            audioManager.onRemoteFrameRms(publisherId, rms);
        });
        const e2eeTransformManager = new E2eeTransformManager(e2eeWorker);
        const audioManager = new AudioManager(assetsDir, (rms) => e2eeWorker.sendRms(rms));

        // subscriber is created after pcm because SubscriberManager needs pcm,
        // and pcFactory needs the subscriber's onRemoteTrack callback.
        // We break the cycle with a late-bound reference (same pattern as before).
        let subscriberRef: SubscriberManager | undefined;

        const pcFactory = new PeerConnectionFactory(
            eventsDispatcher,
            dataChannelSession,
            e2eeTransformManager,
            listenerRegistry,
            async (roomId, event) => {
                if (!subscriberRef) throw new Error("SubscriberManager not yet initialized");
                await subscriberRef.onRemoteTrack(roomId, event);
            },
        );

        // clientRef is needed so the ICE trickle callback can reach streamsApiInterface
        let clientRef: WebRtcClient | undefined;

        const pcm = new PeerConnectionManager(
            (room, streamHandle) => pcFactory.create(room, streamHandle),
            (sessionId, candidate) => {
                if (!clientRef) throw new Error("WebRtcClient not yet initialized");
                if (!clientRef.streamsApiInterface)
                    throw new Error("StreamsApiInterface not yet bound");
                return clientRef.streamsApiInterface.trickle(sessionId, candidate);
            },
        );

        const publisher = new PublisherManager(pcm, audioManager, e2eeTransformManager);
        const subscriber = new SubscriberManager(pcm, e2eeTransformManager, listenerRegistry);
        const keys = new KeySyncManager(keyStore, e2eeWorker);

        subscriberRef = subscriber;

        const client = new WebRtcClient(
            publisher,
            subscriber,
            dataChannelSession,
            keys,
            eventsDispatcher,
            listenerRegistry,
            pcFactory,
            audioManager,
        );

        clientRef = client;
        return client;
    }

    // -------------------------------------------------------------------------
    // Public API — StreamApi calls these methods
    // -------------------------------------------------------------------------

    bindApiInterface(impl: StreamsCallbackInterface): void {
        this.streamsApiInterface = impl;
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
}
