import * as events from "./WorkerEvents";
import { KeyStore } from "../KeyStore";
import { LocalAudioLevelMeter } from "../audio/LocalAudioLevelMeter";
import { EncryptTransform, TransformContext } from "./EncryptTransform";

const keyStore = new KeyStore();
const encryptTransform = new EncryptTransform(keyStore);

// Active decode pipelines keyed by track id — stored so stop() can cancel them.
const sessions = new Map<string, { controller: AbortController }>();

// Local microphone RMS level — updated by the main thread via "rms" messages,
// embedded in every outgoing encrypted frame so receivers can track audio activity.
let lastRms: number = LocalAudioLevelMeter.RMS_VALUE_OF_SILENCE;

// ---------------------------------------------------------------------------
// RTCRtpScriptTransform entry point (modern browsers)
// ---------------------------------------------------------------------------

interface RTCTransformEvent extends Event {
    transformer: {
        options: unknown;
        readable: ReadableStream<unknown>;
        writable: WritableStream<unknown>;
    };
}

interface TransformerOptions {
    operation: "encode" | "decode";
    kind: "audio" | "video";
    id?: string;
    publisherId?: number;
}

if ((self as unknown as { RTCTransformEvent: unknown }).RTCTransformEvent) {
    (self as unknown as { onrtctransform: (event: RTCTransformEvent) => void }).onrtctransform = (
        event: RTCTransformEvent,
    ) => {
        const options = event.transformer.options as TransformerOptions | undefined;
        if (!options) {
            postError("onrtctransform: options is undefined");
            return;
        }

        const { operation, kind, id, publisherId } = options;
        const context: TransformContext = { id, publisherId };
        handleTransform(context, operation, kind, event.transformer.readable, event.transformer.writable);
    };
}

// ---------------------------------------------------------------------------
// EncodedStreams / postMessage entry point (fallback)
// ---------------------------------------------------------------------------

self.addEventListener("message", (event: MessageEvent<events.WorkerInboundEvent>) => {
    if (!event?.data || typeof event.data !== "object" || !event.data.operation) return;
    const msg = event.data;

    if (msg.operation === "encode") {
        handleTransform(
            {},
            msg.operation,
            msg.kind ?? "video",
            msg.readableStream,
            msg.writableStream,
        );
    } else if (msg.operation === "decode") {
        handleTransform(
            { id: msg.id, publisherId: msg.publisherId },
            msg.operation,
            msg.kind ?? "video",
            msg.readableStream,
            msg.writableStream,
        );
    } else if (msg.operation === "setKeys") {
        keyStore.setKeys(msg.keys).then(() => {
            const ack: events.SetKeysAckEvent = { operation: "setKeys-ack" };
            (self as unknown as Worker).postMessage(ack);
        });
    } else if (msg.operation === "rms") {
        lastRms = Math.round(msg.rms);
    } else if (msg.operation === "stop") {
        const session = sessions.get(msg.id);
        if (session) {
            session.controller.abort();
            sessions.delete(msg.id);
        }
    }
});

// ---------------------------------------------------------------------------
// Transform pipeline helpers
// ---------------------------------------------------------------------------

function handleTransform(
    context: TransformContext,
    operation: "encode" | "decode",
    kind: string,
    readableStream: ReadableStream<unknown>,
    writableStream: WritableStream<unknown>,
): void {
    if (operation === "encode") {
        const transform = new TransformStream({
            async transform(encodedFrame, controller) {
                await encryptTransform.encryptFrame(
                    encodedFrame as RTCEncodedAudioFrame | RTCEncodedVideoFrame,
                    kind,
                    controller,
                    lastRms,
                );
            },
        });
        readableStream.pipeThrough(transform).pipeTo(writableStream).catch(logPipelineError);
    } else {
        const abort = new AbortController();
        const transform = new TransformStream({
            async transform(encodedFrame, controller) {
                const rms = await encryptTransform.decryptFrame(
                    encodedFrame as RTCEncodedVideoFrame | RTCEncodedAudioFrame,
                    kind,
                    controller,
                );
                if (rms !== null && context.publisherId !== undefined) {
                    const msg: events.RmsOutEvent = {
                        type: "rms",
                        rms,
                        receiverId: context.id,
                        publisherId: context.publisherId,
                    };
                    (self as unknown as Worker).postMessage(msg);
                }
            },
        });

        const pipeline = readableStream
            .pipeThrough(transform, { signal: abort.signal })
            .pipeTo(writableStream, { signal: abort.signal })
            .catch(logPipelineError);

        if (context.id) {
            sessions.set(context.id, { controller: abort });
        }

        void pipeline;
    }
}

function logPipelineError(err: unknown): void {
    if (!String(err).includes("Destination stream closed") && !String(err).includes("AbortError")) {
        postError(err);
    }
}

function postError(msg: unknown): void {
    const err: events.ErrorEvent = { type: "error", data: msg };
    (self as unknown as Worker).postMessage(err);
}
