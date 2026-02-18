import {
    EncPair,
    JanusPluginHandle,
    JanusSession,
    QueueItem,
    SessionId,
} from "./WebRtcClientTypes";
import { WebWorker } from "./WebWorkerHelper";
import { WebRtcConfig } from "./WebRtcConfig";
import { Key, TurnCredentials, StreamHandle, RemoteStreamListener } from "../Types";
import { KeyStore } from "./KeyStore";
import { PeerConnectionManager } from "./PeerConnectionsManager";
import { Logger } from "./Logger";
import { StreamId, StreamRoomId } from "./types/ApiTypes";
import { Queue } from "./Queue";
import { Jsep } from "../service/WebRtcInterface";
import { LocalAudioLevelMeter } from "./audio/LocalAudioLevelMeter";
import { ActiveSpeakerDetector, DEFAULTS, SpeakerState } from "./audio/ActiveSpeakerDetector";
import { StateChangeDispatcher } from "../service/EventDispatcher";

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

    private dataChannels: RTCDataChannel[] = [];

    private configuration: RTCConfiguration | undefined;
    private keyStore: KeyStore = new KeyStore();

    private publishStreamHandle: StreamHandle;

    // to moze byc uzyte kiedy wymagany jest update credentials (jak straca waznosc)
    private peerCredentials: TurnCredentials[] | undefined;

    private remoteStreamsListeners: Map<StreamRoomId, RemoteStreamListener[]> = new Map();
    private peerConnectionsManager: PeerConnectionManager;
    private streamsApiInterface: StreamsCallbackInterface;
    private activeSpeakerDetector: ActiveSpeakerDetector;
    private audioLevelCallback: AudioLevelFuncCallback;

    // private mediaServerAvailPublishers: {[publisherId: number]: Publisher} = {};
    private encByReceiver = new WeakMap<RTCRtpReceiver, EncPair>();
    private logger: Logger = Logger.get();

    private peerConnectionReconfigureQueue: Queue<QueueItem> | undefined;
    public lastProcessedAnswer: { [roomId: string]: Jsep } = {};
    private lastMeasuredLocalRMS: number = -99;
    private eventsDispatcher: StateChangeDispatcher = new StateChangeDispatcher();

    constructor(private assetsDir: string) {
        this.uniqId = "" + Math.random() + "-" + Math.random();
        console.log(
            "WebRtcClient constructor (" + this.uniqId + ")",
            "assetsDir: ",
            this.assetsDir,
        );
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
            // await this.reconfigure(_item);
            await this.reconfigureSingle(_item._room, _item.offer);
        });

        this.activeSpeakerDetector = new ActiveSpeakerDetector(DEFAULTS);
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

    protected getEncKey(): Key {
        return this.keyStore.getEncriptionKey();
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
            console.log("Init e2ee worker ...");
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
        stream: MediaStream,
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
                    const audioLevelMeter = await new LocalAudioLevelMeter(track, (onRms) => {
                        this.e2eeWorker.postMessage({ operation: "rms", rms: onRms });
                        this.lastMeasuredLocalRMS = onRms;
                    }).init(this.assetsDir + "/rms-processor.js");
                }

                const streamSender = pc.addTrack(track, stream);
                this.setupSenderTransform(streamSender);
            }
        }
        return pc;
    }

    removeSenderPeerConnectionOnUnpublish(streamRoomId: StreamRoomId, _stream: MediaStream) {
        const peerConnManager = this.getConnectionManager();
        const session = peerConnManager.getConnectionWithSession(streamRoomId, "publisher");
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
                const videoSender = pc.addTrack(track, localStream);
                if ((window as any).RTCRtpScriptTransform) {
                    const options = {
                        operation: "encode",
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
                const sender = senders.find((s) => s.track === oldTrack);
                if (sender) {
                    pc.removeTrack(sender);
                }
            }
        }
        return pc;
    }

    // private async onSubscriberAttached(eventData: SignalingFromServer.SubscriberAttached) {
    // console.log("============> onSubscriberAttached",eventData);
    // // const peerCredentials = await (await this.getAppServerChannel()).requestCredentials();

    // // const configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);
    // if (!this.configuration) {
    //     throw new Error("Configuration missing.");
    // }
    // console.log("-----> onSubscriberAttached", {room: eventData.room, streams: eventData.streams});
    // this.receiverPeerConnection = this.createPeerConnectionMulti(this.configuration);
    // const peerConnection = this.receiverPeerConnection;

    // console.log("-----> setting up remote subscriber offer as remoteDescription", eventData.offer);
    // await peerConnection.setRemoteDescription(new RTCSessionDescription(eventData.offer));
    // console.log("----------> creating answer for remote offer..");

    // const dataStreams = eventData.streams.filter(x => x.type === "data");
    // for (const x of dataStreams) {
    //     console.log("============> Creating dataChannel handler..." + x.mid);
    //     peerConnection.createDataChannel("JanusDataChannel/" + x.mid);
    // }
    // const answer = await peerConnection.createAnswer();

    // await peerConnection.setLocalDescription(answer);

    // await this.signalingApi?.acceptOffer(eventData.session_id, eventData.handle, answer);
    // }

    private createPeerConnectionMultiForRoom(
        roomId: StreamRoomId,
        configuration: RTCConfiguration & { encodedInsertableStreams?: boolean },
        _handle?: JanusPluginHandle,
        _session?: JanusSession,
    ): RTCPeerConnection {
        this.logger.log("info", "createPeerConnectionMulti");
        const extConf = configuration;
        (extConf as any).encodedInsertableStreams = true;
        this.logger.log("info", "extConf", extConf);
        const connection = new RTCPeerConnection(extConf);

        // gethering state change
        connection.addEventListener("icegatheringstatechange", (event) => {
            this.logger.log("info", "on ice state change: ", event);
        });
        // ice candidate error
        connection.addEventListener("icecandidateerror", (event) => {
            this.logger.log("info", "on ice error: ", event);
        });
        connection.addEventListener("connectionstatechange", (event) => {
            this.logger.log("info", "connectionstatechange: ", event);
            if (connection.connectionState === "connected") {
                this.logger.log("important-only", "Peers connected!");
            } else {
                this.logger.log("info", "connection state: ", connection.connectionState);
            }
            this.eventsDispatcher.emit({
                streamHandle: this.publishStreamHandle,
                state: connection.connectionState,
            });
        });
        connection.addEventListener("datachannel", (event) => {
            this.logger.log("info", "datachannel: ", event);
            const recvChannel = event.channel;
            this.addDataChannel(recvChannel);
        });

        connection.addEventListener("iceconnectionstatechange", (event) => {
            this.logger.log("info", "iceconnectionstatechange: ", event);
        });
        connection.addEventListener("negotiationneeded", async (event) => {
            this.logger.log("info", "negotiationneeded: ", event);
            // await this.startNegotiationMulti(connection);
        });
        connection.addEventListener("signalingstatechange", (event) => {
            this.logger.log("info", "signalingstatechange: ", event);
        });
        connection.addEventListener("track", async (event) => {
            await this.addRemoteTrack(roomId, event /*, mappedPublisher*/);
        });

        return connection;
    }

    private async startNegotiationMulti(
        rtcPeerConnection: RTCPeerConnection,
        withIceRestart?: boolean,
    ) {
        try {
            console.log("[startNegotiationMulti]", "Create offer...");
            const offer = await rtcPeerConnection.createOffer({ iceRestart: withIceRestart });
            console.log("setLocalDescription on startNegotiationMulti");
            await rtcPeerConnection.setLocalDescription(offer);
        } catch (e) {
            console.error("Error on startNegotiationMulti", e);
        }
    }

    createDataChannel(_name: string) {
        // const channel = this.getSenderActivePeerConnection().createDataChannel(name);
        // this.addDataChannel(channel);
    }

    private addDataChannel(dataChannel: RTCDataChannel) {
        console.log("on addDataChannel", dataChannel);
        dataChannel.addEventListener("open", () => {
            console.log("Data channel opened.");
        });
        dataChannel.addEventListener("close", () => {
            console.log("Data channel closed.");
        });
        dataChannel.addEventListener("error", (err) => {
            console.log("Data channel error", err);
        });
        this.dataChannels.push(dataChannel);
    }

    async sendToChannel(name: string, message: string) {
        const channel = this.dataChannels.find((x) => x.label === name);
        if (!channel || channel.readyState !== "open") {
            console.error("Cannot find open channel by given name");
            return;
        }
        channel.send(message);
        console.log("Message sent!");
    }

    async updateKeys(_streamRoomId: StreamRoomId, keys: Key[]) {
        this.keyStore.setKeys(keys);

        // propagate keys to the worker
        (await this.getWorkerApi()).setKeys(keys);
    }

    /// INSERTABLE STREAMS

    private setupSenderTransform(videoSender: RTCRtpSender) {
        if ((window as any).RTCRtpScriptTransform) {
            this.logger.log(
                "important-only",
                "Worker - encoding frames using RTCRtpScriptTransform",
            );
            const options = {
                operation: "encode",
            };
            (videoSender as any).transform = new RTCRtpScriptTransform(this.e2eeWorker, options);
        } else {
            this.logger.log("important-only", "Worker - encoding frames using EncodedStreams");
            const senderStreams = (videoSender as any).createEncodedStreams();
            this.e2eeWorker.postMessage(
                {
                    operation: "encode",
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
            this.logger.log("important-only", "-> using RtpScriptTransform");
            const id = receiver.track.id;
            receiver.transform = new window.RTCRtpScriptTransform(worker, {
                operation: "decode",
                id,
                publisherId,
            });
            return;
        }
        this.logger.log("important-only", "-> using EncodedStreams");

        // Fallback: Encoded Streams
        if (
            !this.encByReceiver.has(receiver) &&
            "createEncodedStreams" in receiver &&
            typeof receiver.createEncodedStreams === "function"
        ) {
            this.logger.log("important-only", "-> call for createEncodedStreams()");
            const { readable, writable } = await receiver.createEncodedStreams();
            const enc = {
                readable,
                writable,
                id: receiver.track.id,
                publisherId: publisherId,
                posted: false,
            };
            this.encByReceiver.set(receiver, enc);

            this.logger.log(
                "important-only",
                "-> posting EncodedStreams to worker (should happen only once)",
            );

            await this.initPipeline(enc.id, enc.publisherId);

            worker.postMessage(
                {
                    operation: "decode",
                    id: enc.id,
                    publisherId: enc.publisherId,
                    readableStream: enc.readable,
                    writableStream: enc.writable,
                },
                [enc.readable, enc.writable], // transfer ownership
            );
        } else {
            this.logger.log("important-only", "-> EncodedStreams posted to worker already.");
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

    private async addRemoteTrack(
        roomId: StreamRoomId,
        event: RTCTrackEvent /*, mappedPublisher: Publisher*/,
    ) {
        const worker = await this.getWorker();
        const track = event.track;
        const receiver = event.receiver;
        const publisherId = Number(event.streams[0].id);
        const key = this.getEncKey();

        const peerConnection = this.getConnectionManager().getConnectionWithSession(
            roomId,
            "subscriber",
        ).pc;
        this.logger.log("important-only", "waitUntilConnected...");
        await this.waitUntilConnected(peerConnection);

        this.logger.log("important-only", "setupReceiverTransform...");
        await this.setupReceiverTransform(receiver, publisherId, worker);
        track.addEventListener("ended", async () => await this.teardownReceiver(receiver, worker));

        this.callRegisteredListeners(roomId, event);
    }

    private callRegisteredListeners(roomId: StreamRoomId, event: RTCTrackEvent) {
        const remoteStreamId = Number(event.streams[0].id);
        const listeners = this.remoteStreamsListeners.get(roomId);
        if (!listeners) {
            this.logger.log("info", "No remoteTrack listener registered for room: " + roomId);
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

    // test
    public async onSubscriptionUpdated(_room: StreamRoomId, offer: any) {
        if (!this.peerConnectionReconfigureQueue) {
            throw new Error("ReconfigureQueue does not exist.");
        }
        this.peerConnectionReconfigureQueue.enqueue({
            taskId: Math.floor(1 + Math.random() * 10000),
            _room,
            offer,
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

        this.logger.log("important-only", "1. Setting up remoteDescription...");
        await peerConnection.setRemoteDescription(
            new RTCSessionDescription({ type: offer.type as RTCSdpType, sdp: offer.sdp }),
        );
        this.logger.log("important-only", "offer from Janus: ", JSON.stringify(offer, null, 2));

        this.logger.log(
            "important-only",
            "2. Creating an answer...",
            "peerConnection state",
            peerConnection.connectionState,
        );
        const answer = await peerConnection.createAnswer();

        this.logger.log("important-only", "3. Setting up localDescription...");
        await peerConnection.setLocalDescription(new RTCSessionDescription(answer));

        // this.subscriberAttachedProcessing = false
        this.lastProcessedAnswer[room] = answer as Jsep;
        return answer as Jsep;
    }
}
