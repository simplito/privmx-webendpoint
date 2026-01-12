import { AppRequest } from "./BaseServerTypes";
import * as Types from "./ApiTypes";
export interface StreamRoomCreateRequest extends AppRequest {
    kind: "streams.streamRoomCreate";
    data: {
        contextId: string;
        users: Types.UserWithPubKey[];
        managers: Types.UserWithPubKey[];
        privateMeta: Uint8Array;
        publicMeta: Uint8Array;
    }
}

export interface StreamRoomUpdateRequest extends AppRequest {
    kind: "streams.streamRoomUpdate";
    data: {
        streamRoomId: Types.StreamRoomId;
        users: Types.UserWithPubKey[];
        managers: Types.UserWithPubKey[];
        privateMeta: string;
        publicMeta: string;
    }
}

export interface StreamRoomGetRequest extends AppRequest {
    kind: "streams.streamRoomGet";
    data: {
        streamRoomId: Types.StreamRoomId;
    }
}

export interface StreamRoomListRequest extends AppRequest {
    kind: "streams.streamRoomList";
    data: {
        contextId: string;
        query: Types.ListQuery;
    }
}

export interface StreamRoomDeleteRequest extends AppRequest {
    kind: "streams.streamRoomDelete";
    data: {
        streamRoomId: Types.StreamRoomId;
    }
}

export interface StreamCreateRequest extends AppRequest {
    kind: "streams.streamCreate";
    data: {
        streamRoomId: Types.StreamRoomId;
        meta?: Types.StreamCreateMeta;
    }
}

export interface StreamUpdateRequest extends AppRequest {
    kind: "streams.streamUpdate";
    data: {
        streamId: Types.StreamId;
        meta: Types.StreamCreateMeta;
    }
}

export interface StreamListRequest extends AppRequest {
    kind: "streams.streamList";
    data: {
        streamRoomId: Types.StreamRoomId;
        query: Types.ListQuery;
    }
}

export interface StreamGetRequest extends AppRequest {
    kind: "streams.streamGet";
    data: {
        streamRoomId: Types.StreamRoomId;
        streamId: Types.StreamId;
    }
}

export interface StreamDeleteRequest extends AppRequest {
    kind: "streams.streamDelete";
    data: {
        streamRoomId: Types.StreamRoomId;
        streamId: Types.StreamId;
    }
}

export interface StreamDataTrackAddRequest extends AppRequest {
    kind: "streams.streamDataTrackAdd";
    data: {
        streamRoomId: Types.StreamRoomId,
        streamTrackId: Types.StreamTrackId,
        streamId: Types.StreamId,
        meta: Types.DataChannelMeta
    }
}

export interface StreamTrackRemoveRequest extends AppRequest {
    kind: "streams.streamTrackRemove";
    data: {
        streamId: Types.StreamId;
        streamRoomId: Types.StreamRoomId;
        streamTrackId: Types.StreamTrackId;
    }
}

export interface StreamTrackListRequest extends AppRequest {
    kind: "streams.streamTrackList";
    data: {
        streamId: Types.StreamId;
        streamRoomId: Types.StreamRoomId;
    }
}

export interface StreamTrackSendDataRequest extends AppRequest {
    kind: "streams.streamTrackSendData";
    data: {
        streamTrackId: Types.StreamTrackId;
        data: Buffer;
    }
}

export interface StreamPublishRequest extends AppRequest {
    kind: "streams.streamPublish";
    data: {
        streamRoomId: Types.StreamRoomId;
        streamId: Types.StreamId;
        streamMeta?: Types.StreamCreateMeta;
        peerConnectionOffer: any;
    }
}

export interface StreamUnpublishRequest extends AppRequest {
    kind: "streams.streamUnpublish";
    data: {
        streamRoomId: Types.StreamRoomId;
        streamId: Types.StreamId;
    }
}

export interface StreamJoinRequest extends AppRequest {
    kind: "streams.streamJoin";
    data: {
        streamRoomId: Types.StreamRoomId;
        streamToJoin: Types.StreamAndTracksSelector;
    }
}

export interface StreamLeaveRequest extends AppRequest {
    kind: "streams.streamLeave";
    data: {
        streamToLeave: Types.StreamAndTracksSelector;
    }
}

export interface StreamDataChannelSendRequest extends AppRequest {
    kind: "streams.dataChannelSend";
    data: {
        streamRoomId: Types.StreamRoomId;
        streamId: Types.StreamId;
        data: string;
    }
}
