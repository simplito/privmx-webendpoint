import { Key } from "../../Types.js";

// ---- Inbound messages (main thread → worker) ----

/**
 * @internal Worker message: install an encrypting transform on an outbound encoded
 * stream pair.
 */
export interface EncodeEvent {
    operation: "encode";
    kind?: "audio" | "video";
    readableStream: ReadableStream<unknown>;
    writableStream: WritableStream<unknown>;
}

/**
 * @internal Worker message: install a decrypting transform on an inbound encoded stream
 * pair.
 */
export interface DecodeEvent {
    operation: "decode";
    kind?: "audio" | "video";
    id: string;
    publisherId: number;
    readableStream: ReadableStream<unknown>;
    writableStream: WritableStream<unknown>;
}

/**
 * @internal Worker message: replace the worker-side key set.
 */
export interface SetKeysEvent {
    operation: "setKeys";
    keys: Key[];
}

/**
 * @internal Worker message: update the local microphone RMS level embedded in outgoing
 * frames.
 */
export interface RmsEvent {
    operation: "rms";
    rms: number;
}

/**
 * @internal Worker message: cancel the decode pipeline for a track.
 */
export interface StopEvent {
    operation: "stop";
    id: string;
}

/**
 * @internal Union of all messages sent from the main thread to the E2EE worker.
 */
export type WorkerInboundEvent = EncodeEvent | DecodeEvent | SetKeysEvent | RmsEvent | StopEvent;

// ---- Outbound messages (worker → main thread) ----

/**
 * @internal Worker reply: confirms a setKeys message has been applied.
 */
export interface SetKeysAckEvent {
    operation: "setKeys-ack";
}

/**
 * @internal Worker event: RMS audio level extracted from a received frame.
 */
export interface RmsOutEvent {
    type: "rms";
    rms: number;
    receiverId: string | undefined;
    publisherId: number | undefined;
}

/**
 * @internal Worker event: debug payload forwarded to the main thread.
 */
export interface DebugEvent {
    type: "debug";
    data: unknown;
}

/**
 * @internal Worker event: error payload forwarded to the main thread.
 */
export interface ErrorEvent {
    type: "error";
    data: unknown;
}

/**
 * @internal Union of all messages sent from the E2EE worker to the main thread.
 */
export type WorkerOutboundEvent = SetKeysAckEvent | RmsOutEvent | DebugEvent | ErrorEvent;
