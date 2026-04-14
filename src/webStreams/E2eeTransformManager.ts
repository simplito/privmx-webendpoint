import { Key } from "../Types";
import { EncPair } from "./WebRtcClientTypes";
import { WebWorker } from "./WebWorkerHelper";
import { Logger } from "./Logger";
import {
    RTCRtpSenderWithTransform,
    RTCRtpReceiverWithTransform,
    WindowWithRTCRtpScriptTransform,
} from "./types/WebRtcExtensions";

export class E2eeTransformManager {
    private e2eeWorker: Worker | undefined;
    private webWorkerApi: WebWorker | undefined;
    private readonly encByReceiver = new WeakMap<RTCRtpReceiver, EncPair>();
    private readonly logger: Logger = new Logger();

    constructor(
        private readonly assetsDir: string,
        private readonly onFrame: (publisherId: number, rms: number) => void,
    ) {}

    async getWorker(): Promise<Worker> {
        if (!this.e2eeWorker) {
            const workerApi = await this.getWorkerApi();
            this.e2eeWorker = workerApi.getWorker();
        }
        if (!this.e2eeWorker) {
            throw new Error("Worker not initialized.");
        }
        return this.e2eeWorker;
    }

    async getWorkerApi(): Promise<WebWorker> {
        if (!this.webWorkerApi) {
            this.webWorkerApi = new WebWorker(this.assetsDir, (frameInfo) => {
                this.onFrame(frameInfo.publisherId, frameInfo.rms);
            });
            await this.webWorkerApi.init_e2ee();
        }
        return this.webWorkerApi;
    }

    async setKeys(keys: Key[]): Promise<void> {
        await (await this.getWorkerApi()).setKeys(keys);
    }

    async initPipeline(receiverTrackId: string, publisherId: number): Promise<void> {
        const worker = await this.getWorker();
        return new Promise<void>((resolve) => {
            const listener = (ev: MessageEvent) => {
                if (ev.data.operation === "init-pipeline" && ev.data.id === receiverTrackId) {
                    worker.removeEventListener("message", listener);
                    resolve();
                }
            };
            worker.addEventListener("message", listener);
            worker.postMessage({
                operation: "init-pipeline",
                id: receiverTrackId,
                publisherId,
            });
        });
    }

    async setupSenderTransform(sender: RTCRtpSender): Promise<void> {
        const worker = await this.getWorker();
        const win = window as unknown as WindowWithRTCRtpScriptTransform;
        if (win.RTCRtpScriptTransform) {
            (sender as RTCRtpSenderWithTransform).transform = new win.RTCRtpScriptTransform(
                worker,
                { operation: "encode" },
            );
        } else {
            this.logger.debug("Worker - encoding frames using EncodedStreams");
            const senderStreams = (sender as RTCRtpSenderWithTransform).createEncodedStreams();
            worker.postMessage(
                {
                    operation: "encode",
                    readableStream: senderStreams.readable,
                    writableStream: senderStreams.writable,
                },
                [senderStreams.readable, senderStreams.writable],
            );
        }
    }

    async setupReceiverTransform(receiver: RTCRtpReceiver, publisherId: number): Promise<void> {
        const worker = await this.getWorker();
        const win = window as unknown as WindowWithRTCRtpScriptTransform;
        const receiverExt = receiver as RTCRtpReceiverWithTransform;

        if (win.RTCRtpScriptTransform && !receiverExt.transform) {
            this.logger.debug("-> using RtpScriptTransform");
            receiverExt.transform = new win.RTCRtpScriptTransform(worker, {
                operation: "decode",
                id: receiver.track.id,
                publisherId,
            });
            return;
        }
        this.logger.debug("-> using EncodedStreams");

        if (
            !this.encByReceiver.has(receiver) &&
            typeof receiverExt.createEncodedStreams === "function"
        ) {
            this.logger.debug("-> call for createEncodedStreams()");
            const { readable, writable } = receiverExt.createEncodedStreams();
            const enc: EncPair = {
                readable,
                writable,
                id: receiver.track.id,
                publisherId,
                posted: false,
            };
            this.encByReceiver.set(receiver, enc);

            this.logger.debug("-> posting EncodedStreams to worker (should happen only once)");
            await this.initPipeline(enc.id, enc.publisherId);

            worker.postMessage(
                {
                    operation: "decode",
                    id: enc.id,
                    publisherId: enc.publisherId,
                    readableStream: enc.readable,
                    writableStream: enc.writable,
                },
                [enc.readable, enc.writable],
            );
        } else {
            this.logger.debug("-> EncodedStreams posted to worker already.");
        }
    }

    async teardownReceiver(receiver: RTCRtpReceiver): Promise<void> {
        const worker = await this.getWorker();
        const enc = this.encByReceiver.get(receiver);
        if (enc) {
            worker.postMessage({ operation: "stop", id: enc.id });
            this.encByReceiver.delete(receiver);
        }
    }
}
