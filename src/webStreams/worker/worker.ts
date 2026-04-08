import { Utils } from "../Utils";
import * as events from "./WorkerEvents";
import { CryptoFacade } from "../../crypto/CryptoFacade";
import { KeyStore } from "../KeyStore";
import { LocalAudioLevelMeter } from "../audio/LocalAudioLevelMeter";

const keyStore = new KeyStore();

const NUM_AS_UINT8_SIZE = 1;
const DEBUG = false;
const sessions = new Map<string, { pipeline: Promise<void> }>();
const pipelines = new Map<string, { ready: boolean }>();

let lastRMS = LocalAudioLevelMeter.RMS_VALUE_OF_SILENCE;
let recvRMS = LocalAudioLevelMeter.RMS_VALUE_OF_SILENCE;
let recvRMSTimestamp = Date.now();

export interface TransformContext {
    id?: string;
    publisherId?: number;
}

interface TransformerOptions {
    operation: "encode" | "decode";
    kind: "audio" | "video";
    id?: string;
    publisherId?: number;
}

export class EncryptTransform {
    constructor(private keyStore: KeyStore) {}

    private getHeaderSizeByType(type: RTCEncodedVideoFrameType) {
        if (type === "key") return 10;
        if (type === "delta") return 3;
        if (type === "empty") return 1;
        return 0;
    }

    private async resolveKeyId(key: Uint8Array): Promise<string> {
        return this.keyStore.importKeyIfAbsent(key, { name: "AES-GCM" }, ["encrypt", "decrypt"]);
    }

    private async encryptFrame_aes(
        rawKey: Uint8Array,
        iv: Uint8Array,
        data: Uint8Array,
        header: Uint8Array,
    ): Promise<Uint8Array> {
        const keyId = await this.resolveKeyId(rawKey);
        const encrypted = await CryptoFacade.aeadEncrypt(
            keyId,
            iv,
            header,
            data,
        );
        return new Uint8Array(encrypted);
    }

    private async decryptFrame_aes(
        rawKey: Uint8Array,
        iv: Uint8Array,
        encryptedData: Uint8Array,
        header: Uint8Array,
    ): Promise<Uint8Array | null> {
        if (encryptedData.length < 16) {
            return null;
        }
        const keyId = await this.resolveKeyId(rawKey);
        const data = encryptedData.slice(0, encryptedData.length - 16);
        const tag = encryptedData.slice(encryptedData.length - 16);
        try {
            const decrypted = await CryptoFacade.aeadDecrypt(keyId, iv, header, data, tag);
            return new Uint8Array(decrypted);
        } catch {
            return null;
        }
    }

    async encryptFrame(
        encodedFrame: RTCEncodedAudioFrame | RTCEncodedVideoFrame,
        kind: string,
        controller: TransformStreamDefaultController<any>,
    ) {
        const headerLen =
            kind === "video" ? this.getHeaderSizeByType((encodedFrame as any).type) : 1;
        const frameHeader = new Uint8Array(encodedFrame.data, 0, headerLen);
        const frameBody = new Uint8Array(encodedFrame.data, headerLen);

        const iv = Utils.genIvAsBuffer();
        const keyId = this.keyStore.getEncryptionKeyId();
        const rawKey = this.keyStore.getRawEncryptionKey();

        const encrypted = await this.encryptFrame_aes(rawKey, iv, frameBody, frameHeader);
        if (!encrypted) {
            throw new Error("Cannot encrypt frame");
        }
        const keyIdAsUint8 = new TextEncoder().encode(keyId);

        const posOfCipher = frameHeader.byteLength;
        const posOfIv = posOfCipher + encrypted.byteLength;
        const posOfIvSize = posOfIv + iv.byteLength;
        const posOfKeyId = posOfIvSize + NUM_AS_UINT8_SIZE;
        const posOfKeyIdSize = posOfKeyId + keyIdAsUint8.byteLength;
        const posOfRMS = posOfKeyIdSize + NUM_AS_UINT8_SIZE;

        const result = new ArrayBuffer(posOfRMS + NUM_AS_UINT8_SIZE);
        const resultUint8 = new Uint8Array(result);

        resultUint8.set(frameHeader);
        resultUint8.set(encrypted, posOfCipher);
        resultUint8.set(iv, posOfIv);
        resultUint8.set(Utils.numAsOneByteUint(iv.byteLength), posOfIvSize);
        resultUint8.set(keyIdAsUint8, posOfKeyId);
        resultUint8.set(Utils.numAsOneByteUint(keyIdAsUint8.byteLength), posOfKeyIdSize);
        resultUint8.set(Utils.numAsOneByteUint(lastRMS + 100), posOfRMS);

        encodedFrame.data = result;
        controller.enqueue(encodedFrame);
    }

