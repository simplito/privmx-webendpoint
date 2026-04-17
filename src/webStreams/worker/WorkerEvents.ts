import { Key } from "../../Types";

// ---- Inbound messages (main thread → worker) ----

export interface EncodeEvent {
    operation: "encode";
    kind?: "audio" | "video";
    readableStream: ReadableStream<unknown>;
    writableStream: WritableStream<unknown>;
}

export interface DecodeEvent {
    operation: "decode";
    kind?: "audio" | "video";
    id: string;
    publisherId: number;
    readableStream: ReadableStream<unknown>;
    writableStream: WritableStream<unknown>;
}

export interface SetKeysEvent {
    operation: "setKeys";
    keys: Key[];
}

export interface RmsEvent {
    operation: "rms";
    rms: number;
}

export interface StopEvent {
    operation: "stop";
    id: string;
}

export type WorkerInboundEvent = EncodeEvent | DecodeEvent | SetKeysEvent | RmsEvent | StopEvent;

// ---- Outbound messages (worker → main thread) ----

export interface SetKeysAckEvent {
    operation: "setKeys-ack";
}

export interface RmsOutEvent {
    type: "rms";
    rms: number;
    receiverId: string | undefined;
    publisherId: number | undefined;
}

export interface DebugEvent {
    type: "debug";
    data: unknown;
}

export interface ErrorEvent {
    type: "error";
    data: unknown;
}

export type WorkerOutboundEvent = SetKeysAckEvent | RmsOutEvent | DebugEvent | ErrorEvent;
