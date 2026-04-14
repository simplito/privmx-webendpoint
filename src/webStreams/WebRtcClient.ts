import { QueueItem, SessionId } from "./WebRtcClientTypes";
import { WebRtcConfig } from "./WebRtcConfig";
import { Key, TurnCredentials, StreamHandle, DataChannelCryptorDecryptStatus } from "../Types";
import { KeyStore } from "./KeyStore";
import { ConnectionType, PeerConnectionManager } from "./PeerConnectionsManager";
import { Logger } from "./Logger";
import { Jsep, StreamRoomId, StreamTrack } from "./types/ApiTypes";
import { Queue } from "./Queue";
import { StateChangeDispatcher } from "./EventDispatcher";
import { DataChannelCryptor, DataChannelCryptorError } from "./DataChannelCryptor";
import { AudioManager, AudioLevelFuncCallback } from "./AudioManager";
import { E2eeTransformManager } from "./E2eeTransformManager";
import { RemoteStreamListenerRegistry } from "./RemoteStreamListenerRegistry";
import { RemoteStreamListener } from "../Types";
import { RTCConfigurationWithInsertableStreams } from "./types/WebRtcExtensions";

export interface StreamsCallbackInterface {
    trickle(sessionId: SessionId, candidate: RTCIceCandidate): Promise<void>;
    acceptOffer(sessionId: SessionId, sdp: Jsep): Promise<void>;
}

export { AudioLevelFuncCallback };
export type { AudioLevelsStats } from "./AudioManager";

export class WebRtcClient {
    private configuration: RTCConfiguration | undefined;
    private peerCredentials: TurnCredentials[] | undefined;
    private readonly sequenceNumberByRemoteStreamId: Map<number, number> = new Map();
    private sequenceNumberOfSender: number;
    private readonly logger: Logger;
    private readonly peerConnectionReconfigureQueue: Queue<QueueItem>;
    private lastProcessedAnswer: { [roomId: string]: Jsep } = {};
    private bootstrapDataChannel: RTCDataChannel | undefined;
    private streamsApiInterface: StreamsCallbackInterface | undefined;

    constructor(
        private readonly peerConnectionsManager: PeerConnectionManager,
        private readonly keyStore: KeyStore,
        private readonly dataChannelCryptor: DataChannelCryptor,
        private readonly eventsDispatcher: StateChangeDispatcher,
        private readonly audioManager: AudioManager,
        private readonly e2eeTransformManager: E2eeTransformManager,
        private readonly listenerRegistry: RemoteStreamListenerRegistry,
    ) {
        this.sequenceNumberOfSender = 1;
        this.logger = new Logger();

        this.peerConnectionReconfigureQueue = new Queue<QueueItem>();
        this.peerConnectionReconfigureQueue.assignProcessorFunc(async (item: QueueItem) => {
            if (item.jsep && item.jsep.type === "offer") {
                await this.reconfigureSingle(item.room, item.jsep);
            } else {
                await this.reconfigureSingleCreateOffer(item.room);
            }
        });
    }

    /**
     * Wires all dependencies and returns a ready WebRtcClient instance.
     *
     * PeerConnectionManager requires a factory callback that calls back into
     * WebRtcClient, so construction is bootstrapped via late binding.
     */
    static create(assetsDir: string): WebRtcClient {
        const keyStore = new KeyStore();
        const dataChannelCryptor = new DataChannelCryptor(keyStore);
        const eventsDispatcher = new StateChangeDispatcher();
        const listenerRegistry = new RemoteStreamListenerRegistry();

        // PeerConnectionManager's factory callback is bound after the client is
        // constructed via a shared mutable reference to avoid circular dep.
        let clientRef: WebRtcClient | undefined;

        const peerConnectionsManager = new PeerConnectionManager(
            (roomId: StreamRoomId, streamHandle?: StreamHandle) => {
                if (!clientRef) throw new Error("WebRtcClient not yet initialized");
                return clientRef.createPeerConnectionMultiForRoom(
                    roomId,
                    clientRef.getPeerConnectionConfiguration(),
                    streamHandle,
                );
            },
            (sessionId: SessionId, candidate: RTCIceCandidate) => {
                if (!clientRef) throw new Error("WebRtcClient not yet initialized");
                if (!clientRef.streamsApiInterface)
                    throw new Error("StreamsApiInterface not yet bound");
                return clientRef.streamsApiInterface.trickle(sessionId, candidate);
            },
        );

        const e2eeTransformManager = new E2eeTransformManager(assetsDir, (publisherId, rms) => {
            if (clientRef) {
                clientRef.audioManager.onRemoteFrameRms(publisherId, rms);
            }
        });

        const audioManager = new AudioManager(assetsDir, (rms) => {
            e2eeTransformManager.sendLocalRms(rms);
        });

        const client = new WebRtcClient(
            peerConnectionsManager,
            keyStore,
            dataChannelCryptor,
            eventsDispatcher,
            audioManager,
            e2eeTransformManager,
            listenerRegistry,
        );

        clientRef = client;
        return client;
    }

