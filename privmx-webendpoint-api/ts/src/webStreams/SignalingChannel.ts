export type SignalEventFunc = (data: any) => void;
export type Message = {offer?: any, answer?: any, iceCandidate?: any};

export interface SignalingChannelConfiguration {
    serverAddress?: string,
    onOffer: SignalEventFunc, onAnswer: SignalEventFunc, onIceCandidate: SignalEventFunc
}
export class SignalingChannel {
    ws: WebSocket | undefined;
    connected: boolean = false;
    serverAddress: string = "localhost:8888";

    onOfferListener: SignalEventFunc;
    onAnswerListener: SignalEventFunc;
    onIceCandidateListener: SignalEventFunc;

    constructor(configuration: SignalingChannelConfiguration) {
        if (configuration.serverAddress) {
            this.serverAddress = configuration.serverAddress;
        }
        this.onOfferListener = configuration.onOffer;
        this.onAnswerListener = configuration.onAnswer;
        this.onIceCandidateListener = configuration.onIceCandidate;
    }

    async connect(): Promise<void> {
        return new Promise<void>(resolve => {
            this.ws = new WebSocket("wss://" + this.serverAddress);
            this.ws.addEventListener('error', err => {
                console.error(err);
                this.connected = false;
            });
            this.ws.addEventListener("message", async (evt: MessageEvent) => {
                // console.log("on message - RAW (signaling channel): ", evt, evt.data);
                const data = (evt.data instanceof Blob) ? await evt.data.text() : evt.data;
                try {
                    const message: Message = JSON.parse(data);
                    if (message.offer) {
                        console.log("Recv offer: ", message.offer);
                        this.onOfferListener(message.offer);
                    }
                    else
                    if (message.answer) {
                        console.log("Recv answer: ", message.answer);
                        this.onAnswerListener(message.answer);
                    }
                    else
                    if (message.iceCandidate) {
                        console.log("Recv iceCandidate: ", message.iceCandidate);
                        this.onIceCandidateListener(message.iceCandidate);
                    }
                    else {
                        console.error("Unknown message: ", message);
                        throw new Error("Invalid message.");    
                    }
                }
                catch (e) {
                    console.log("cannot parse - data: ", data);
                }
    
    
            });
            this.ws.addEventListener('open', () => {
                console.log("connected.");
                this.connected = true;
                resolve();
            });
    
        });
        
    }
    send(data: any) {
        if (! this.connected || this.ws === undefined) {
            console.error("Cannot send data. Not connected.");
        } else {
            console.log("sending data - RAW:", data, "JSON: ", JSON.stringify(data));
            this.ws.send(JSON.stringify(data));
        }
    }
}
