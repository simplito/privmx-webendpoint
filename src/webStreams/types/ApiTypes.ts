import { StreamHandle } from "../../Types";

export interface UserWithPubKey {
    userId: string;
    key: string;
}

export interface StreamCreateMeta {
    mid?: string;
    description?: string;
    p2p?: boolean; // reserved for future use
    tracks?: StreamTrackCreateMeta[];
}

export interface StreamTrackCreateMeta {
    mid?: string;
    description?: string;
}

export interface Stream {
    handle: StreamHandle;
    streamRoomId: StreamRoomId;
    remote: boolean;
    createStreamMeta?: StreamCreateMeta;
    localMediaStream?: MediaStream;
}

export type StreamId = number & { __streamId: never };

export interface DataChannelMeta {
    created: boolean;
    dataChannel?: RTCDataChannel;
}

export interface StreamTrackInit {
    track?: MediaStreamTrack;
    createDataChannel?: boolean;
}

export type StreamTrackId = string & { __streamTrackId: never };

export type StreamRoomId = string & { __streamRoomId: never };
