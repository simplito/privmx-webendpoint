import { Utils } from "../Utils";
import {
    encryptWithAES256GCM,
    decryptWithAES256GCM,
    isEncryptionSuccess,
    isDecryptionSuccess,
} from "../CryptoUtils";
import * as events from "./WorkerEvents";
import { KeyStore } from "../KeyStore";

const NUM_AS_UINT8_SIZE = 1;
const DEBUG = false;
const sessions = new Map();
const pipelines = new Map();
let lastRMS = -99;
let recvRMS = -99;
let recvRMSTimestamp = Date.now();
export interface TransformContext {
    keyStore: KeyStore;
    id?: string;
    publisherId?: number;
}

export class EncryptTransform {
    // eslint-disable-line no-unused-vars
    constructor(private keyStore: KeyStore) {}

    private getHeaderSizeByType(type: RTCEncodedVideoFrameType) {
        if (type === "key") return 10;
        if (type === "delta") return 3;
        if (type === "empty") return 1;
        return 0;
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
        const keyEntry = this.keyStore.getEncriptionKey();

        const cryptoResult = await encryptWithAES256GCM(keyEntry.key, iv, frameBody, frameHeader);
        if (!isEncryptionSuccess(cryptoResult)) {
            throw new Error("Cannot encrypt frame");
        }
        const keyIdAsUint8 = new TextEncoder().encode(keyEntry.keyId);

        const posOfCipher = frameHeader.byteLength;
        const posOfIv = posOfCipher + cryptoResult.data.byteLength;
        const posOfIvSize = posOfIv + iv.byteLength;
        const posOfKeyId = posOfIvSize + NUM_AS_UINT8_SIZE;
        const posOfKeyIdSize = posOfKeyId + keyIdAsUint8.byteLength;

        // rms
        const posOfRMS = posOfKeyIdSize + NUM_AS_UINT8_SIZE;

        const result = new ArrayBuffer(posOfRMS + NUM_AS_UINT8_SIZE);
        const resultUint8 = new Uint8Array(result);

        resultUint8.set(frameHeader);
        resultUint8.set(cryptoResult.data, posOfCipher);
        resultUint8.set(iv, posOfIv);
        resultUint8.set(Utils.numAsOneByteUint(iv.byteLength), posOfIvSize);
        resultUint8.set(keyIdAsUint8, posOfKeyId);
        resultUint8.set(Utils.numAsOneByteUint(keyIdAsUint8.byteLength), posOfKeyIdSize);
        // logError({msg: "rms before", lastRMS});
        resultUint8.set(Utils.numAsOneByteUint(lastRMS + 100), posOfRMS);
        // logError({
        //     msg: "RMS written byte",
        //     rms: resultUint8[posOfRMS] - 100
        // });
        encodedFrame.data = result;
        controller.enqueue(encodedFrame);
    }

    async decryptFrame(
        encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
        kind: string,
        controller: TransformStreamDefaultController<any>,
        receiverId: string,
        publisherId: number
    ) {
        const headerLen =
            kind === "video" ? this.getHeaderSizeByType((encodedFrame as RTCEncodedVideoFrame).type) : 1;
        const data = encodedFrame.data;
        const frameHeader = new Uint8Array(data, 0, headerLen);
        

        const rmsPos = data.byteLength - 1;
        recvRMS = new Uint8Array(data, rmsPos, 1)[0] - 100;
        const currTime = Date.now();
        if (recvRMSTimestamp + 100 < currTime) {
            recvRMSTimestamp = currTime;
            self.postMessage({ type: "rms", rms: recvRMS, receiverId, publisherId });
        }


        const keyIdLenPos = rmsPos - 1;
        const keyIdLen = new Uint8Array(data, keyIdLenPos, 1)[0];

        const keyIdPos = keyIdLenPos - keyIdLen;
        const keyId = new TextDecoder().decode(
            new Uint8Array(data, keyIdPos, keyIdLen)
        );

        const ivLenPos = keyIdPos - 1;
        const ivLen = new Uint8Array(data, ivLenPos, 1)[0];

        const ivPos = ivLenPos - ivLen;
        const iv = new Uint8Array(data, ivPos, ivLen);

        const payloadPos = headerLen;
        const payloadLen = ivPos - headerLen;
        const payload = data.slice(payloadPos, payloadPos + payloadLen);

        try {
            if (!this.keyStore.hasKey(keyId)) {
                // logError({msg: "Decryption failed. Cannot find key", keyId, store: this.keyStore});
                controller.enqueue(encodedFrame);
                return;
            }
            const keyEntry = this.keyStore.getKey(keyId);
            // const iv = new Uint8Array(
            //     data.slice(headerLen + payloadLen, headerLen + payloadLen + ivLen),
            // );
            const decryptionResult = await decryptWithAES256GCM(
                keyEntry.key,
                iv,
                payload,
                frameHeader,
            );
            if (!isDecryptionSuccess(decryptionResult)) {
                // logError({msg: "Decryption failed. Cannot decrypt frame"});
                controller.enqueue(encodedFrame);
                return;
            }
            const plain = decryptionResult.data;
            // logDebug("plain", plain);
            const result = new ArrayBuffer(frameHeader.byteLength + plain.byteLength);
            const writableResult = new Uint8Array(result);
            writableResult.set(frameHeader);
            writableResult.set(new Uint8Array(plain), frameHeader.byteLength);

            encodedFrame.data = result;
            controller.enqueue(encodedFrame);
        } catch (e) {
            logError(e);
            controller.enqueue(encodedFrame);
        }
    }
}

