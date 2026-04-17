import {
    EncPair,
    JanusPluginHandle,
    JanusSession,
    QueueItem,
    SessionId,
} from "./WebRtcClientTypes";
import { WebWorker } from "./WebWorkerHelper";
import { WebRtcConfig } from "./WebRtcConfig";
import {
    Key,
    TurnCredentials,
    StreamHandle,
    RemoteStreamListener,
    DataChannelCryptorDecryptStatus,
} from "../Types";
import { KeyStore } from "./KeyStore";
import { Utils } from "./Utils";
import { PeerConnectionManager } from "./PeerConnectionsManager";
import { Logger } from "./Logger";
import { Jsep, StreamId, StreamRoomId } from "./types/ApiTypes";
import { Queue } from "./Queue";
import { LocalAudioLevelMeter } from "./audio/LocalAudioLevelMeter";
import { ActiveSpeakerDetector, DEFAULTS, SpeakerState } from "./audio/ActiveSpeakerDetector";
import { StateChangeDispatcher } from "./EventDispatcher";
import { StreamTrack } from "../service/StreamApi";
import { DataChannelCryptor, DataChannelCryptorError } from "./DataChannelCryptor";

export declare class RTCRtpScriptTransform {
    constructor(worker: any, options: any);
    transform: (frame: any, controller: any) => void;
}

export interface StreamsCallbackInterface {
    trickle(sessionId: SessionId, candidate: RTCIceCandidate): Promise<void>;
    acceptOffer(sessionId: SessionId, sdp: Jsep): Promise<void>;
}

export interface UserAudioStats {
    streamId: number;
    rms: number;
    active: boolean;
}

export interface WebRtcStateEvents {
    connected: { streamId: StreamId };
}

export interface AudioLevelsStats {
    levels: SpeakerState[];
}

type AudioLevelFuncCallback = (changes: AudioLevelsStats) => void;
export class WebRtcClient {
    public uniqId: string;
    private e2eeWorker: Worker | undefined;
    private webWorkerApi: WebWorker;
    private keyStore: KeyStore = new KeyStore();

    private configuration: RTCConfiguration | undefined;

    private publishStreamHandle: StreamHandle;

    // to moze byc uzyte kiedy wymagany jest update credentials (jak straca waznosc)
    private peerCredentials: TurnCredentials[] | undefined;

    private remoteStreamsListeners: Map<StreamRoomId, RemoteStreamListener[]> = new Map();
    private sequenceNumberByRemoteStreamId: Map<number, number> = new Map();
    private dataChannelByRemoteStreamId: Map<number, RTCDataChannel> = new Map();
    private dataChannelCryptor: DataChannelCryptor;
    private sequenceNumberOfSender: number;
    private peerConnectionsManager: PeerConnectionManager;
    private streamsApiInterface: StreamsCallbackInterface;
    private activeSpeakerDetector: ActiveSpeakerDetector;
    private audioLevelCallback: AudioLevelFuncCallback;

    // private mediaServerAvailPublishers: {[publisherId: number]: Publisher} = {};
    private encByReceiver = new WeakMap<RTCRtpReceiver, EncPair>();
    private logger: Logger = new Logger();

    private peerConnectionReconfigureQueue: Queue<QueueItem> | undefined;
    public lastProcessedAnswer: { [roomId: string]: Jsep } = {};
    private lastMeasuredLocalRMS: number = LocalAudioLevelMeter.RMS_VALUE_OF_SILENCE;
    private eventsDispatcher: StateChangeDispatcher = new StateChangeDispatcher();
    private localAudioLevelMeters: Map<string, LocalAudioLevelMeter> = new Map();

    private bootstrapDataChannel: RTCDataChannel | undefined;

    constructor(private assetsDir: string) {
        this.uniqId = Utils.getRandomString(8) + "-" + Utils.getRandomString(8);
        this.sequenceNumberOfSender = 1;
        this.peerConnectionsManager = new PeerConnectionManager(
            (roomId: StreamRoomId) => {
                return this.createPeerConnectionMultiForRoom(
                    roomId,
                    this.getPeerConnectionConfiguration(),
                );
            },
            (sessionId: SessionId, candidate: RTCIceCandidate) => {
                return this.streamsApiInterface.trickle(sessionId, candidate);
            },
        );
        this.peerConnectionReconfigureQueue = new Queue<QueueItem>();
        this.peerConnectionReconfigureQueue.assignProcessorFunc(async (_item: QueueItem) => {
            if (_item.jsep && _item.jsep.type === "offer") {
                await this.reconfigureSingle(_item._room, _item.jsep);
            } else {
                await this.reconfigureSingleCreateOffer(_item._room);
            }
        });

        this.activeSpeakerDetector = new ActiveSpeakerDetector(DEFAULTS);
        this.dataChannelCryptor = new DataChannelCryptor(this.keyStore);
    }

