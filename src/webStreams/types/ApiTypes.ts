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

export type StreamHandle = number & { __streamHandle: never };

export type SubscriberStreamHandle = number & { __subscriberStreamHandle: never };

export interface DataChannelMeta {
    created: boolean;
    dataChannel?: RTCDataChannel;
    seq: number;
}

export interface DataChannelMessage {
    data: Uint8Array;
    seq: number;
}

export interface DecryptedDataChannelMessage extends DataChannelMessage {
    statusCode: number;
}

export interface StreamTrack {
    id: StreamTrackId;
    streamHandle: StreamHandle;
    track?: MediaStreamTrack;
    dataChannelMeta: DataChannelMeta;
    published: boolean;
    markedToRemove?: boolean;
}

export interface StreamTrackInit {
    track?: MediaStreamTrack;
    createDataChannel?: boolean;
}

export type StreamTrackId = string & { __streamTrackId: never };

export type StreamRoomId = string & { __streamRoomId: never };

export interface Jsep {
    sdp: string;
    type: RTCSdpType;
}