    async decryptFrame(
        encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
        kind: string,
        controller: TransformStreamDefaultController<any>,
        receiverId?: string,
        publisherId?: number,
    ) {
        const headerLen =
            kind === "video"
                ? this.getHeaderSizeByType((encodedFrame as RTCEncodedVideoFrame).type)
                : 1;
        const data = encodedFrame.data;

        if (data.byteLength < headerLen + 5) {
            // Sanity check for minimum metadata size
            controller.enqueue(encodedFrame);
            return;
        }

        const frameHeader = new Uint8Array(data, 0, headerLen);
        const rmsPos = data.byteLength - 1;
        recvRMS = new Uint8Array(data, rmsPos, 1)[0] - 100;

        const currTime = Date.now();
        if (recvRMSTimestamp + 100 < currTime) {
            recvRMSTimestamp = currTime;
            (self as any).postMessage({ type: "rms", rms: recvRMS, receiverId, publisherId });
        }

        const keyIdLenPos = rmsPos - 1;
        const keyIdLen = new Uint8Array(data, keyIdLenPos, 1)[0];
        const keyIdPos = keyIdLenPos - keyIdLen;
        const keyId = new TextDecoder().decode(new Uint8Array(data, keyIdPos, keyIdLen));

        const ivLenPos = keyIdPos - 1;
        const ivLen = new Uint8Array(data, ivLenPos, 1)[0];
        const ivPos = ivLenPos - ivLen;
        const iv = new Uint8Array(data, ivPos, ivLen);

        const payloadPos = headerLen;
        const payloadLen = ivPos - headerLen;
        const payload = new Uint8Array(data.slice(payloadPos, payloadPos + payloadLen));

        try {
            if (!this.keyStore.hasKey(keyId)) {
                controller.enqueue(encodedFrame);
                return;
            }
            const rawKey = this.keyStore.getRawKey(keyId);
            const plain = await this.decryptFrame_aes(rawKey, iv, payload, frameHeader);

            if (!plain) {
                controller.enqueue(encodedFrame);
                return;
            }

            const result = new ArrayBuffer(frameHeader.byteLength + plain.byteLength);
            const writableResult = new Uint8Array(result);
            writableResult.set(frameHeader);
            writableResult.set(plain, frameHeader.byteLength);

            encodedFrame.data = result;
            controller.enqueue(encodedFrame);
        } catch (e) {
            logError(e);
            controller.enqueue(encodedFrame);
        }
    }
}


self.addEventListener("message", async (event: MessageEvent) => {
    if (!event || !event.data || typeof event.data !== "object" || !event.data.operation) return;
    const { operation, kind } = event.data;

    if (operation === "initialize") {
        logDebug("worker initialize call");
    } else if (operation === "init-pipeline") {
        pipelines.set(event.data.id, { ready: false });
        self.postMessage({ operation: "init-pipeline", id: event.data.id });
    } else if (operation === "encode" || operation === "decode") {
        const { readableStream, writableStream, id, publisherId } = event.data;
        const context: TransformContext = { id, publisherId };
        handleTransform(context, operation, kind, readableStream, writableStream);
    } else if (operation === "setKeys") {
        const data = event.data as events.SetKeysEvent;
        keyStore.setKeys(data.keys);
    } else if (operation === "rms") {
        lastRMS = Math.round(event.data.rms as number);
    }
});

function createSenderTransform(kind: string) {
    const encrypter = new EncryptTransform(keyStore);
    return new TransformStream({
        async transform(encodedFrame, controller) {
            await encrypter.encryptFrame(encodedFrame, kind, controller);
        },
    });
}

function createReceiverTransform(context: TransformContext, kind: string) {
    const encrypter = new EncryptTransform(keyStore);
    return new TransformStream({
        async transform(encodedFrame, controller) {
            await encrypter.decryptFrame(
                encodedFrame,
                kind,
                controller,
                context.id,
                context.publisherId,
            );
        },
    });
}

function handleTransform(
    context: TransformContext,
    operation: string,
    kind: string,
    readableStream: ReadableStream,
    writableStream: WritableStream,
) {
    let transformStream: TransformStream;
    logDebug("handleTransform: " + JSON.stringify({ operation, context }));

    if (operation === "encode") {
        transformStream = createSenderTransform(kind);
        readableStream.pipeThrough(transformStream).pipeTo(writableStream);
    } else if (operation === "decode") {
        transformStream = createReceiverTransform(context, kind);
        const pipeline = readableStream
            .pipeThrough(transformStream)
            .pipeTo(writableStream)
            .catch((err: any) => {
                if (!String(err).includes("Destination stream closed")) {
                    console.error("pipeline error", err);
                }
            });

        if (context.id) {
            sessions.set(context.id, { pipeline });
        }
    }
}

if ((self as any).RTCTransformEvent) {
    (self as any).onrtctransform = (event: any) => {
        const transformer = event.transformer;
        const options = transformer.options as TransformerOptions;

        if (!options) {
            logError("onrtctransform: options is undefined");
            return;
        }

        const { operation, kind, id, publisherId } = options;

        const context: TransformContext = {
            id,
            publisherId,
        };

        handleTransform(context, operation, kind, transformer.readable, transformer.writable);
    };
}

/**
 * LOGGING UTILS
 */
function logDebug(msg: any) {
    if (!DEBUG) return;
    self.postMessage({ type: "debug", data: msg });
}

function logError(msg: any) {
    self.postMessage({ type: "error", data: msg });
}

logDebug("Worker Initialized");
