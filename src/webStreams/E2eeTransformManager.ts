import { Logger } from "./Logger";

type EncPair = {
    readable: ReadableStream<unknown>;
    writable: WritableStream<unknown>;
    id: string;
    publisherId: number;
    posted: boolean;
};
import {
    RTCRtpSenderWithTransform,
    RTCRtpReceiverWithTransform,
    WindowWithRTCRtpScriptTransform,
} from "./types/WebRtcExtensions";
import { E2eeWorker } from "./E2eeWorker";

/**
 * Wires the E2EE worker into WebRTC sender and receiver pipelines.
 *
 * Prefers the modern `RTCRtpScriptTransform` API (available in Chrome ≥ 94 and
 * Safari ≥ 15.4). Falls back to the `createEncodedStreams()` API when
 * `RTCRtpScriptTransform` is absent (Firefox, older browsers).
 */
export class E2eeTransformManager {
    private readonly encByReceiver = new WeakMap<RTCRtpReceiver, EncPair>();
    private readonly logger: Logger = new Logger();

    constructor(private readonly e2eeWorker: E2eeWorker) {}

    /**
     * Installs an E2EE sender transform on `sender`.
     *
     * Uses `RTCRtpScriptTransform` when available; otherwise transfers the
     * sender's encoded-stream pair to the worker via `postEncode`.
     */
    async setupSenderTransform(sender: RTCRtpSender): Promise<void> {
        const win = window as unknown as WindowWithRTCRtpScriptTransform;
        const senderExt = sender as RTCRtpSenderWithTransform;
        if (win.RTCRtpScriptTransform) {
            const worker = await this.e2eeWorker.get();
            senderExt.transform = new win.RTCRtpScriptTransform(worker, {
                operation: "encode",
                kind: sender.track?.kind,
            });
        } else {
            this.logger.debug("Sender: using EncodedStreams");
            const { readable, writable } = senderExt.createEncodedStreams();
            await this.e2eeWorker.postEncode(readable, writable);
        }
    }

    /**
     * Installs an E2EE receiver transform on `receiver` for the given `publisherId`.
     *
     * Uses `RTCRtpScriptTransform` when available. Falls back to `createEncodedStreams()`,
     * guarding against double-posting the same stream pair to the worker.
     * No-ops if `createEncodedStreams` is not supported by the browser.
     */
    async setupReceiverTransform(receiver: RTCRtpReceiver, publisherId: number): Promise<void> {
        const win = window as unknown as WindowWithRTCRtpScriptTransform;
        const receiverExt = receiver as RTCRtpReceiverWithTransform;

        if (win.RTCRtpScriptTransform && !receiverExt.transform) {
            this.logger.debug("Receiver: using RTCRtpScriptTransform");
            const worker = await this.e2eeWorker.get();
            receiverExt.transform = new win.RTCRtpScriptTransform(worker, {
                operation: "decode",
                id: receiver.track.id,
                publisherId,
                kind: receiver.track.kind,
            });
            return;
        }

        this.logger.debug("Receiver: using EncodedStreams");
        if (this.encByReceiver.has(receiver)) {
            this.logger.debug("Receiver: EncodedStreams already posted");
            return;
        }
        if (typeof receiverExt.createEncodedStreams !== "function") {
            return;
        }

        const { readable, writable } = receiverExt.createEncodedStreams();
        const enc: EncPair = {
            readable,
            writable,
            id: receiver.track.id,
            publisherId,
            posted: false,
        };
        this.encByReceiver.set(receiver, enc);
        await this.e2eeWorker.postDecode(enc.id, enc.publisherId, enc.readable, enc.writable);
    }

    /**
     * Tears down the E2EE receiver pipeline for `receiver` by posting a stop
     * message to the worker and removing the entry from the internal map.
     * No-ops if no transform was registered for `receiver`.
     */
    async teardownReceiver(receiver: RTCRtpReceiver): Promise<void> {
        const enc = this.encByReceiver.get(receiver);
        if (enc) {
            await this.e2eeWorker.postStop(enc.id);
            this.encByReceiver.delete(receiver);
        }
    }
}
