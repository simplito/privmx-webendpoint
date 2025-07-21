
import { AppServerChannel, Message } from "./AppServerChannel";
import { MediaServerApiTypes, SignalingFromServer } from "../ServerTypes";
// import { SignalingApi } from "./AppServerSignaling";
import { EncKey, InitOptions, PeerCredentials, RemoteStreamListener, VideoStream } from "./WebRtcClientTypes";
import { WebWorker } from "./WebWorkerHelper";
import { WebRtcConfig } from "./WebRtcConfig";
import { UpdateKeysModel } from "../service/WebRtcInterface";
import { Key, TurnCredentials } from "../Types";
import { KeyStore } from "./KeyStore";

export declare class RTCRtpScriptTransform {
    constructor(worker: any, options: any);
    transform: (frame: any, controller: any) => void;
}

export class WebRtcClient {
    public uniqId: string;
    private peerConnection: RTCPeerConnection|undefined;

    private appServerChannel: AppServerChannel|undefined;
    // private signalingApi: SignalingApi | undefined;

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
    private currentMediaSessionId: MediaServerApiTypes.SessionId | undefined;
    private remoteStreamListeners: RemoteStreamListener[] = [];
    constructor(private assetsDir: string) {
        this.uniqId = "" + Math.random() + "-" + Math.random();
        console.log("WebRtcClient constructor ("+this.uniqId+")", "assetsDir: ", this.assetsDir);
    }

    
    public async provideSession(): Promise<MediaServerApiTypes.SessionId> {
        // if (!this.currentMediaSessionId) {
        //     const sessionId = await (await this.getSignalingApi()).createSession();
        //     if (!sessionId) {
        //         throw new Error("Cannot create media session.");
        //     }
        //     this.currentMediaSessionId = sessionId;
        // }
        return this.currentMediaSessionId;
    }

    public async getAppServerChannel(): Promise<AppServerChannel> {
        if (!this.appServerChannel) {
            this.appServerChannel = await this.createAppServerChannel();
        }
        return this.appServerChannel;
    }
    
    // public async getSignalingApi(): Promise<SignalingApi> {
    //     // if (!this.signalingApi) {
    //     //     this.signalingApi = new SignalingApi(await this.getAppServerChannel());
    //     // }
    //     // return this.signalingApi;
    // }

    // public setEncKey(key: string, iv: string) {
    //     this.encKey = {key, iv};
    // }

    private async onAppServerSignalingEvent(event: any) {
        console.log("onAppServerSignalingEvent event", event);
        // on subscriberAttached
        const baseEvent = <SignalingFromServer.BaseEvent>event;

        if (baseEvent.kind === "media-event" && baseEvent.type === "subscriberAttached") {
            this.onSubscriberAttached(<SignalingFromServer.SubscriberAttached>event.data);
        }

        // on streamConfigured
        if (baseEvent.kind === "media-event" && baseEvent.type === "streamConfigured") {
            this.onStreamConfigured(<SignalingFromServer.StreamConfigured>event.data);
        }
    }

    protected async onStreamConfigured(eventData: SignalingFromServer.StreamConfigured) {
        console.log("-----> onStreamConfigured call with eventData", eventData);
        try {
            console.log("-----> setting up the answer...");
            await this.getActivePeerConnection().setRemoteDescription(new RTCSessionDescription(eventData.answer));
        } catch (e) {
            console.error("Cannot set remote description from answer", e);
        }

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

    async createPeerConnectionWithLocalStream(stream: MediaStream, peerCredentials: TurnCredentials[]): Promise<RTCPeerConnection> {
        // this.peerCredentials = await (await this.getAppServerChannel()).requestCredentials();
        this.peerCredentials = peerCredentials;
        this.configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);

        this.peerConnection = this.createPeerConnectionMulti(this.configuration);
        console.log("created peerConnection: ", this.peerConnection);
        console.log("=========> peerConnection multi created.", this.uniqId);
        if (stream.getTracks().length > 0) {
            const [track] = stream.getTracks();
            console.log("adding track to peerConnection...");
            const videoSender = this.peerConnection.addTrack(track, stream);
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
        console.log("Created peerConnection with configuration: ", this.peerConnection.getConfiguration(), "and clientId: ", this.clientId);
        return this.peerConnection;
    }

    public async createPeerConnectionOnJoin(peerCredentials: TurnCredentials[]) {
        const configuration = WebRtcConfig.generateTurnConfiguration(peerCredentials);
        const peerConnection = this.createPeerConnectionMulti(configuration);
        this.peerConnection = peerConnection;
    }

    private async onSubscriberAttached(eventData: SignalingFromServer.SubscriberAttached) {
        console.log("============> onSubscriberAttached",eventData);
        const peerCredentials = await (await this.getAppServerChannel()).requestCredentials();

        const configuration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);

        console.log("-----> onSubscriberAttached", {room: eventData.room, streams: eventData.streams});
        const peerConnection = this.createPeerConnectionMulti(configuration);
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

        this.peerConnection = peerConnection;

        // await this.signalingApi?.acceptOffer(eventData.session_id, eventData.handle, answer);
    }

    private async createAppServerChannel(): Promise<AppServerChannel> {
        const appServerChannel = new AppServerChannel({
            serverAddress: WebRtcConfig.getAppServerAddress(),
            onResponse: async (data: Message) => {
                if (data.kind === "credentials") {
                    await this.updatePeerConnectionCredentialsOnEvent(data.data);
                }
            },
            onEvent: async (data: any) => await this.onAppServerSignalingEvent(data)
        });
        this.clientId = await appServerChannel.connect();
        return appServerChannel;
    }

    private async updatePeerConnectionCredentialsOnEvent(credentials: TurnCredentials[]) {
        this.peerCredentials = credentials;
        const peerConnection = this.getActivePeerConnection();
        if (peerConnection) {
            const newConfiguration = WebRtcConfig.generateTurnConfiguration(this.peerCredentials);
            peerConnection.setConfiguration(newConfiguration);
            this.startNegotiationMulti(true);
        }
        console.log("PeerConnection and peerCredentials after update", this.peerConnection, this.peerCredentials);
    }

    private createPeerConnectionMulti(configuration: RTCConfiguration & {encodedInsertableStreams?: boolean}): RTCPeerConnection {
        console.log("1");
        const extConf = configuration;
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
            // this.startNegotiationMulti();
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

    public getActivePeerConnection(): RTCPeerConnection {
        if (!this.peerConnection) {
            throw new Error("PeerConnection not initialized! " + this.uniqId);
        }
        return this.peerConnection;
    }

    private async startNegotiationMulti(withIceRestart?: boolean) {
        console.log("-----> Start negotiation multi - creating offer");
        const offer = await this.getActivePeerConnection().createOffer({iceRestart: withIceRestart});
        console.log("-----> Setting up the offer...", offer);
        await this.getActivePeerConnection().setLocalDescription(offer);
    }

    createDataChannel(name: string) {
        const channel = this.getActivePeerConnection().createDataChannel(name);
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
