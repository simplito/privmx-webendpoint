import { MediaServerApiTypes } from "../ServerTypes";
import { StreamRoomId } from "./types/ApiTypes";
import { NewPublisherEvent } from "./types/MediaServerWebSocketApiTypes";

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
    key: Buffer;
    iv: Buffer;
}

export interface InitOptions {
    signalingServer: string;
    appServer: string;
    mediaServer: string;
    turnUrls?: string[];
    iceTransportPolicy?: RTCIceTransportPolicy;
    encKey?: string;
}

export interface VideoStream {
    stream: MediaStream;
    isLocal: boolean;
    id: string;
}

export type RemoteStreamListener = (stream: RTCTrackEvent) => void;

export type PluginHandleId = number & {_pluginHandleId: never};
export type PluginId = string & {_pluginId: never};
export type SessionId = number & {_sessionId: never};
export interface JanusPluginHandle {
    id: PluginHandleId;
    pluginId: PluginId;
}
export interface JanusSession {
    id: SessionId;
}

export interface Publisher extends NewPublisherEvent {
    attached: boolean;
    room: StreamRoomId;
}

export type EncPair = {
  readable: ReadableStream<any>;
  writable: WritableStream<any>;
  id: string;
  posted: boolean;
};

export interface RTCEncodedStream  {
  readable: ReadableStream<EncodedAudioChunk | EncodedVideoChunk>;
  writable: WritableStream<EncodedAudioChunk | EncodedVideoChunk>;
}

export interface QueueItem {
    taskId: number, _room: StreamRoomId, offer: any;
}