    public setAudioLevelCallback(func: AudioLevelFuncCallback): void {
        this.audioManager.setAudioLevelCallback(func);
    }

    /** Called by StreamApiNative to wire the signalling callbacks after WASM initialises. */
    public bindApiInterface(impl: StreamsCallbackInterface): void {
        this.streamsApiInterface = impl;
    }

    public addRemoteStreamListener(listener: RemoteStreamListener): void {
        this.listenerRegistry.add(listener);
    }

    public getStreamStateChangeDispatcher(): StateChangeDispatcher {
        return this.eventsDispatcher;
    }

    /** Returns the last processed SDP answer for the given room, or throws if not yet available. */
    public getLastProcessedAnswer(room: StreamRoomId): Jsep {
        const answer = this.lastProcessedAnswer[room];
        if (!answer) {
            throw new Error(`No processed answer for room: ${room}`);
        }
        return answer;
    }

    /** Initialises a subscriber peer connection for the given room. */
    public initializeSubscriberConnection(roomId: StreamRoomId): void {
        this.peerConnectionsManager.initialize(roomId, "subscriber");
    }

    /** Updates the session ID for an existing peer connection (called after signalling). */
    public updateConnectionSessionId(
        roomId: StreamRoomId,
        sessionId: SessionId,
        connectionType: ConnectionType,
    ): void {
        this.peerConnectionsManager.updateSessionForConnection(roomId, connectionType, sessionId);
    }

    /** Closes a peer connection by type (used by WebRtcInterfaceImpl on room close). */
    public closeConnection(roomId: StreamRoomId, connectionType: ConnectionType): void {
        this.peerConnectionsManager.closePeerConnectionBySessionIfExists(roomId, connectionType);
    }

    /** Creates an SDP offer for the publisher connection and sets it as local description. */
    public async createPublisherOffer(roomId: StreamRoomId): Promise<string> {
        const pc = this.peerConnectionsManager.getConnectionWithSession(roomId, "publisher").pc;
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        if (!offer.sdp) throw new Error("createOffer returned no SDP");
        return offer.sdp;
    }

    /** Sets the remote description (answer) on the publisher connection. */
    public async setPublisherRemoteDescription(
        roomId: StreamRoomId,
        sdp: string,
        type: RTCSdpType,
    ): Promise<void> {
        const pc = this.peerConnectionsManager.getConnectionWithSession(roomId, "publisher").pc;
        await pc.setRemoteDescription(new RTCSessionDescription({ sdp, type }));
    }

    async setTurnCredentials(turnCredentials: TurnCredentials[]): Promise<void> {
        this.peerCredentials = turnCredentials;
    }

    async createPeerConnectionWithLocalStream(
        streamHandle: StreamHandle,
        streamRoomId: StreamRoomId,
        stream?: MediaStream,
        dataTracks?: StreamTrack[],
    ): Promise<RTCPeerConnection> {
        this.configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);

        this.peerConnectionsManager.initialize(
            streamRoomId,
            "publisher",
            -1 as SessionId,
            streamHandle,
        );
        const pc = this.peerConnectionsManager.getConnectionWithSession(
            streamRoomId,
            "publisher",
        ).pc;

        if (stream.getTracks().length > 0) {
            for (const track of stream.getTracks()) {
                if (track.kind === "audio") {
                    await this.audioManager.ensureLocalAudioLevelMeter(track);
                }
                const streamSender = pc.addTrack(track, stream);
                await this.e2eeTransformManager.setupSenderTransform(streamSender);
            }
        }

        if (dataTracks) {
            for (const dataTrack of dataTracks) {
                const dataChannel = pc.createDataChannel("JanusDataChannel", {
                    ordered: true,
                    negotiated: false,
                });
                dataTrack.dataChannelMeta.dataChannel = dataChannel;
            }
        }

