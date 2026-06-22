import { Key } from "../Types.js";
import {
    DecodeEvent,
    EncodeEvent,
    RmsEvent,
    SetKeysEvent,
    StopEvent,
    WorkerOutboundEvent,
} from "./worker/WorkerEvents.js";

/**
 * Owns the E2EE Web Worker process: spawning, key distribution, RMS forwarding,
 * and raw stream/transform posting.
 *
 * The worker is created lazily on the first call to `get()` and terminated by
 * `stop()`. Has no knowledge of `RTCRtpSender`/`RTCRtpReceiver` - all WebRTC
 * wiring is the responsibility of `E2eeTransformManager`.
 * @internal
 */
export class E2eeWorker {
    private worker: Worker | undefined;
    private workerError: Error | undefined;
    // Pending operation rejects, so worker failure/teardown rejects them instead of hanging.
    private readonly pendingRejects = new Set<(err: Error) => void>();

    constructor(
        private readonly workerUrl: string,
        private readonly onRmsFrame: (publisherId: number, rms: number) => void,
    ) {}

    /**
     * Returns the underlying `Worker`, creating it on first call.
     * Subsequent calls return the same instance.
     *
     * @throws {Error} when the worker previously failed (e.g. `privmx-worker.js`
     *   could not be loaded from the configured asset URL).
     */
    async get(): Promise<Worker> {
        if (this.workerError) {
            throw this.workerError;
        }
        if (!this.worker) {
            this.worker = new Worker(this.workerUrl);
            this.worker.onmessage = (event: MessageEvent<WorkerOutboundEvent>) => {
                if ("type" in event.data && event.data.type === "rms") {
                    this.onRmsFrame(event.data.publisherId ?? 0, event.data.rms);
                }
            };
            this.worker.onerror = (e: ErrorEvent) => {
                const err = new Error(
                    `PrivMX E2EE worker error${e.message ? `: ${e.message}` : ""} - ` +
                        `verify that the worker is served from "${this.workerUrl}" ` +
                        "(assetsBasePath or workerUrl passed to EndpointFactory.setup()).",
                );
                this.workerError = err;
                this.failPending(err);
            };
        }
        return this.worker;
    }

    private failPending(err: Error): void {
        for (const reject of this.pendingRejects) {
            reject(err);
        }
        this.pendingRejects.clear();
    }

    /**
     * Sends a `setKeys` message to the worker and waits for the `setKeys-ack`
     * acknowledgement before resolving.
     */
    async setKeys(keys: Key[]): Promise<void> {
        const worker = await this.get();
        return new Promise<void>((resolve, reject) => {
            const rejectPending = (err: Error) => {
                worker.removeEventListener("message", ack);
                reject(err);
            };
            const ack = (ev: MessageEvent<WorkerOutboundEvent>) => {
                if ("operation" in ev.data && ev.data.operation === "setKeys-ack") {
                    worker.removeEventListener("message", ack);
                    this.pendingRejects.delete(rejectPending);
                    resolve();
                }
            };
            this.pendingRejects.add(rejectPending);
            worker.addEventListener("message", ack);
            worker.postMessage({ operation: "setKeys", keys } satisfies SetKeysEvent);
        });
    }

    /**
     * Forwards the current local microphone RMS level to the worker so it can
     * be embedded in the encrypted frame trailer of outbound audio frames.
     */
    async sendRms(rms: number): Promise<void> {
        const worker = await this.get();
        worker.postMessage({ operation: "rms", rms } satisfies RmsEvent);
    }

    /**
     * Transfers `readable`/`writable` encoded-stream pair to the worker for
     * encryption. Used as the `EncodedStreams` fallback when
     * `RTCRtpScriptTransform` is unavailable.
     */
    async postEncode(
        readable: ReadableStream<unknown>,
        writable: WritableStream<unknown>,
    ): Promise<void> {
        const worker = await this.get();
        worker.postMessage(
            {
                operation: "encode",
                readableStream: readable,
                writableStream: writable,
            } satisfies EncodeEvent,
            [readable as unknown as Transferable, writable as unknown as Transferable],
        );
    }

    /**
     * Transfers `readable`/`writable` encoded-stream pair to the worker for
     * decryption. Used as the `EncodedStreams` fallback when
     * `RTCRtpScriptTransform` is unavailable.
     *
     * @param id         Unique track ID used by the worker to identify the pipeline.
     * @param publisherId Numeric WebRTC stream ID of the remote publisher.
     */
    async postDecode(
        id: string,
        publisherId: number,
        readable: ReadableStream<unknown>,
        writable: WritableStream<unknown>,
    ): Promise<void> {
        const worker = await this.get();
        worker.postMessage(
            {
                operation: "decode",
                id,
                publisherId,
                readableStream: readable,
                writableStream: writable,
            } satisfies DecodeEvent,
            [readable as unknown as Transferable, writable as unknown as Transferable],
        );
    }

    /**
     * Instructs the worker to stop and tear down the decode pipeline identified
     * by `id`.
     */
    async postStop(id: string): Promise<void> {
        const worker = await this.get();
        worker.postMessage({ operation: "stop", id } satisfies StopEvent);
    }

    /**
     * Terminates the underlying `Worker` thread and clears the reference.
     * Safe to call multiple times. Called automatically by `WebRtcClient.destroy()`.
     */
    stop(): void {
        this.failPending(new Error("PrivMX E2EE worker stopped before the operation completed."));
        this.worker?.terminate();
        this.worker = undefined;
        this.workerError = undefined;
    }
}
