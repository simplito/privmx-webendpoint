import { MediaServerApiTypes } from "../ServerTypes";

export declare class RTCRtpScriptTransform {
    constructor(worker: any, options: any);
    transform: (frame: any, controller: any) => void;
}

// export type RTCRtpScriptTransform = globalThis.RTCRtpScriptTransform;
export interface PeerCredentials {
    username: string;
    password: string;
    expirationTime: number;
}

export interface EncKey {
    key: string;
    iv: string;
}

export interface InitOptions {
    signalingServer: string;
    appServer: string;
    mediaServer: string;
    turnUrls?: string[];
    iceTransportPolicy?: RTCIceTransportPolicy;
    encKey?: string;
}

export interface Publisher extends MediaServerApiTypes.NewPublisherEvent {
    attached: boolean;
    room: MediaServerApiTypes.VideoRoomId;
}

export interface VideoStream {
    stream: MediaStream;
    isLocal: boolean;
    id: string;
}

export type RemoteStreamListener = (stream: RTCTrackEvent) => void;