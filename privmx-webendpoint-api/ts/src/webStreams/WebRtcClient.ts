
import { EncPair, InitOptions, JanusPluginHandle, JanusSession, QueueItem, RemoteStreamListener, SessionId } from "./WebRtcClientTypes";
import { WebWorker } from "./WebWorkerHelper";
import { WebRtcConfig } from "./WebRtcConfig";
import { Key, TurnCredentials } from "../Types";
import { KeyStore } from "./KeyStore";
import { PeerConnectionManager } from "./PeerConnectionsManager";
import { Logger } from "./Logger";
import { StreamRoomId } from "./types/ApiTypes";
import { Queue } from "./Queue";
import { Jsep } from "../service/WebRtcInterface";


export declare class RTCRtpScriptTransform {
    constructor(worker: any, options: any);
    transform: (frame: any, controller: any) => void;
}

export interface StreamsCallbackInterface {
    trickle(sessionId: SessionId, candidate: RTCIceCandidate): Promise<void>;
    acceptOffer(sessionId: SessionId, sdp: Jsep): Promise<void>;
} 
export class WebRtcClient {
    public uniqId: string;
    private receiverPeerConnection: RTCPeerConnection|undefined;

    private iceCandidates: RTCIceCandidate[] = [];
    private e2eeWorker: Worker | undefined;
    private webWorkerApi: WebWorker;

    private dataChannels: RTCDataChannel[] = [];

    private configuration: RTCConfiguration|undefined;
    private keyStore: KeyStore = new KeyStore();
    
    // to moze byc uzyte kiedy wymagany jest update credentials (jak straca waznosc)
    private clientId: string | undefined;
    private peerCredentials: TurnCredentials[]|undefined;
    private initOptions: InitOptions | undefined;

    private onRemoteTrackListeners: {[roomId: StreamRoomId]: RemoteStreamListener} = {};
    private peerConnectionsManager: PeerConnectionManager;
    private streamsApiInterface: StreamsCallbackInterface;

    // private mediaServerAvailPublishers: {[publisherId: number]: Publisher} = {};
    private encByReceiver = new WeakMap<RTCRtpReceiver, EncPair>();
    private logger: Logger = Logger.get();

    private peerConnectionReconfigureQueue: Queue<QueueItem> | undefined;
    // private subscriberAttachedProcessing: boolean = false;

    constructor(private assetsDir: string) {
        this.uniqId = "" + Math.random() + "-" + Math.random();
        console.log("WebRtcClient constructor ("+this.uniqId+")", "assetsDir: ", this.assetsDir);
        this.peerConnectionsManager = new PeerConnectionManager(
            (roomId: StreamRoomId) => {
                return this.createPeerConnectionMultiForRoom(roomId, this.getPeerConnectionConfiguration());
            },
            (sessionId: SessionId, candidate: RTCIceCandidate) => {
                return this.streamsApiInterface.trickle(sessionId, candidate);
            }
        )
        this.peerConnectionReconfigureQueue = new Queue<QueueItem>();
        this.peerConnectionReconfigureQueue.assignProcessorFunc(async(_item: QueueItem) => {
            // await this.reconfigure(_item);
        });
    }

    public bindApiInterface(streamsApiInterface: StreamsCallbackInterface) {
        this.streamsApiInterface = streamsApiInterface;
    }


    public addRemoteStreamListener(roomId: StreamRoomId, listener: RemoteStreamListener) {
        if (roomId in this.onRemoteTrackListeners) {
            return;
        }
        this.onRemoteTrackListeners[roomId] = listener;
    }

    public getConnectionManager() {
        if (!this.peerConnectionsManager) {
            throw new Error("No peerConnectionManager initialized.");
        }
        return this.peerConnectionsManager;
    }

