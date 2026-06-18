import { Key } from "../../Types.js";

// ---- Inbound messages (main thread → worker) ----

/**
 * Worker message: install an encrypting transform on an outbound encoded
 * stream pair.
 * @internal
 */
export interface EncodeEvent {
    operation: "encode";
    kind?: "audio" | "video";
    readableStream: ReadableStream<unknown>;
    writableStream: WritableStream<unknown>;
}

/**
 * Worker message: install a decrypting transform on an inbound encoded stream
 * pair.
 * @internal
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
 * Worker message: replace the worker-side key set.
 * @internal
 */
export interface SetKeysEvent {
    operation: "setKeys";
    keys: Key[];
}

/**
 * Worker message: update the local microphone RMS level embedded in outgoing
 * frames.
 * @internal
 */
export interface RmsEvent {
    operation: "rms";
    rms: number;
}

/**
 * Worker message: cancel the decode pipeline for a track.
 * @internal
 */
export interface StopEvent {
    operation: "stop";
    id: string;
}

/**
 * Union of all messages sent from the main thread to the E2EE worker.
 * @internal
 */
export type WorkerInboundEvent = EncodeEvent | DecodeEvent | SetKeysEvent | RmsEvent | StopEvent;

// ---- Outbound messages (worker → main thread) ----

/**
 * Worker reply: confirms a setKeys message has been applied.
 * @internal
 */
export interface SetKeysAckEvent {
    operation: "setKeys-ack";
}

/**
 * Worker event: RMS audio level extracted from a received frame.
 * @internal
 */
export interface RmsOutEvent {
    type: "rms";
    rms: number;
    receiverId: string | undefined;
    publisherId: number | undefined;
}

/**
 * Worker event: debug payload forwarded to the main thread.
 * @internal
 */
export interface DebugEvent {
    type: "debug";
    data: unknown;
}

/**
 * Worker event: error payload forwarded to the main thread.
 * @internal
 */
export interface ErrorEvent {
    type: "error";
    data: unknown;
}

/**
 * Union of all messages sent from the E2EE worker to the main thread.
 * @internal
 */
export type WorkerOutboundEvent = SetKeysAckEvent | RmsOutEvent | DebugEvent | ErrorEvent;