    private async ensureLocalAudioLevelMeter(track: MediaStreamTrack) {
        if (this.localAudioLevelMeters.has(track.id)) {
            return;
        }
        const worker = await this.getWorker();
        const meter = new LocalAudioLevelMeter(track, (onRms) => {
            const rmsToReport = track.enabled ? onRms : LocalAudioLevelMeter.RMS_VALUE_OF_SILENCE;
            worker.postMessage({ operation: "rms", rms: rmsToReport });
            this.lastMeasuredLocalRMS = onRms;
        });
        this.localAudioLevelMeters.set(track.id, meter);
        try {
            await meter.init(this.assetsDir + "/rms-processor.js");
        } catch (e) {
            this.localAudioLevelMeters.delete(track.id);
            meter.stop();
            throw e;
        }
    }

    private stopLocalAudioLevelMeter(track: MediaStreamTrack) {
        const meter = this.localAudioLevelMeters.get(track.id);
        if (!meter) {
            return;
        }
        this.localAudioLevelMeters.delete(track.id);
        meter.stop();
    }

    public setAudioLevelCallback(func: AudioLevelFuncCallback) {
        this.audioLevelCallback = func;
    }

    public bindApiInterface(streamsApiInterface: StreamsCallbackInterface) {
        this.streamsApiInterface = streamsApiInterface;
    }

    public addRemoteStreamListener(listener: RemoteStreamListener) {
        let listeners = this.remoteStreamsListeners.get(listener.streamRoomId) || [];

        const exists = listeners.find((x) => x.streamId === listener.streamId);
        if (exists) {
            throw new Error("RemoteStreamListener with given params already exists.");
        }

        listeners.push(listener);
        this.remoteStreamsListeners.set(listener.streamRoomId, listeners);
    }

    public getStreamStateChangeDispatcher() {
        return this.eventsDispatcher;
    }

    public getConnectionManager() {
        if (!this.peerConnectionsManager) {
            throw new Error("No peerConnectionManager initialized.");
        }
        return this.peerConnectionsManager;
    }

    public getWebRtcEventDispatcher() {
        return this.eventsDispatcher;
    }

    protected async getWorker(): Promise<Worker> {
        if (!this.e2eeWorker) {
            const workerApi = await this.getWorkerApi();
            this.e2eeWorker = workerApi.getWorker();
        }
        if (!this.e2eeWorker) {
            throw new Error("Worker not initialized.");
        }
        return this.e2eeWorker;
    }

    protected async initPipeline(receiverTrackId: string, publisherId: number): Promise<void> {
        const worker = await this.getWorker();
        const waitPromise = new Promise<void>((resolve) => {
            const listener = (ev: MessageEvent) => {
                if (ev.data.operation === "init-pipeline" && ev.data.id === receiverTrackId) {
                    worker.removeEventListener("message", listener);
                    resolve();
                }
            };
            worker.addEventListener("message", listener);
            worker.postMessage({
                operation: "init-pipeline",
                id: receiverTrackId,
                publisherId: publisherId,
            });
        });

        return waitPromise;
    }

    protected async getWorkerApi(): Promise<WebWorker> {
        if (!this.webWorkerApi) {
            this.webWorkerApi = new WebWorker(this.assetsDir, (frameInfo) => {
                if (this.audioLevelCallback && typeof this.audioLevelCallback === "function") {
                    // report local rms to activeSpeakerDetector to have notifications for local streams
                    this.activeSpeakerDetector.onFrame({
                        id: 0,
                        rms: this.lastMeasuredLocalRMS,
                        timestamp: Date.now(),
                    });
                    const speakers = this.activeSpeakerDetector.onFrame({
                        id: frameInfo.publisherId,
                        rms: frameInfo.rms,
                        timestamp: Date.now(),
                    });
                    // if (laudestParticipant === frameInfo.publisherId) {
                    this.audioLevelCallback({ levels: speakers });
                    // }
                }
            });
            await this.webWorkerApi.init_e2ee();
        }
        return this.webWorkerApi;
    }

