
import {Utils} from "../Utils";
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


export interface TransformContext {
    keyStore: KeyStore;
}

export class EncryptTransform { // eslint-disable-line no-unused-vars
    constructor(private keyStore: KeyStore) {}

    private getHeaderSizeByType(type: "key" | "delta" | "undefined") {
        if (type === "key") return 10;
        if (type === "delta") return 3;
        if (type === "undefined") return 1;
        return 0;
    }

    async encryptFrame(encodedFrame: RTCEncodedAudioFrame|RTCEncodedVideoFrame, kind: string, controller: TransformStreamDefaultController<any>) {
        const headerLen = kind === "video" ? this.getHeaderSizeByType((encodedFrame as any).type) : 1;
        const frameHeader = new Uint8Array(encodedFrame.data, 0, headerLen);
        const frameBody = new Uint8Array(encodedFrame.data, headerLen);

        const iv = Utils.genIvAsBuffer();
        const keyEntry = this.keyStore.getEncriptionKey();
        

        const cryptoResult = await encryptWithAES256GCM(keyEntry.key, iv,  frameBody, frameHeader);
        if (!isEncryptionSuccess(cryptoResult)) {
            throw new Error("Cannot encrypt frame");
        }
        const keyIdAsUint8 = new TextEncoder().encode(keyEntry.keyId);

        const posOfCipher = frameHeader.byteLength;
        const posOfIv = posOfCipher + cryptoResult.data.byteLength;
        const posOfIvSize = posOfIv + iv.byteLength;
        const posOfKeyId = posOfIvSize + NUM_AS_UINT8_SIZE;
        const posOfKeyIdSize = posOfKeyId + keyIdAsUint8.byteLength;

        const result = new ArrayBuffer(posOfKeyIdSize + NUM_AS_UINT8_SIZE);
        const resultUint8 = new Uint8Array(result);

        resultUint8.set(frameHeader);
        resultUint8.set(cryptoResult.data, posOfCipher);
        resultUint8.set(iv, posOfIv);
        resultUint8.set(Utils.numAsOneByteUint(iv.byteLength), posOfIvSize);
        resultUint8.set(keyIdAsUint8, posOfKeyId);
        logDebug("keyId to payload: " + JSON.stringify(keyIdAsUint8));
        resultUint8.set(Utils.numAsOneByteUint(keyIdAsUint8.byteLength), posOfKeyIdSize);
        
        encodedFrame.data = result;
        controller.enqueue(encodedFrame);
    }

    async decryptFrame(encodedFrame: RTCEncodedVideoFrame|RTCEncodedAudioFrame, kind: string, controller: TransformStreamDefaultController<any>) {
        const headerLen = kind === "video" ? this.getHeaderSizeByType((encodedFrame as any).type) : 1;
        const data = encodedFrame.data;
        const frameHeader = new Uint8Array(data, 0, headerLen);

        const keyIdLenData = new Uint8Array(data, data.byteLength - NUM_AS_UINT8_SIZE, NUM_AS_UINT8_SIZE);

        const keyIdLen = Utils.oneByteUint8AsNum(keyIdLenData);

        const ivLenData = new Uint8Array(data, data.byteLength - NUM_AS_UINT8_SIZE*2 - keyIdLen, NUM_AS_UINT8_SIZE);

        const ivLen = Utils.oneByteUint8AsNum(ivLenData);

        const complementLen = headerLen + keyIdLen + ivLen + 2;
        const payloadLen = data.byteLength - complementLen;
        const payload = data.slice(headerLen, headerLen + payloadLen);
        const keyIdPos = headerLen + payloadLen + ivLen + 1;
        const keyIdArray = data.slice(keyIdPos, keyIdPos + keyIdLen);
        const keyId = new TextDecoder().decode(keyIdArray);

        try {
            if (!this.keyStore.hasKey(keyId)) {
                logError({msg: "Decryption failed. Cannot find key", keyId, store: this.keyStore});
                controller.enqueue(encodedFrame);
                return;
            }
            const keyEntry = this.keyStore.getKey(keyId);
            const iv = new Uint8Array(data.slice(headerLen + payloadLen, headerLen + payloadLen + ivLen));
            const decryptionResult = await decryptWithAES256GCM(keyEntry.key, iv, payload, frameHeader);
            if (!isDecryptionSuccess(decryptionResult)) {
                logError({msg: "Decryption failed. Cannot decrypt frame"});
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
        }
        catch (e) {
            logError(e);
            controller.enqueue(encodedFrame);
        }
    }

}

(self as any).keyStore = new KeyStore();

const getKeyStore = () => {
    return (self as any).keyStore as KeyStore;
}

self.onmessage = (message: any) => {
    logError("message: "+ JSON.stringify(message));
    const { operation, kind } = message.data;

    if (operation === 'initialize') {
        logDebug("worker initialize call")
    } 
    else  {}
    if (operation === 'encode' || operation === 'decode') {
        const context: TransformContext = {keyStore: getKeyStore()};
        const { readableStream, writableStream, participantId } = message.data;
        // const context = getParticipantContext(participantId);
        handleTransform(context, operation, kind, readableStream, writableStream);
    } 
    else 
    if (operation === 'setKeys') {
        logDebug("Worker: setting keys...");
        const event = message.data as events.SetKeysEvent;
        getKeyStore().setKeys(event.keys);
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
    
        flush() {}
    });
}
    
// Receiver transform
function createReceiverTransform(_keyStore: KeyStore, kind: string) {
    const encrypter = new EncryptTransform(_keyStore);
    return new TransformStream({
        start() {},
        flush() {},
        async transform(encodedFrame, controller) {
            encrypter.decryptFrame(encodedFrame, kind, controller);
        }
    });
}

function handleTransform(context: TransformContext, operation: string, kind: string, readableStream: any, writableStream: any) {
    let transformStream: TransformStream;
    // logDebug("on handleTransform", {key, operation, readableStream, writableStream})
    logDebug("handleTransform: " + JSON.stringify({operation, context}));
    if (operation == "encode") {
        
        transformStream = createSenderTransform(context.keyStore, kind);
        readableStream
            .pipeThrough(transformStream)
            .pipeTo(writableStream);
    } else
    if (operation == "decode") {
        transformStream = createReceiverTransform(context.keyStore, kind);
        readableStream
            .pipeThrough(transformStream)
            .pipeTo(writableStream);
    } else {
        logError(`Invalid operation: ${operation}`);
    }
}

function logDebug(msg: any) {
    if (!DEBUG) {
        return;
    }
    postMessage({type: "debug", data: msg});
}
function logger(msg: any) {
    postMessage({type: "debug", data: msg});
}

function logError(msg: any) {
    postMessage({type: "error", data: msg});
}

if ((self as any).RTCTransformEvent) {
    (self as any).onrtctransform = (event: any) => {
        const transformer = event.transformer;
        const { operation, kind } = transformer.options;
        // logger("operation: " + operation + " / kind: " + kind);
        logDebug("onrtctransfrom: "+JSON.stringify(event));
        handleTransform({keyStore: getKeyStore()}, operation, kind, transformer.readable, transformer.writable);
    };
}

// self.postMessage({type:"debug", data:"Initialized!!!"});
logDebug("Initialized");