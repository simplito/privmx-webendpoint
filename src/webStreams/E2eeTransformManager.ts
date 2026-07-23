import { Logger } from "./Logger.js";

type EncPair = {
    readable: ReadableStream<unknown>;
    writable: WritableStream<unknown>;
    id: string;
};
import {
    RTCRtpSenderWithTransform,
    RTCRtpReceiverWithTransform,
    WindowWithRTCRtpScriptTransform,
} from "./types/WebRtcExtensions.js";
import { E2eeWorker } from "./E2eeWorker.js";

/**
 * Wires the E2EE worker into WebRTC sender and receiver pipelines.
 *
 * Prefers the modern `RTCRtpScriptTransform` API (Safari ≥ 15.4, Firefox ≥ 117,
 * Chrome ≥ 141). Falls back to the `createEncodedStreams()` API when
 * `RTCRtpScriptTransform` is absent (older Chromium-based browsers).
 * @internal
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
     *
     * `kind` MUST be passed explicitly by the caller (from the track being
     * published) rather than read from `sender.track?.kind`: during
     * renegotiation/reconnect the sender's track can still be null here, which
     * would make the worker fall back to the "video" header layout and corrupt
     * outgoing audio frames (audio uses a 1-byte header, video 1/3/10 bytes).
     */
    async setupSenderTransform(sender: RTCRtpSender, kind: "audio" | "video"): Promise<void> {
        const win = window as unknown as WindowWithRTCRtpScriptTransform;
        const senderExt = sender as RTCRtpSenderWithTransform;
        if (win.RTCRtpScriptTransform) {
            const worker = await this.e2eeWorker.get();
            senderExt.transform = new win.RTCRtpScriptTransform(worker, {
                operation: "encode",
                kind,
            });
        } else {
            this.logger.debug("Sender: using EncodedStreams");
            const { readable, writable } = senderExt.createEncodedStreams();
            await this.e2eeWorker.postEncode(readable, writable, kind);
        }
    }

    /**
     * Installs an E2EE receiver transform on `receiver`.
     *
     * Uses `RTCRtpScriptTransform` when available. Falls back to `createEncodedStreams()`,
     * guarding against double-posting the same stream pair to the worker.
     * No-ops if `createEncodedStreams` is not supported by the browser.
     *
     * The same receiver can be handed to us more than once: when a remote peer
     * rejoins, the SFU recycles the freed m-line and `ontrack` re-fires with a
     * receiver whose transform is already installed. The transform is then
     * replaced; the two transform APIs are never mixed on one receiver.
     */
    async setupReceiverTransform(receiver: RTCRtpReceiver): Promise<void> {
        const win = window as unknown as WindowWithRTCRtpScriptTransform;
        const receiverExt = receiver as RTCRtpReceiverWithTransform;
        const kind = receiver.track.kind as "audio" | "video";

        if (win.RTCRtpScriptTransform) {
            this.logger.debug("Receiver: using RTCRtpScriptTransform");
            const worker = await this.e2eeWorker.get();
            const hadTransform = !!receiverExt.transform;
            try {
                receiverExt.transform = new win.RTCRtpScriptTransform(worker, {
                    operation: "decode",
                    id: receiver.track.id,
                    kind,
                });
            } catch (e) {
                if (!hadTransform) throw e;
                // The existing transform shares the same worker and key store, so
                // decryption keeps working.
                this.logger.warn("Receiver: keeping existing transform, replacement rejected:", e);
            }
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
        };
        this.encByReceiver.set(receiver, enc);
        await this.e2eeWorker.postDecode(enc.id, enc.readable, enc.writable, kind);
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
