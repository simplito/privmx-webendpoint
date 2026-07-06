import * as events from "./WorkerEvents.js";
import { KeyStore } from "../KeyStore.js";
import { LocalAudioLevelMeter } from "../audio/LocalAudioLevelMeter.js";
import { EncryptTransform, TransformContext } from "./EncryptTransform.js";

const keyStore = new KeyStore();
const encryptTransform = new EncryptTransform(keyStore);

// Active decode pipelines keyed by track id - so stop() can cancel them.
const sessions = new Map<string, { controller: AbortController }>();

// Local mic RMS, embedded in every outgoing frame so receivers can track audio activity.
let lastRms: number = LocalAudioLevelMeter.RMS_VALUE_OF_SILENCE;

const RMS_REPORT_INTERVAL_MS = 100;
const lastRmsReportByPublisher = new Map<number, number>();

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
        handleTransform(
            { id, publisherId },
            operation,
            kind ?? "video",
            event.transformer.readable,
            event.transformer.writable,
        );
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
                // A throw would error the TransformStream and permanently stop
                // this track; drop the frame instead (never enqueue plaintext).
                try {
                    await encryptTransform.encryptFrame(
                        encodedFrame as RTCEncodedAudioFrame | RTCEncodedVideoFrame,
                        kind,
                        controller,
                        lastRms,
                    );
                } catch (err) {
                    postError(err);
                }
            },
        });
        readableStream.pipeThrough(transform).pipeTo(writableStream).catch(logPipelineError);
    } else {
        const abort = new AbortController();
        const transform = new TransformStream({
            async transform(encodedFrame, controller) {
                let rms: number | null = null;
                // Pass through on failure, matching the unknown-key/failed-AEAD
                // behaviour, so the TransformStream never errors permanently.
                try {
                    rms = await encryptTransform.decryptFrame(
                        encodedFrame as RTCEncodedVideoFrame | RTCEncodedAudioFrame,
                        kind,
                        controller,
                    );
                } catch (err) {
                    postError(err);
                    try {
                        controller.enqueue(encodedFrame);
                    } catch {
                        // controller already errored - nothing more to salvage
                    }
                }
                if (rms !== null && kind === "audio" && context.publisherId !== undefined) {
                    const now = Date.now();
                    const last = lastRmsReportByPublisher.get(context.publisherId) ?? 0;
                    if (now - last >= RMS_REPORT_INTERVAL_MS) {
                        lastRmsReportByPublisher.set(context.publisherId, now);
                        const msg: events.RmsOutEvent = {
                            type: "rms",
                            rms,
                            receiverId: context.id,
                            publisherId: context.publisherId,
                        };
                        (self as unknown as Worker).postMessage(msg);
                    }
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
