import { StreamRoomId } from "./types/ApiTypes";

export type SessionId = number & { _sessionId: never };

export type EncPair = {
    readable: ReadableStream<unknown>;
    writable: WritableStream<unknown>;
    id: string;
    publisherId: number;
    posted: boolean;
};

export interface QueueItem {
    room: StreamRoomId;
    jsep?: { sdp: string; type: RTCSdpType };
}
