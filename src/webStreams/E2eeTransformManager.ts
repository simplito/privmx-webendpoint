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
 * Wires the E2EE worker into WebRTC sender/receiver pipelines.
 * Supports both RTCRtpScriptTransform (modern) and EncodedStreams (fallback).
 */
export class E2eeTransformManager {
    private readonly encByReceiver = new WeakMap<RTCRtpReceiver, EncPair>();
    private readonly logger: Logger = new Logger();

    constructor(private readonly e2eeWorker: E2eeWorker) {}

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

    async teardownReceiver(receiver: RTCRtpReceiver): Promise<void> {
        const enc = this.encByReceiver.get(receiver);
        if (enc) {
            await this.e2eeWorker.postStop(enc.id);
            this.encByReceiver.delete(receiver);
        }
    }
}