    protected getEncKey() : Key {
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

    protected async initPipeline(receiverTrackId: string): Promise<void> {
        const worker = await this.getWorker();
        const waitPromise = new Promise<void>(resolve => {
            const listener = (ev: MessageEvent) => {
                if (ev.data.operation === 'init-pipeline' && ev.data.id === receiverTrackId) {
                    worker.removeEventListener('message', listener);
                    resolve();
                }
            };
            worker.addEventListener('message', listener);
            worker.postMessage({operation: "init-pipeline", id: receiverTrackId});
        });

        return waitPromise;
    }

    protected async getWorkerApi(): Promise<WebWorker> {
        if (!this.webWorkerApi) {
            this.webWorkerApi = new WebWorker(this.assetsDir);
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

    // async recreateAndGetReceiverPeerConnection() {
    //     this.receiverPeerConnection = this.createPeerConnectionMulti(this.configuration);
    //     return this.receiverPeerConnection;
    // }

    async setTurnCredentials(turnCredentials: TurnCredentials[]) {
        this.peerCredentials = turnCredentials;
    }

    // async createPeerConnectionWithLocalStream(stream: MediaStream): Promise<RTCPeerConnection> {
    //     // this.peerCredentials = await (await this.getAppServerChannel()).requestCredentials();
    //     this.configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);

    //     this.senderPeerConnection = this.createPeerConnectionMulti(this.configuration);
    //     this.receiverPeerConnection = this.createPeerConnectionMulti(this.configuration);
    //     console.log("=========> peerConnection multi created.", this.uniqId);
    //     if (stream.getTracks().length > 0) {
    //         const [track] = stream.getTracks();
    //         console.log("adding track to peerConnection...");
    //         const videoSender = this.senderPeerConnection.addTrack(track, stream);
    //         this.e2eeWorker = await this.getWorker();
    
    //         console.log("this.e2eeWorker", this.e2eeWorker);

    //         if ((window as any).RTCRtpScriptTransform) {
    //             const options = {
    //                 operation: 'encode',
    //             };
    //             console.log("======> set e2ee worker for frame encoding (RTCRtpScriptTransform).");
    //             (videoSender as any).transform = new RTCRtpScriptTransform(this.e2eeWorker, options);
    //         } else {

    //             const senderStreams = (videoSender as any).createEncodedStreams();
    //             console.log("post 'encode' frame to the e2ee worker..");
    //             this.e2eeWorker.postMessage({
    //                 operation: 'encode',
    //                 readableStream: senderStreams.readable,
    //                 writableStream: senderStreams.writable,
    //             }, [ senderStreams.readable, senderStreams.writable ]);
    //         }
    
    //         console.log("Transform streams added.")
    //     }
    //     console.log("Created peerConnection with configuration: ", this.senderPeerConnection.getConfiguration(), "and clientId: ", this.clientId);
    //     return this.senderPeerConnection;
    // }

    async createPeerConnectionWithLocalStream(streamRoomId: StreamRoomId, stream: MediaStream): Promise<RTCPeerConnection> {
        // this.peerCredentials = await (await this.getAppServerChannel()).requestCredentials();
        this.configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);

        const peerConnManager = this.getConnectionManager();
        peerConnManager.initialize(streamRoomId, "publisher");

        const pc = this.getConnectionManager().getConnectionWithSession(streamRoomId, "publisher").pc;

        // this.receiverPeerConnection = this.createPeerConnectionMulti(this.configuration);
        console.log("=========> peerConnection multi created.", this.uniqId);
        if (stream.getTracks().length > 0) {
            const tracks = stream.getTracks();
            this.e2eeWorker = await this.getWorker();

            console.log("adding track to peerConnection...");
            for (const track of tracks) {
                const videoSender = pc.addTrack(track, stream);

                if ((window as any).RTCRtpScriptTransform) {
                    const options = {
                        operation: 'encode',
                    };
                    console.log("======> set e2ee worker for frame encoding (RTCRtpScriptTransform).");
                    (videoSender as any).transform = new RTCRtpScriptTransform(this.e2eeWorker, options);
                } else {

                    const senderStreams = (videoSender as any).createEncodedStreams();
                    console.log("post 'encode' frame to the e2ee worker..");
                    this.e2eeWorker.postMessage({
                        operation: 'encode',
                        readableStream: senderStreams.readable,
                        writableStream: senderStreams.writable,
                    }, [ senderStreams.readable, senderStreams.writable ]);
                }

            }
            
            
    
            console.log("this.e2eeWorker", this.e2eeWorker);


    
            console.log("Transform streams added.")
        }
        return pc;
    }

    async updatePeerConnectionWithLocalStream(streamRoomId: StreamRoomId, newStream: MediaStream, tracksToRemove: MediaStreamTrack[]): Promise<RTCPeerConnection> {
        this.configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);
        const peerConnManager = this.getConnectionManager();
        peerConnManager.initialize(streamRoomId, "publisher");

        const pc = this.getConnectionManager().getConnectionWithSession(streamRoomId, "publisher").pc;

        if (newStream.getTracks().length > 0) {
            const tracks = newStream.getTracks();
            this.e2eeWorker = await this.getWorker();
            
            console.log("adding track to peerConnection...");
            for (const track of tracks) {
                const videoSender = pc.addTrack(track, newStream);

                if ((window as any).RTCRtpScriptTransform) {
                    const options = {
                        operation: 'encode',
                    };
                    console.log("======> set e2ee worker for frame encoding (RTCRtpScriptTransform).");
                    (videoSender as any).transform = new RTCRtpScriptTransform(this.e2eeWorker, options);
                } else {

                    const senderStreams = (videoSender as any).createEncodedStreams();
                    console.log("post 'encode' frame to the e2ee worker..");
                    this.e2eeWorker.postMessage({
                        operation: 'encode',
                        readableStream: senderStreams.readable,
                        writableStream: senderStreams.writable,
                    }, [ senderStreams.readable, senderStreams.writable ]);
                }
            }

            // remove marked tracks
            const senders = pc.getSenders();
            for (const oldTrack of tracksToRemove) {
                const sender = senders.find(s => s.track === oldTrack);
                if (sender) {
                    pc.removeTrack(sender);
                }
            }
        }
        return pc;
    }

    // public async createPeerConnectionOnJoin(peerCredentials: TurnCredentials[]) {
    //     const configuration = WebRtcConfig.generateTurnConfiguration(peerCredentials);
    //     this.receiverPeerConnection = this.createPeerConnectionMulti(configuration);
    // }

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

    // private async createAppServerChannel(): Promise<AppServerChannel> {
    //     const appServerChannel = new AppServerChannel({
    //         serverAddress: WebRtcConfig.getAppServerAddress(),
    //         onResponse: async (data: Message) => {
    //             if (data.kind === "credentials") {
    //                 console.log("on data in crate AppServerChannel(): creadentials", data);
    //                 await this.updatePeerConnectionCredentialsOnEvent(data.data);
    //             }
    //         },
    //         onEvent: async (data: any) => await this.onAppServerSignalingEvent(data)
    //     });
    //     this.clientId = await appServerChannel.connect();
    //     return appServerChannel;
    // }

    private async updatePeerConnectionCredentialsOnEvent(_credentials: TurnCredentials[]) {
        // console.log("updatePeerConnectionCredentialsOnEvent...");
        // this.peerCredentials = credentials;
        // const peerConnection = this.getActivePeerConnection();
        // if (peerConnection) {
        //     const newConfiguration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);
        //     peerConnection.setConfiguration(newConfiguration);
        //     this.startNegotiationMulti(true);
        // }
        // console.log("PeerConnection and peerCredentials after update", this.peerConnection, this.peerCredentials);
    }

    // private createPeerConnectionMulti(configuration: RTCConfiguration & {encodedInsertableStreams?: boolean}): RTCPeerConnection {
    //     console.log("createPeerConnectionMulti...");
    //     const extConf = configuration || this.getPeerConnectionConfiguration();
    //     if (!extConf) {
    //         throw new Error("No configuration available!");
    //     }
    //     (extConf as any).encodedInsertableStreams = true;
    //     console.log("extConf", extConf);
    //     const connection = new RTCPeerConnection(extConf);
    //     // Listen for local ICE candidates on the local RTCPeerConnection
    //     connection.addEventListener('icecandidate', event => {
    //         // console.log("on peerConnection new iceCandidate: ", event);
    //         if (event.candidate) {
    //             // signalingChannel.send({'iceCandidate': event.candidate});
    //             this.iceCandidates.push(event.candidate);
    //         }
    //     });
    //     // gethering state change
    //     connection.addEventListener('icegatheringstatechange', event => {
    //         console.log("on ice state change: ", event);
    //     });
    //     // ice candidate error
    //     connection.addEventListener('icecandidateerror', event => {
    //         console.warn("on ice error: ", event);
    //     });
    //     connection.addEventListener('connectionstatechange', event => {
    //         console.log("connectionstatechange: ", event);
    //         if (connection.connectionState === "connected") {
    //             console.log("Peers connected!");
    //         } else {
    //             console.log("connection state: ", connection.connectionState);
    //         }
    //     });
    //     connection.addEventListener('datachannel', event => {
    //         console.log("=================> datachannel: ", event);
    //         const recvChannel = event.channel;
    //         this.addDataChannel(recvChannel);
    //     });
        
    //     connection.addEventListener('iceconnectionstatechange', event => {
    //         console.log("iceconnectionstatechange: ", event);
    //     });
    //     connection.addEventListener('negotiationneeded', event => {
    //         console.log("negotiationneeded: ", event);
    //         this.startNegotiationMulti(connection);
    //         console.warn("negotiationneeded call... ignored for now but has to be implemented.")
    //     });
    //     connection.addEventListener('signalingstatechange', event => {
    //         console.log("signalingstatechange: ", event);
    //     });
    //     connection.addEventListener('track', event => {
    //         console.log("track: ", event);
    //         this.addRemoteTrack(event);
    //     });
    //     console.log("2");
    //     return connection;
    // }


    private createPeerConnectionMultiForRoom(roomId: StreamRoomId, configuration: RTCConfiguration & {encodedInsertableStreams?: boolean}, _handle?: JanusPluginHandle, _session?: JanusSession): RTCPeerConnection {
        this.logger.log("info", "createPeerConnectionMulti");
        const extConf = configuration;
        (extConf as any).encodedInsertableStreams = true;
        this.logger.log("info", "extConf", extConf);
        const connection = new RTCPeerConnection(extConf);

        // Listen for local ICE candidates on the local RTCPeerConnection
        // connection.addEventListener('icecandidate', event => {
        //     if (event.candidate) {
        //         this.logger.log("info", "on peerConnection new iceCandidate: ", event);
        //         if (handle && session) {
        //             try {
        //                 // this.mediaServerChannel?.trickle(session, handle, event.candidate);
        //                 this.streamsApiInterface.trickle(session.id, event.candidate);
        //             } catch (e) {
        //                 // fallback: push to array
        //                 this.iceCandidates.push(event.candidate);
        //             }
        //         } else {
        //             this.iceCandidates.push(event.candidate);
        //         }
        //     }
        // });


        // gethering state change
        connection.addEventListener('icegatheringstatechange', event => {
            this.logger.log("info", "on ice state change: ", event);
        });
        // ice candidate error
        connection.addEventListener('icecandidateerror', event => {
            this.logger.log("info", "on ice error: ", event);
        });
        connection.addEventListener('connectionstatechange', event => {
            this.logger.log("info", "connectionstatechange: ", event);
            if (connection.connectionState === "connected") {
                this.logger.log("important-only", "Peers connected!");
            } else {
                this.logger.log("info", "connection state: ", connection.connectionState);
            }
        });
        connection.addEventListener('datachannel', event => {
            this.logger.log("info", "datachannel: ", event);
            const recvChannel = event.channel;
            this.addDataChannel(recvChannel);
        });
        
        connection.addEventListener('iceconnectionstatechange', event => {
            this.logger.log("info", "iceconnectionstatechange: ", event);
        });
        connection.addEventListener('negotiationneeded', async event => {
            this.logger.log("info", "negotiationneeded: ", event);
            await this.startNegotiationMulti(connection);
        });
        connection.addEventListener('signalingstatechange', event => {
            this.logger.log("info", "signalingstatechange: ", event);
        });
        connection.addEventListener('track', async event => {
            // const mappedPublisher = this.getPublishers().find(publisher => publisher.id.toString() === event.streams[0].id);
            // if (!mappedPublisher) {
            //     throw new Error("Cannot match new remote track event with any known publisher..");
            // }
            console.group("Adding remote track of publisher", event/*, mappedPublisher*/);
            await this.addRemoteTrack(roomId, event/*, mappedPublisher*/);
        });

        return connection;
    }

    // protected getPublishers(): Publisher[] {
    //     const publishers: Publisher[] = [];
    //     for (const [_key, value] of Object.entries(this.mediaServerAvailPublishers)) {
    //         publishers.push(value);
    //     }
    //     return publishers;
    // }


    // public getSenderActivePeerConnection(): RTCPeerConnection {
    //     if (!this.senderPeerConnection) {
    //         throw new Error("PeerConnection not initialized! " + this.uniqId);
    //     }
    //     return this.senderPeerConnection;
    // }
    // public getReceiverActivePeerConnection(): RTCPeerConnection {
    //     if (!this.receiverPeerConnection) {
    //         throw new Error("Receiver PeerConnection not initialized!");
    //     }
    //     return this.receiverPeerConnection;
    // }

    private async startNegotiationMulti(rtcPeerConnection: RTCPeerConnection, withIceRestart?: boolean) {
        try {
            console.log("[startNegotiationMulti]","Create offer...");
            const offer = await rtcPeerConnection.createOffer({iceRestart: withIceRestart});
            console.log("setLocalDescription on startNegotiationMulti");
            await rtcPeerConnection.setLocalDescription(offer);
        } catch(e) {
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
        dataChannel.addEventListener("error", err => {
            console.log("Data channel error", err);
        });
        this.dataChannels.push(dataChannel);
    }

    async sendToChannel(name: string, message: string) {
        const channel = this.dataChannels.find(x => x.label === name);
        if (! channel || channel.readyState !== "open") {
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

    private async setupReceiverTransform(receiver: RTCRtpReceiver, worker: Worker) {
        console.group("on setupReceiverTransform");
        if ('RTCRtpScriptTransform' in window && !(receiver as any).transform) {
            this.logger.log("important-only", "-> using RtpScriptTransform");
            const id = (receiver as any).track.id;
            (receiver as any).transform = new (window as any).RTCRtpScriptTransform(worker, { operation: 'decode', id });
            console.groupEnd();
            return;
        }
        this.logger.log("important-only", "-> using EncodedStreams");

        // Fallback: Encoded Streams
        if (!this.encByReceiver.has(receiver)) {
            this.logger.log("important-only", "-> call for createEncodedStreams()");
            const { readable, writable } = await (receiver as any).createEncodedStreams();
            const enc = { readable, writable, id: (receiver as any).track.id, posted: false };
            this.encByReceiver.set(receiver, enc);
            
            this.logger.log("important-only", "-> posting EncodedStreams to worker (should happen only once)");

            await this.initPipeline(enc.id);

            worker.postMessage(
                { operation: 'decode', id: enc.id, readableStream: enc.readable, writableStream: enc.writable },
                [enc.readable, enc.writable] // transfer ownership
            );
        } else {
            this.logger.log("important-only", "-> EncodedStreams posted to worker already.");
        }
        console.groupEnd();
    }

    private async waitUntilConnected(pc: RTCPeerConnection) {
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') return Promise.resolve();
        return new Promise<void>((resolve, reject) => {
            const onChange = () => {
            if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
                // pc.removeEventListener('iceconnectionstatechange', onChange);
                resolve();
            } else if (pc.iceConnectionState === 'failed' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                pc.removeEventListener('iceconnectionstatechange', onChange);
                reject(new Error('ICE/DTLS not connected'));
            }
            };
            pc.addEventListener('iceconnectionstatechange', onChange);
        });
    }

    private async teardownReceiver(receiver: RTCRtpReceiver, worker: Worker) {
        const enc = this.encByReceiver.get(receiver);
        if (enc) {
            worker.postMessage({ operation: 'stop', id: enc.id });
            this.encByReceiver.delete(receiver);
        }
    }

    private async addRemoteTrack(roomId: StreamRoomId, event: RTCTrackEvent/*, mappedPublisher: Publisher*/) {
        // if (this.subscriberAttachedProcessing) {
        //     console.log("=====> POSTPONE addRemoteTrack <- waiting for: setupReceiverTranfrom()");
        //     setTimeout(() => {
        //         this.addRemoteTrack(event, mappedPublisher);
        //     }, 10);
        //     return;
        // }
        console.log("===================== REMOTE TRACK ADDED ========================");
        const worker = await this.getWorker();
        const track = event.track;
        const receiver = event.receiver;
        const key = this.getEncKey();
        console.log({receiver, track, key});

        const peerConnection = this.getConnectionManager().getConnectionWithSession(roomId, "subscriber").pc;
        this.logger.log("important-only", "waitUntilConnected...");
        await this.waitUntilConnected(peerConnection);

        this.logger.log("important-only", "setupReceiverTransform...");
        await this.setupReceiverTransform(receiver, worker);
        track.addEventListener('ended', async () => await this.teardownReceiver(receiver, worker));

        // if ((window as any).RTCRtpScriptTransform) {
        //     const options = {
        //         operation: 'decode',
        //         kind: track.kind
        //     };

        //     (receiver as any).transform = new RTCRtpScriptTransform(worker, options);
        // } else {
        //     console.log("receiver", receiver);
        //     const receiverStreams = (receiver as any).createEncodedStreams();

        //     worker.postMessage({
        //         operation: 'decode',
        //         readableStream: receiverStreams.readable,
        //         writableStream: receiverStreams.writable,
        //     }, [ receiverStreams.readable, receiverStreams.writable ]);

        //     console.log({receiver, receiverStreams, track, key});
        // }
        if (!(roomId in this.onRemoteTrackListeners)) {
            throw new Error("No remoteTrack listener registered for room: " + roomId);
        }
        this.onRemoteTrackListeners[roomId](event);
    }


    // public async onSubscriptionUpdated(_room: StreamRoomId, offer: any) {

    //     if (!this.peerConnectionReconfigureQueue) {
    //         throw new Error("ReconfigureQueue does not exist.");
    //     }
    //     this.peerConnectionReconfigureQueue.enqueue({taskId: Math.floor(1 + Math.random() * 10000), _room, offer});
    //     try {
    //         await this.peerConnectionReconfigureQueue.processAll();
    //     } catch (e) {
    //         console.error("Error on onSubscriberAttached", e);
    //     }
    // }

    public async onSubscriptionUpdatedSingle(_room: StreamRoomId, offer: any) {

        // if (!this.peerConnectionReconfigureQueue) {
        //     throw new Error("ReconfigureQueue does not exist.");
        // }
        // this.peerConnectionReconfigureQueue.enqueue({taskId: Math.floor(1 + Math.random() * 10000), _room, offer});
        // try {
        //     await this.peerConnectionReconfigureQueue.processAll();
        // } catch (e) {
        //     console.error("Error on onSubscriberAttached", e);
        // }
        return this.reconfigureSingle(_room, offer);
    }

    // private async reconfigure(item: QueueItem) {
    //     this.subscriberAttachedProcessing = true;
    //     console.group("Reconfiguring to recv streams of all publishers - task: ", item.taskId);

    //     if (!this.configuration) {
    //         throw new Error("Configuration missing.");
    //     }
    //     const janusConnection = this.getConnectionManager().getConnectionWithSession(item._room, "subscriber");
    //     const peerConnection = janusConnection.pc;

    //     this.logger.log("important-only", "1. Setting up remoteDescription...");
    //     await peerConnection.setRemoteDescription(new RTCSessionDescription(item.offer));
    //     this.logger.log("important-only", "offer from Janus: ", JSON.stringify(item.offer, null, 2));

    //     this.logger.log("important-only", "2. Creating an answer...", "peerConnection state", peerConnection.connectionState);
    //     const answer = await peerConnection.createAnswer();

    //     this.logger.log("important-only", "3. Setting up localDescription...");
    //     await peerConnection.setLocalDescription(new RTCSessionDescription(answer));
        
    //     this.logger.log("important-only", "4. notifying Janus with answer...");
    //     await this.streamsApiInterface.acceptOffer(janusConnection.sessionId, {type: answer.type, sdp: answer.sdp});
    //     // await this.mediaServerChannel?.videoRoomAcceptOffer(item.sessionId, item.handle, answer);
    //     console.groupEnd();
    //     this.subscriberAttachedProcessing = false;
    // }

    private async reconfigureSingle(room: StreamRoomId, offer: Jsep): Promise<Jsep> {
        // this.subscriberAttachedProcessing = true;
        console.group("Reconfiguring to recv streams of all publishers - task: ");

        if (!this.configuration) {
            throw new Error("Configuration missing.");
        }
        const janusConnection = this.getConnectionManager().getConnectionWithSession(room, "subscriber");
        const peerConnection = janusConnection.pc;

        this.logger.log("important-only", "1. Setting up remoteDescription...");
        await peerConnection.setRemoteDescription(new RTCSessionDescription({type: offer.type as RTCSdpType, sdp: offer.sdp}));
        this.logger.log("important-only", "offer from Janus: ", JSON.stringify(offer, null, 2));

        this.logger.log("important-only", "2. Creating an answer...", "peerConnection state", peerConnection.connectionState);
        const answer = await peerConnection.createAnswer();

        this.logger.log("important-only", "3. Setting up localDescription...");
        await peerConnection.setLocalDescription(new RTCSessionDescription(answer));
        
        // this.logger.log("important-only", "4. notifying Janus with answer...");
        // await this.streamsApiInterface.acceptOffer(janusConnection.sessionId, {type: answer.type, sdp: answer.sdp});
        // await this.mediaServerChannel?.videoRoomAcceptOffer(item.sessionId, item.handle, answer);
        console.groupEnd();
        // this.subscriberAttachedProcessing = false;
        return answer as Jsep;
    }

    // public async addNewPublisherAsAvailable(room: StreamRoomId, publisher: NewPublisherEvent) {
    //     this.logger.log("important-only", "addNewPublisher ", room, {newPublisher: publisher, currentPublishers: this.mediaServerAvailPublishers});
    //     if (!(publisher.id in this.mediaServerAvailPublishers)) {
    //         const newPublisher = {...publisher, attached: false, room: room};
    //         this.mediaServerAvailPublishers[newPublisher.id] = newPublisher;
    //     }
    // }

    // public async getPublishersToSubscribeTo(room: StreamRoomId, _publisher: Publisher) {
    //     console.group("subscribeToRemotePublisher...");

    //     const publishers = this.getPublishers();
    //     const streamsToJoin = publishers.filter(x => x.attached === false).flatMap(publisher => {
    //         const filtered = publisher.streams.map((stream) => {
    //             return {feed: publisher.id, mid: stream.mid};
    //         });
    //         return filtered;
    //     })
    //     return streamsToJoin;
    // }

    // public async setHasSubscriptions(roomId: StreamRoomId) {
    //     const janusConn = this.getConnectionManager().getConnectionWithSession(roomId, "subscriber");
    //     janusConn.hasSubscriptions = true;
    // }

    // public markPublishersAsSubscribed(streamsIds: StreamId[]) {
    //     for (const id of streamsIds) {
    //         if (id in this.mediaServerAvailPublishers) {
    //             this.mediaServerAvailPublishers[id].attached = true;
    //         }
    //     }
    // }

    // private async unsubscribeRemotePublishers(room: VideoRoomId, publishers: Publisher[]) {
    //     console.group("unsubscribeRemotePublishers...");
    //     const connection = await this.ensureSubscriberPeerConnectionWithSessionAndHandle(room);

    //     const streamsToLeave = publishers.filter(x => x.attached === true).flatMap(publisher => {
    //         const filtered = publisher.streams.map((stream) => {
    //             return {feed: publisher.id, mid: stream.mid};
    //         });
    //         return filtered;
    //     })
    //     this.logger.log("important-only", "unsubscribeRemotePublishers", streamsToLeave);
       
    //     console.log("===================> UNSUBSCRIBE FROM EXISTING ", streamsToLeave, "< ==================")
    //     await this.mediaServerChannel?.videoRoomSubscribeOnExisting(connection.session.id, connection.handle, {
    //         streams: streamsToLeave
    //     });
        
    // }
}

// TODO: sprawdzic processing queue
// dodac acceptOfferOnReconfigure do StreamApiLowVarInterface