    protected getPeerConnectionConfiguration(): RTCConfiguration {
        if (!this.configuration) {
            // throw new Error("No peerConnectionConfiguration created");
            this.configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);
        }
        return this.configuration;
    }

    async setTurnCredentials(turnCredentials: TurnCredentials[]) {
        this.peerCredentials = turnCredentials;
    }

    async createPeerConnectionWithLocalStream(
        streamHandle: StreamHandle,
        streamRoomId: StreamRoomId,
        stream?: MediaStream,
        dataTracks?: StreamTrack[],
    ): Promise<RTCPeerConnection> {
        this.publishStreamHandle = streamHandle;
        this.configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);

        const peerConnManager = this.getConnectionManager();
        peerConnManager.initialize(streamRoomId, "publisher");

        const pc = this.getConnectionManager().getConnectionWithSession(
            streamRoomId,
            "publisher",
        ).pc;

        if (stream.getTracks().length > 0) {
            const tracks = stream.getTracks();
            this.e2eeWorker = await this.getWorker();
            for (const track of tracks) {
                if (track.kind === "audio") {
                    // add RMSProcessor
                    await this.ensureLocalAudioLevelMeter(track);
                }

                const streamSender = pc.addTrack(track, stream);
                this.setupSenderTransform(streamSender);
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

    removeSenderPeerConnectionOnUnpublish(streamRoomId: StreamRoomId, stream: MediaStream) {
        const peerConnManager = this.getConnectionManager();
        const session = peerConnManager.getConnectionWithSession(streamRoomId, "publisher");
        for (const track of stream.getAudioTracks()) {
            this.stopLocalAudioLevelMeter(track);
        }
        session.pc.close();
        session.pc = undefined;
    }

    async updatePeerConnectionWithLocalStream(
        streamRoomId: StreamRoomId,
        localStream: MediaStream,
        tracksToAdd: MediaStreamTrack[],
        tracksToRemove: MediaStreamTrack[],
    ): Promise<RTCPeerConnection> {
        this.configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);
        const peerConnManager = this.getConnectionManager();
        peerConnManager.initialize(streamRoomId, "publisher");

        const pc = this.getConnectionManager().getConnectionWithSession(
            streamRoomId,
            "publisher",
        ).pc;

        if (tracksToAdd.length > 0) {
            this.e2eeWorker = await this.getWorker();

            for (const track of tracksToAdd) {
                if (track.kind === "audio") {
                    await this.ensureLocalAudioLevelMeter(track);
                }
                const videoSender = pc.addTrack(track, localStream);
                if ((window as any).RTCRtpScriptTransform) {
                    const options = {
                        operation: "encode",
                        kind: track.kind,
                    };
                    (videoSender as any).transform = new RTCRtpScriptTransform(
                        this.e2eeWorker,
                        options,
                    );
                } else {
                    const senderStreams = (videoSender as any).createEncodedStreams();
                    this.e2eeWorker.postMessage(
                        {
                            operation: "encode",
                            kind: track.kind,
                            readableStream: senderStreams.readable,
                            writableStream: senderStreams.writable,
                        },
                        [senderStreams.readable, senderStreams.writable],
                    );
                }
            }
        }
        if (tracksToRemove.length > 0) {
            const senders = pc.getSenders();
            for (const oldTrack of tracksToRemove) {
                if (oldTrack.kind === "audio") {
                    this.stopLocalAudioLevelMeter(oldTrack);
                }
                const sender = senders.find((s) => s.track === oldTrack);
                if (sender) {
                    pc.removeTrack(sender);
                }
            }
        }
        return pc;
    }

    async encryptDataChannelData(data: Uint8Array) {
        const nextSequenceNumber = ++this.sequenceNumberOfSender;
        return this.dataChannelCryptor.encryptToWireFormat({
            plaintext: data,
            sequenceNumber: nextSequenceNumber,
        });
    }

    private createPeerConnectionMultiForRoom(
        roomId: StreamRoomId,
        configuration: RTCConfiguration & { encodedInsertableStreams?: boolean },
        _handle?: JanusPluginHandle,
        _session?: JanusSession,
    ): RTCPeerConnection {
        const extConf = configuration;
        (extConf as any).encodedInsertableStreams = true;
        const connection = new RTCPeerConnection(extConf);

        // gethering state change
        connection.addEventListener("icegatheringstatechange", (event) => {
            this.logger.debug("on ice state change: ", event);
        });
        // ice candidate error
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
            this.eventsDispatcher.emit({
                streamHandle: this.publishStreamHandle,
                state: connection.connectionState,
            });
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
                        "Calling listener for dataChannel with values: ",
                        roomId,
                        remoteStreamId,
                        decrypted.data,
                        DataChannelCryptorDecryptStatus.OK,
                    );
                    this.callRegisteredListenersForDataChannel(
                        roomId,
                        remoteStreamId,
                        decrypted.data,
                        DataChannelCryptorDecryptStatus.OK,
                    );
                } catch (e) {
                    if (e instanceof DataChannelCryptorError) {
                        this.callRegisteredListenersForDataChannel(
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
            this.dataChannelByRemoteStreamId.set(Number(dc.label), dc);
        });

        connection.addEventListener("iceconnectionstatechange", (event) => {
            this.logger.debug("iceconnectionstatechange: ", event);
        });
        connection.addEventListener("negotiationneeded", async (_event) => {
            this.logger.debug("negotiationneeded: ", _event);
            // await this.startNegotiationMulti(roomId, (_event as any).target);
        });
        connection.addEventListener("signalingstatechange", (event) => {
            this.logger.debug("signalingstatechange: ", event);
        });
        connection.addEventListener("track", async (event) => {
            await this.addRemoteTrack(roomId, event);
        });
        return connection;
    }

    private async startNegotiationMulti(
        roomId: StreamRoomId,
        _rtcPeerConnection: RTCPeerConnection,
        _withIceRestart?: boolean,
    ) {
        try {
            if (!this.peerConnectionReconfigureQueue) {
                throw new Error("ReconfigureQueue does not exist.");
            }
            this.peerConnectionReconfigureQueue.enqueue({
                taskId: Utils.generateNumericId(),
                _room: roomId,
            });
            try {
                await this.peerConnectionReconfigureQueue.processAll();
            } catch (e) {
                console.error("Error on onSubscriberAttached", e);
            }
        } catch (e) {
            console.error("Error on startNegotiationMulti", e);
        }
    }

    async updateKeys(_streamRoomId: StreamRoomId, keys: Key[]) {
        this.logger.debug("=======> UPDATE KEYS", _streamRoomId, keys.length);
        await this.keyStore.setKeys(keys);
        await (await this.getWorkerApi()).setKeys(keys);
    }

    private setupSenderTransform(videoSender: RTCRtpSender) {
        if ((window as any).RTCRtpScriptTransform) {
            const options = {
                operation: "encode",
                kind: videoSender.track?.kind,
            };
            (videoSender as any).transform = new RTCRtpScriptTransform(this.e2eeWorker, options);
        } else {
            this.logger.debug("Worker - encoding frames using EncodedStreams");
            const senderStreams = (videoSender as any).createEncodedStreams();
            this.e2eeWorker.postMessage(
                {
                    operation: "encode",
                    kind: videoSender.track?.kind,
                    readableStream: senderStreams.readable,
                    writableStream: senderStreams.writable,
                },
                [senderStreams.readable, senderStreams.writable],
            );
        }
    }

    private async setupReceiverTransform(
        receiver: RTCRtpReceiver,
        publisherId: number,
        worker: Worker,
    ) {
        if ("RTCRtpScriptTransform" in window && !receiver.transform) {
            this.logger.debug("-> using RtpScriptTransform");
            const id = receiver.track.id;
            receiver.transform = new window.RTCRtpScriptTransform(worker, {
                operation: "decode",
                id,
                publisherId,
                kind: receiver.track.kind,
            });
            return;
        }
        this.logger.debug("-> using EncodedStreams");

        // Fallback: Encoded Streams
        if (
            !this.encByReceiver.has(receiver) &&
            "createEncodedStreams" in receiver &&
            typeof receiver.createEncodedStreams === "function"
        ) {
            this.logger.debug("-> call for createEncodedStreams()");
            const { readable, writable } = await receiver.createEncodedStreams();
            const enc = {
                readable,
                writable,
                id: receiver.track.id,
                publisherId: publisherId,
                posted: false,
            };
            this.encByReceiver.set(receiver, enc);

            this.logger.debug("-> posting EncodedStreams to worker (should happen only once)");

            await this.initPipeline(enc.id, enc.publisherId);

            worker.postMessage(
                {
                    operation: "decode",
                    id: enc.id,
                    publisherId: enc.publisherId,
                    kind: receiver.track.kind,
                    readableStream: enc.readable,
                    writableStream: enc.writable,
                },
                [enc.readable, enc.writable], // transfer ownership
            );
        } else {
            this.logger.debug("-> EncodedStreams posted to worker already.");
        }
    }

    private async waitUntilConnected(pc: RTCPeerConnection) {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed")
            return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
            const onChange = () => {
                if (
                    pc.iceConnectionState === "connected" ||
                    pc.iceConnectionState === "completed"
                ) {
                    // pc.removeEventListener('iceconnectionstatechange', onChange);
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

    private async teardownReceiver(receiver: RTCRtpReceiver, worker: Worker) {
        const enc = this.encByReceiver.get(receiver);
        if (enc) {
            worker.postMessage({ operation: "stop", id: enc.id });
            this.encByReceiver.delete(receiver);
        }
    }

    private async addRemoteTrack(roomId: StreamRoomId, event: RTCTrackEvent) {
        const worker = await this.getWorker();
        const track = event.track;
        const receiver = event.receiver;
        const publisherId = Number(event.streams[0].id);

        const peerConnection = this.getConnectionManager().getConnectionWithSession(
            roomId,
            "subscriber",
        ).pc;
        this.logger.debug("waitUntilConnected...");
        await this.waitUntilConnected(peerConnection);

        this.logger.debug("setupReceiverTransform...");
        await this.setupReceiverTransform(receiver, publisherId, worker);
        track.addEventListener("ended", async () => await this.teardownReceiver(receiver, worker));

        this.callRegisteredListeners(roomId, event);
    }

    private callRegisteredListeners(roomId: StreamRoomId, event: RTCTrackEvent) {
        const remoteStreamId = Number(event.streams[0].id);
        const listeners = this.remoteStreamsListeners.get(roomId);
        if (!listeners) {
            return;
        }
        const filteredListeners = listeners.filter(
            (x) => x.streamId === remoteStreamId || x.streamId === undefined,
        );
        for (const listener of filteredListeners) {
            if (
                listener.onRemoteStreamTrack &&
                typeof listener.onRemoteStreamTrack === "function"
            ) {
                listener.onRemoteStreamTrack(event);
            }
        }
    }

    private callRegisteredListenersForDataChannel(
        roomId: StreamRoomId,
        remoteStreamId: number,
        data: Uint8Array,
        statusCode: number,
    ) {
        const listeners = this.remoteStreamsListeners.get(roomId);
        if (!listeners || listeners.length === 0) {
            return;
        }
        const filteredListeners = listeners.filter(
            (x) => x.streamId === remoteStreamId || x.streamId === undefined,
        );
        for (const listener of filteredListeners) {
            if (listener.onRemoteData && typeof listener.onRemoteData === "function") {
                listener.onRemoteData(data, statusCode);
            }
        }
    }

    public async onSubscriptionUpdated(_room: StreamRoomId, offer: Jsep) {
        if (!this.peerConnectionReconfigureQueue) {
            throw new Error("ReconfigureQueue does not exist.");
        }
        this.peerConnectionReconfigureQueue.enqueue({
            taskId: Utils.generateNumericId(),
            _room,
            jsep: offer,
        });
        try {
            await this.peerConnectionReconfigureQueue.processAll();
        } catch (e) {
            console.error("Error on onSubscriberAttached", e);
        }
    }

    public async onSubscriptionUpdatedSingle(_room: StreamRoomId, offer: any) {
        return this.reconfigureSingle(_room, offer);
    }

    private async reconfigureSingle(room: StreamRoomId, offer: Jsep): Promise<Jsep> {
        if (!this.configuration) {
            throw new Error("Configuration missing.");
        }
        const janusConnection = this.getConnectionManager().getConnectionWithSession(
            room,
            "subscriber",
        );
        const peerConnection = janusConnection.pc;
        this.logger.debug("SUBSCRIBER RECV OFFER FROM PUBLISHER: ", offer.sdp);
        this.logger.debug("1. Setting up remoteDescription...");

        if (!this.bootstrapDataChannel) {
            const bootstrap = peerConnection.createDataChannel("JanusDataChannel");
            bootstrap.onerror = (e) => {
                console.error(e);
                throw new Error("Cannot initialize Bootrstrap dataChannel");
            };
        }

        await peerConnection.setRemoteDescription(
            new RTCSessionDescription({ type: offer.type as RTCSdpType, sdp: offer.sdp }),
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

        // this.subscriberAttachedProcessing = false
        this.lastProcessedAnswer[room] = answer as Jsep;
        return answer as Jsep;
    }

    private async reconfigureSingleCreateOffer(room: StreamRoomId): Promise<Jsep> {
        if (!this.configuration) {
            throw new Error("Configuration missing.");
        }
        const janusConnection = this.getConnectionManager().getConnectionWithSession(
            room,
            "publisher",
        );
        const peerConnection = janusConnection.pc;

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(
            new RTCSessionDescription({ type: "offer", sdp: offer.sdp }),
        );

        return offer as Jsep;
    }
}