        return pc;
    }

    removeSenderPeerConnectionOnUnpublish(streamRoomId: StreamRoomId, stream: MediaStream): void {
        for (const track of stream.getAudioTracks()) {
            this.audioManager.stopLocalAudioLevelMeter(track);
        }
        this.closeConnection(streamRoomId, "publisher");
    }

    async updatePeerConnectionWithLocalStream(
        streamRoomId: StreamRoomId,
        localStream: MediaStream,
        tracksToAdd: MediaStreamTrack[],
        tracksToRemove: MediaStreamTrack[],
    ): Promise<RTCPeerConnection> {
        this.configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);
        this.peerConnectionsManager.initialize(streamRoomId, "publisher");
        const pc = this.peerConnectionsManager.getConnectionWithSession(
            streamRoomId,
            "publisher",
        ).pc;

        for (const track of tracksToAdd) {
            if (track.kind === "audio") {
                await this.audioManager.ensureLocalAudioLevelMeter(track);
            }
            const videoSender = pc.addTrack(track, localStream);
            await this.e2eeTransformManager.setupSenderTransform(videoSender);
        }

        if (tracksToRemove.length > 0) {
            const senders = pc.getSenders();
            for (const oldTrack of tracksToRemove) {
                if (oldTrack.kind === "audio") {
                    this.audioManager.stopLocalAudioLevelMeter(oldTrack);
                }
                const sender = senders.find((s) => s.track === oldTrack);
                if (sender) {
                    pc.removeTrack(sender);
                }
            }
        }
        return pc;
    }

    async encryptDataChannelData(data: Uint8Array): Promise<Uint8Array> {
        const nextSequenceNumber = ++this.sequenceNumberOfSender;
        return this.dataChannelCryptor.encryptToWireFormat({
            plaintext: data,
            sequenceNumber: nextSequenceNumber,
        });
    }

    /** @internal — called by PeerConnectionManager's factory callback */
    createPeerConnectionMultiForRoom(
        roomId: StreamRoomId,
        configuration: RTCConfiguration,
        streamHandle?: StreamHandle,
    ): RTCPeerConnection {
        const extConf: RTCConfigurationWithInsertableStreams = {
            ...configuration,
            encodedInsertableStreams: true,
        };
        const connection = new RTCPeerConnection(extConf);

        connection.addEventListener("icegatheringstatechange", (event) => {
            this.logger.debug("on ice state change: ", event);
        });
        connection.addEventListener("icecandidateerror", (event) => {
            this.logger.debug("on ice error: ", event);
        });
        connection.addEventListener("connectionstatechange", (event) => {
            this.logger.debug("connectionstatechange: ", event);
            if (connection.connectionState === "connected") {
                this.logger.debug("Peers connected!");
            } else {
                this.logger.debug("connection state: ", connection.connectionState);
            }
            if (streamHandle !== undefined) {
                this.eventsDispatcher.emit({
                    streamHandle,
                    state: connection.connectionState,
                });
            }
        });

        connection.addEventListener("datachannel", (event) => {
            this.logger.debug(
                "================ RECV datachannel: ",
                event.channel.id,
                event.channel.label,
            );
            const dc = event.channel;
            dc.binaryType = "arraybuffer";
            dc.onmessage = async (dataEvent) => {
                this.logger.debug("================ ON MESSAGE....");
                const remoteStreamId = Number(event.channel.label);
                const frame =
                    dataEvent.data instanceof Uint8Array
                        ? dataEvent.data
                        : dataEvent.data instanceof ArrayBuffer
                          ? new Uint8Array(dataEvent.data)
                          : new Uint8Array(dataEvent.data.buffer);

                try {
                    const lastSeq = this.sequenceNumberByRemoteStreamId.get(remoteStreamId) || 0;
                    const decrypted = await this.dataChannelCryptor.decryptFromWireFormat({
                        frame,
                        lastSequenceNumber: lastSeq,
                    });
                    this.sequenceNumberByRemoteStreamId.set(remoteStreamId, decrypted.seq);
                    this.logger.debug(
                        "Calling listener for dataChannel: ",
                        roomId,
                        remoteStreamId,
                        decrypted.data,
                        DataChannelCryptorDecryptStatus.OK,
                    );
                    this.listenerRegistry.dispatchData(
                        roomId,
                        remoteStreamId,
                        decrypted.data,
                        DataChannelCryptorDecryptStatus.OK,
                    );
                } catch (e) {
                    if (e instanceof DataChannelCryptorError) {
                        this.listenerRegistry.dispatchData(
                            roomId,
                            remoteStreamId,
                            new Uint8Array(),
                            e.code,
                        );
                    } else {
                        throw e;
                    }
                }
            };
        });

        connection.addEventListener("iceconnectionstatechange", (event) => {
            this.logger.debug("iceconnectionstatechange: ", event);
        });
        connection.addEventListener("negotiationneeded", (event) => {
            this.logger.debug("negotiationneeded: ", event);
        });
        connection.addEventListener("signalingstatechange", (event) => {
            this.logger.debug("signalingstatechange: ", event);
        });
        connection.addEventListener("track", async (event) => {
            await this.addRemoteTrack(roomId, event);
        });
        return connection;
    }

    /** @internal */
    getPeerConnectionConfiguration(): RTCConfiguration {
        if (!this.configuration) {
            this.configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);
        }
        return this.configuration;
    }

    async updateKeys(streamRoomId: StreamRoomId, keys: Key[]): Promise<void> {
        this.logger.debug("=======> UPDATE KEYS", streamRoomId, keys.length);
        this.keyStore.setKeys(keys);
        await this.e2eeTransformManager.setKeys(keys);
    }

    private async waitUntilConnected(pc: RTCPeerConnection): Promise<void> {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
            return;
        }
        return new Promise<void>((resolve, reject) => {
            const onChange = () => {
                if (
                    pc.iceConnectionState === "connected" ||
                    pc.iceConnectionState === "completed"
                ) {
                    resolve();
                } else if (
                    pc.iceConnectionState === "failed" ||
                    pc.connectionState === "failed" ||
                    pc.connectionState === "closed"
                ) {
                    pc.removeEventListener("iceconnectionstatechange", onChange);
                    reject(new Error("ICE/DTLS not connected"));
                }
            };
            pc.addEventListener("iceconnectionstatechange", onChange);
        });
    }

    private async addRemoteTrack(roomId: StreamRoomId, event: RTCTrackEvent): Promise<void> {
        const receiver = event.receiver;
        const publisherId = Number(event.streams[0].id);

        const peerConnection = this.peerConnectionsManager.getConnectionWithSession(
            roomId,
            "subscriber",
        ).pc;
        this.logger.debug("waitUntilConnected...");
        await this.waitUntilConnected(peerConnection);

        this.logger.debug("setupReceiverTransform...");
        await this.e2eeTransformManager.setupReceiverTransform(receiver, publisherId);
        event.track.addEventListener(
            "ended",
            async () => await this.e2eeTransformManager.teardownReceiver(receiver),
        );

        this.listenerRegistry.dispatchTrack(roomId, event);
    }

    public async onSubscriptionUpdated(room: StreamRoomId, offer: Jsep): Promise<void> {
        this.peerConnectionReconfigureQueue.enqueue({
            room,
            jsep: offer,
        });
        try {
            await this.peerConnectionReconfigureQueue.processAll();
        } catch (e) {
            console.error("Error on onSubscriberAttached", e);
        }
    }

    private async reconfigureSingle(room: StreamRoomId, offer: Jsep): Promise<Jsep> {
        if (!this.configuration) {
            throw new Error("Configuration missing.");
        }
        const janusConnection = this.peerConnectionsManager.getConnectionWithSession(
            room,
            "subscriber",
        );
        const peerConnection = janusConnection.pc;
        this.logger.debug("SUBSCRIBER RECV OFFER FROM PUBLISHER: ", offer.sdp);
        this.logger.debug("1. Setting up remoteDescription...");

        if (!this.bootstrapDataChannel) {
            this.bootstrapDataChannel = peerConnection.createDataChannel("JanusDataChannel");
            this.bootstrapDataChannel.onerror = (e) => {
                console.error(e);
                throw new Error("Cannot initialize Bootstrap dataChannel");
            };
        }

        await peerConnection.setRemoteDescription(
            new RTCSessionDescription({ type: offer.type, sdp: offer.sdp }),
        );
        this.logger.debug("offer from Janus: ", JSON.stringify(offer, null, 2));

        this.logger.debug(
            "2. Creating an answer...",
            "peerConnection state",
            peerConnection.connectionState,
        );
        const answer = await peerConnection.createAnswer();

        this.logger.debug("3. Setting up localDescription...");
        await peerConnection.setLocalDescription(new RTCSessionDescription(answer));

        if (!answer.type || !answer.sdp) {
            throw new Error("createAnswer returned incomplete description");
        }
        const jsepAnswer: Jsep = { sdp: answer.sdp, type: answer.type };
        this.lastProcessedAnswer[room] = jsepAnswer;
        return jsepAnswer;
    }

    private async reconfigureSingleCreateOffer(room: StreamRoomId): Promise<Jsep> {
        if (!this.configuration) {
            throw new Error("Configuration missing.");
        }
        const janusConnection = this.peerConnectionsManager.getConnectionWithSession(
            room,
            "publisher",
        );
        const peerConnection = janusConnection.pc;

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(
            new RTCSessionDescription({ type: "offer", sdp: offer.sdp }),
        );

        if (!offer.type || !offer.sdp) {
            throw new Error("createOffer returned incomplete description");
        }
        return { sdp: offer.sdp, type: offer.type };
    }
}
