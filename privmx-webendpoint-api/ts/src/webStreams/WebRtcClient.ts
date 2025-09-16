
import { AppServerChannel, Message } from "./AppServerChannel";
import { MediaServerApiTypes, SignalingFromServer } from "../ServerTypes";
import { EncKey, InitOptions, JanusPluginHandle, JanusSession, PeerCredentials, RemoteStreamListener, SessionId, VideoStream } from "./WebRtcClientTypes";
import { WebWorker } from "./WebWorkerHelper";
import { WebRtcConfig } from "./WebRtcConfig";
import { UpdateKeysModel } from "../service/WebRtcInterface";
import { Key, TurnCredentials } from "../Types";
import { KeyStore } from "./KeyStore";
import { VideoRoomId } from "./types/MediaServerWebSocketApiTypes";
import { PeerConnectionManager } from "./PeerConnectionsManager";

export declare class RTCRtpScriptTransform {
    constructor(worker: any, options: any);
    transform: (frame: any, controller: any) => void;
}

export interface StreamsCallbackInterface {
    trickle(sessionId: SessionId, candidate: RTCIceCandidate): Promise<void>;
} 
export class WebRtcClient {
    public uniqId: string;
    private senderPeerConnection: RTCPeerConnection|undefined;
    private receiverPeerConnection: RTCPeerConnection|undefined;

    private appServerChannel: AppServerChannel|undefined;

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
    // private encKey: EncKey | undefined;

    // nowo dodane =================================================
    // =============================================================
    private remoteStreamListeners: RemoteStreamListener[] = [];
    private peerConnectionsManager: PeerConnectionManager;

    constructor(private assetsDir: string, private streamApiCallbacks: StreamsCallbackInterface) {
        this.uniqId = "" + Math.random() + "-" + Math.random();
        console.log("WebRtcClient constructor ("+this.uniqId+")", "assetsDir: ", this.assetsDir);
        this.peerConnectionsManager = new PeerConnectionManager(
            () => {
                return this.createPeerConnectionMulti(this.getPeerConnectionConfiguration());
            },
            (sessionId: SessionId, candidate: RTCIceCandidate) => {
                return this.streamApiCallbacks.trickle(sessionId, candidate);
            }
        )
    }


    public addRemoteStreamListener(listener: RemoteStreamListener) {
        this.remoteStreamListeners.push(listener);
    }
    // nowo dodane END ==================================================================

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

    async recreateAndGetReceiverPeerConnection() {
        this.receiverPeerConnection = this.createPeerConnectionMulti(this.configuration);
        return this.receiverPeerConnection;
    }

    async setTurnCredentials(turnCredentials: TurnCredentials[]) {
        this.peerCredentials = turnCredentials;
    }

    async createPeerConnectionWithLocalStream(stream: MediaStream): Promise<RTCPeerConnection> {
        // this.peerCredentials = await (await this.getAppServerChannel()).requestCredentials();
        this.configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);

