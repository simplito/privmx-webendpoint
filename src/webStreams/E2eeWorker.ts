import { Key } from "../Types";
import {
    DecodeEvent,
    EncodeEvent,
    RmsEvent,
    SetKeysEvent,
    StopEvent,
    WorkerOutboundEvent,
} from "./worker/WorkerEvents";

/**
 * Owns the E2EE Web Worker process: spawning, key distribution, RMS forwarding,
 * and raw stream/transform posting. Has no knowledge of RTCRtpSender/Receiver.
 */
export class E2eeWorker {
    private worker: Worker | undefined;

    constructor(
        private readonly assetsDir: string,
        private readonly onRmsFrame: (publisherId: number, rms: number) => void,
    ) {}

    async get(): Promise<Worker> {
        if (!this.worker) {
            this.worker = new Worker(this.assetsDir + "/privmx-worker.js");
            this.worker.onmessage = (event: MessageEvent<WorkerOutboundEvent>) => {
                if ("type" in event.data && event.data.type === "rms") {
                    this.onRmsFrame(event.data.publisherId ?? 0, event.data.rms);
                }
            };
            this.worker.onerror = (e) => console.error("[E2eeWorker]", e);
        }
        return this.worker;
    }

    async setKeys(keys: Key[]): Promise<void> {
        const worker = await this.get();
        return new Promise<void>((resolve) => {
            const ack = (ev: MessageEvent<WorkerOutboundEvent>) => {
                if ("operation" in ev.data && ev.data.operation === "setKeys-ack") {
                    worker.removeEventListener("message", ack);
                    resolve();
                }
            };
            worker.addEventListener("message", ack);
            worker.postMessage({ operation: "setKeys", keys } satisfies SetKeysEvent);
        });
    }

    async sendRms(rms: number): Promise<void> {
        const worker = await this.get();
        worker.postMessage({ operation: "rms", rms } satisfies RmsEvent);
    }

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

    async postStop(id: string): Promise<void> {
        const worker = await this.get();
        worker.postMessage({ operation: "stop", id } satisfies StopEvent);
    }

    stop(): void {
        this.worker?.terminate();
        this.worker = undefined;
    }
}
