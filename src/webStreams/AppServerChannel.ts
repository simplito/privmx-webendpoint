import { AppRequest, Types } from "../ServerTypes";
import { PeerCredentials } from "./WebRtcClientTypes";

export type ServerEventFunc = (data: any) => void;
export type Message = {kind: "credentials" | "connected", clientId: string, data?: any};

export class Deferred<T> {
    public readonly promise: Promise<T>
    private resolveFn!: (value: T | PromiseLike<T>) => void
    private rejectFn!: (reason?: any) => void

    public constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolveFn = resolve
            this.rejectFn = reject
        })
    }

    public reject(reason?: any): void {
        this.rejectFn(reason)
    }

    public resolve(param: T): void {
        this.resolveFn(param)
    }
}

export interface AwaitingRequest<V>{
    id: number;
    result: {resolve: (value: V) => void, reject: (reason?: any) => void};
}

export interface Response {
    requestId?: number;
    kind: string;
    clientId?: string;
    data: any;
}

export interface ServerChannelConfiguration {
    serverAddress?: string;
    onResponse: ServerEventFunc;
    onEvent: ServerEventFunc;
}
export class AppServerChannel {
    private clientId: string | undefined;
    private static requestId: number = 0;
    private static getNextRequestId() {
        return ++AppServerChannel.requestId;
    }
    
    ws: WebSocket | undefined;
    connected: boolean = false;
    serverAddress: string = "localhost:8810";

    requests: {[id: number]: AwaitingRequest<any>} = {};
    
    onResponseListener: ServerEventFunc;
    onEventListener: ServerEventFunc;

    constructor(configuration: ServerChannelConfiguration) {
        if (configuration.serverAddress) {
            this.serverAddress = configuration.serverAddress;
        }
        this.onResponseListener = configuration.onResponse;
        this.onEventListener = configuration.onEvent;
    }

    async connect(): Promise<string> {
        console.log("connecting to appServer: ", this.serverAddress);
        return new Promise<string>(resolve => {
            this.ws = new WebSocket("wss://" + this.serverAddress);
            this.ws.addEventListener('error', err => {
                console.error(err);
                this.connected = false;
            });
            this.ws.addEventListener("message", async (evt: MessageEvent) => {
                // console.log("on message - RAW: ", evt, evt.data);
                const data = (evt.data instanceof Blob) ? await evt.data.text() : evt.data;
                try {
                    const response: Response = JSON.parse(data);
                    if (response.kind === "newClientId" && response.clientId) {
                        console.log("Connected to AppServer");
                        this.connected = true;
                        this.clientId = response.clientId;
                        resolve(response.clientId);
                    }
                    else
                    if (response.requestId && response.requestId in this.requests) {
                        const awaitRequest = this.requests[response.requestId];
                        awaitRequest.result.resolve(response.data);
                        delete this.requests[response.requestId];
                    }
                    else
                    if (response.kind === "media-event" || response.kind === "event") {
                        this.onEventListener(response);
                    }

                    // const message: Message = JSON.parse(data);
                    // if (message.kind === "credentials" || message.kind === "connected") {   
                    //     this.onResponseListener(message);
                    // }
                    else {
                        console.error("Unknown message: ", response);
                        throw new Error("Invalid message.");    
                    }
                }
                catch (e) {
                    console.log("cannot parse - data: ", data);
                }
    
    
            });
            this.ws.addEventListener('open', () => {
                console.log("Connection opened.");
            });
    
        });
        
    }
    async requestCredentials(): Promise<PeerCredentials> {
        return this.send({kind: "getTurnCredentials"});
    }


    async call<T extends AppRequest, V>(request: T) {
        return this.send<T, V>(request);
    }

    private async send<T extends AppRequest, V>(data: T) {
        if (! this.connected || this.ws === undefined) {
            console.error("Cannot send data. Not connected.");
            return Promise.reject("Cannot send data. Not connected.");
        } else {
            const requestId = AppServerChannel.getNextRequestId();
            const req = {
                id: requestId,
                result: new Deferred<V>()
            };
            this.requests[requestId] = req;
            const requestData = {request: data, requestId: req.id, clientId: this.clientId};
            // console.log("sending data - RAW:", requestData, "JSON: ", JSON.stringify(requestData));
            this.ws.send(JSON.stringify(requestData));
            return req.result.promise as Promise<V>;
        }
    }
}
