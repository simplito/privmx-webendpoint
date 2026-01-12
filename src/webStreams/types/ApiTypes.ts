import { StreamHandle } from "../../Types";
import * as MediaServerTypes from "./MediaServerWebSocketApiTypes";

export interface UserWithPubKey {
    userId: string;
    key: string;
}

export interface ListQuery {
    skip?: number;
    limit?: number;
    order?: string;
}

// export type PublicMeta = string & {__publicMeta: never};
// export type PrivateMeta = string & {__privateMeta: never};


// Channel groups
export interface StreamCreateMeta {
    mid?: string; //"<unique mid of a stream being published>"
    description?: string; //"<text description of the stream (e.g., My front webcam)>"
    p2p?: boolean; // reserved for future use
    tracks?: StreamTrackCreateMeta[];
};

export interface StreamTrackCreateMeta {
    mid?: string; //"<unique mid of a stream being published>"
    description?: string; //"<text description of the stream (e.g., My front webcam)>"
};


export interface StreamRemoteInfo {
    id: StreamId;
    tracks?: TrackInfo[];
};
export interface StreamAndTracksSelector {
    streamRoomId: StreamRoomId;
    streamId: StreamId;
    tracks?: StreamTrackId[];
}

export interface Stream {
    handle: StreamHandle;
    streamRoomId: StreamRoomId;
    remote: boolean;
    createStreamMeta?: StreamCreateMeta;
    remoteStreamInfo?: StreamRemoteInfo;
    localMediaStream?: MediaStream;
}

export interface StreamList {
    list: Stream[];
}

export type StreamId = number & {__streamId: never};
export interface DataChannelMeta {
    name: string;
}

// Channels
export interface StreamTrackMeta {
    // Track
    track?: MediaStreamTrack;

    // DataChannel
    dataChannel?: DataChannelMeta;
}

export interface StreamTrackList {    
    list: TrackInfo[];
}

export type StreamTrackId = string & {__streamTrackId: never};

export interface PublishMeta {
    bitrate?: number; // <bitrate cap to return via REMB; optional, overrides the global room value if present>,
    display?: string;// "<display name to use in the room; optional>",
}

export interface TrackInfo extends MediaServerTypes.VideoRoomStreamTrack {
    type: string;
    streamRoomId: StreamRoomId;
    streamId: StreamId;
    meta?: DataChannelMeta;
    dataTrackId?: StreamTrackId;
}

// types mappings
export type StreamRoomInfo = MediaServerTypes.VideoRoom;
export type StreamRoomList = MediaServerTypes.RoomListResult;
export type StreamRoomId = string & {__streamRoomId: never };// MediaServerTypes.VideoRoomId;
export type TrackType = "audio" | "video" | "data";