        this.senderPeerConnection = this.createPeerConnectionMulti(this.configuration);
        this.receiverPeerConnection = this.createPeerConnectionMulti(this.configuration);
        console.log("=========> peerConnection multi created.", this.uniqId);
        if (stream.getTracks().length > 0) {
            const [track] = stream.getTracks();
            console.log("adding track to peerConnection...");
            const videoSender = this.senderPeerConnection.addTrack(track, stream);
            this.e2eeWorker = await this.getWorker();
    
            console.log("this.e2eeWorker", this.e2eeWorker);

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
    
            console.log("Transform streams added.")
        }
        console.log("Created peerConnection with configuration: ", this.senderPeerConnection.getConfiguration(), "and clientId: ", this.clientId);
        return this.senderPeerConnection;
    }

    public async createPeerConnectionOnJoin(peerCredentials: TurnCredentials[]) {
        const configuration = WebRtcConfig.generateTurnConfiguration(peerCredentials);
        this.receiverPeerConnection = this.createPeerConnectionMulti(configuration);
    }

    private async onSubscriberAttached(eventData: SignalingFromServer.SubscriberAttached) {
        console.log("============> onSubscriberAttached",eventData);
        // const peerCredentials = await (await this.getAppServerChannel()).requestCredentials();

        // const configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);
        if (!this.configuration) {
            throw new Error("Configuration missing.");
        }
        console.log("-----> onSubscriberAttached", {room: eventData.room, streams: eventData.streams});
        this.receiverPeerConnection = this.createPeerConnectionMulti(this.configuration);
        const peerConnection = this.receiverPeerConnection;

        console.log("-----> setting up remote subscriber offer as remoteDescription", eventData.offer);
        await peerConnection.setRemoteDescription(new RTCSessionDescription(eventData.offer));
        console.log("----------> creating answer for remote offer..");
        
        const dataStreams = eventData.streams.filter(x => x.type === "data");
        for (const x of dataStreams) {
            console.log("============> Creating dataChannel handler..." + x.mid);
            peerConnection.createDataChannel("JanusDataChannel/" + x.mid);
        }
        const answer = await peerConnection.createAnswer();

        await peerConnection.setLocalDescription(answer);

        // await this.signalingApi?.acceptOffer(eventData.session_id, eventData.handle, answer);
    }

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

    private createPeerConnectionMulti(configuration: RTCConfiguration & {encodedInsertableStreams?: boolean}): RTCPeerConnection {
        console.log("createPeerConnectionMulti...");
        const extConf = configuration || this.getPeerConnectionConfiguration();
        if (!extConf) {
            throw new Error("No configuration available!");
        }
        (extConf as any).encodedInsertableStreams = true;
        console.log("extConf", extConf);
        const connection = new RTCPeerConnection(extConf);
        // Listen for local ICE candidates on the local RTCPeerConnection
        connection.addEventListener('icecandidate', event => {
            // console.log("on peerConnection new iceCandidate: ", event);
            if (event.candidate) {
                // signalingChannel.send({'iceCandidate': event.candidate});
                this.iceCandidates.push(event.candidate);
            }
        });
        // gethering state change
        connection.addEventListener('icegatheringstatechange', event => {
            console.log("on ice state change: ", event);
        });
        // ice candidate error
        connection.addEventListener('icecandidateerror', event => {
            console.warn("on ice error: ", event);
        });
        connection.addEventListener('connectionstatechange', event => {
            console.log("connectionstatechange: ", event);
            if (connection.connectionState === "connected") {
                console.log("Peers connected!");
            } else {
                console.log("connection state: ", connection.connectionState);
            }
        });
        connection.addEventListener('datachannel', event => {
            console.log("=================> datachannel: ", event);
            const recvChannel = event.channel;
            this.addDataChannel(recvChannel);
        });
        
        connection.addEventListener('iceconnectionstatechange', event => {
            console.log("iceconnectionstatechange: ", event);
        });
        connection.addEventListener('negotiationneeded', event => {
            console.log("negotiationneeded: ", event);
            this.startNegotiationMulti(connection);
            console.warn("negotiationneeded call... ignored for now but has to be implemented.")
        });
        connection.addEventListener('signalingstatechange', event => {
            console.log("signalingstatechange: ", event);
        });
        connection.addEventListener('track', event => {
            console.log("track: ", event);
            this.addRemoteTrack(event);
        });
        console.log("2");
        return connection;
    }

    public getSenderActivePeerConnection(): RTCPeerConnection {
        if (!this.senderPeerConnection) {
            throw new Error("PeerConnection not initialized! " + this.uniqId);
        }
        return this.senderPeerConnection;
    }
    public getReceiverActivePeerConnection(): RTCPeerConnection {
        if (!this.receiverPeerConnection) {
            throw new Error("Receiver PeerConnection not initialized!");
        }
        return this.receiverPeerConnection;
    }

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

    createDataChannel(name: string) {
        const channel = this.getSenderActivePeerConnection().createDataChannel(name);
        this.addDataChannel(channel);
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

    async updateKeys(keys: Key[]) {
        this.keyStore.setKeys(keys);

        // propagate keys to the worker
        (await this.getWorkerApi()).setKeys(keys);
    }

    private async addRemoteTrack(event: RTCTrackEvent) {
        console.log("===================== REMOTE TRACK ADDED ========================");
        const worker = await this.getWorker();
        const track = event.track;
        const receiver = event.receiver;
        const key = this.getEncKey();
        console.log({receiver, track, key});


        if ((window as any).RTCRtpScriptTransform) {
            const options = {
                operation: 'decode',
                kind: track.kind
            };

            (receiver as any).transform = new RTCRtpScriptTransform(worker, options);
        } else {
            console.log("receiver", receiver);
            const receiverStreams = (receiver as any).createEncodedStreams();

            worker.postMessage({
                operation: 'decode',
                readableStream: receiverStreams.readable,
                writableStream: receiverStreams.writable,
            }, [ receiverStreams.readable, receiverStreams.writable ]);

            console.log({receiver, receiverStreams, track, key});
        }

        // orig code
        // const videoStream: VideoStream = {
        //     stream: event.streams[0],
        //     isLocal: false,
        //     id: event.streams[0].id
        // }
        // for (const listener of this.remoteStreamListeners) {
        //     listener(videoStream);
        // }

        for (const listener of this.remoteStreamListeners) {
            listener(event);
        }  

    }

}