(self as any).keyStore = new KeyStore();

const getKeyStore = () => {
    return (self as any).keyStore as KeyStore;
};

self.onmessage = async (event) => {
    const { operation, kind } = event.data;

    if (operation === "initialize") {
        logDebug("worker initialize call");
    } else 
    if (operation === "init-pipeline") {
        // zarejestruj pusty pipeline
        pipelines.set(event.data.id, { ready: false });
        // odeślij potwierdzenie
        self.postMessage({ operation: "init-pipeline", id: event.data.id });
        return;
    } else 
    if (operation === "encode" || operation === "decode") {
        const { readableStream, writableStream, id, publisherId } = event.data;
        const context: TransformContext = { keyStore: getKeyStore(), id, publisherId};
        handleTransform(context, operation, kind, readableStream, writableStream);
    } else 
    if (operation === "setKeys") {
        logDebug("Worker: setting keys...");
        const data = event.data as events.SetKeysEvent;
        getKeyStore().setKeys(data.keys);
    } else 
    if (operation === "rms") {
        lastRMS = Math.round(event.data.rms as number);
    }
};

export declare interface RTCTransformEvent {}

function createSenderTransform(_keyStore: KeyStore, kind: string) {
    logDebug("create sender transform...");
    const encrypter = new EncryptTransform(_keyStore);

    return new TransformStream({
        start() {},

        async transform(encodedFrame, controller) {
            encrypter.encryptFrame(encodedFrame, kind, controller);
        },

        flush() {},
    });
}

// Receiver transform
function createReceiverTransform(context: TransformContext, kind: string) {
    const encrypter = new EncryptTransform(context.keyStore);
    return new TransformStream({
        start() {},
        flush() {},
        async transform(encodedFrame, controller) {
            encrypter.decryptFrame(encodedFrame, kind, controller, context.id, context.publisherId);
        },
    });
}

function handleTransform(
    context: TransformContext,
    operation: string,
    kind: string,
    readableStream: any,
    writableStream: any,
) {
    let transformStream: TransformStream;
    // logDebug("on handleTransform", {key, operation, readableStream, writableStream})
    logDebug("handleTransform: " + JSON.stringify({ operation, context }));
    if (operation == "encode") {
        transformStream = createSenderTransform(context.keyStore, kind);
        readableStream.pipeThrough(transformStream).pipeTo(writableStream);
    } else if (operation == "decode") {
        transformStream = createReceiverTransform(context, kind);
        const reader = readableStream
            .pipeThrough(transformStream)
            .pipeTo(writableStream)
            .catch((err: any) => {
                // Chrome przy renegocjacji/leave zamyka writable → "Destination stream closed"
                if (!String(err).includes("Destination stream closed")) {
                    console.error("pipeline error", err);
                }
            });

        sessions.set(context.id, { pipeline: reader });
    } else if (operation === "stop") {
        const s = sessions.get(context.id);
        if (s) {
            try {
                // abort pipeline if working
                s.pipeline.abort && s.pipeline.abort();
            } catch {}
            sessions.delete(context.id);
        }
    } else {
        logError(`Invalid operation: ${operation}`);
    }
}

function logDebug(msg: any) {
    if (!DEBUG) {
        return;
    }
    postMessage({ type: "debug", data: msg });
}
function logger(msg: any) {
    postMessage({ type: "debug", data: msg });
}

function logError(msg: any) {
    postMessage({ type: "error", data: msg });
}

if ((self as any).RTCTransformEvent) {
    logError("init RTCTransfrom");
    (self as any).onrtctransform = (event: any) => {
        const transformer = event.transformer;
        const { operation, kind } = transformer.options;
        // logger("operation: " + operation + " / kind: " + kind);
        logDebug("onrtctransfrom: " + JSON.stringify(event));
        const context = kind === "encode" 
            ? { keyStore: getKeyStore() }
            : { keyStore: getKeyStore(), id: event.data.id as string, publisherId: event.data.publisherId as number };

        handleTransform(
            context,
            operation,
            kind,
            transformer.readable,
            transformer.writable
        );
    };
}

// self.postMessage({type:"debug", data:"Initialized!!!"});
logDebug("Initialized");
