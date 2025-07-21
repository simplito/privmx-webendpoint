
import {Utils} from "../Utils";
import {
    encryptWithAES256GCM,
    decryptWithAES256GCM,
    isEncryptionSuccess,
    isDecryptionSuccess,
    EncryptionResponse,
    DecryptionResponse,
    BufferLike
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

    async encryptFrame(encodedFrame: RTCEncodedAudioFrame|RTCEncodedVideoFrame, controller: TransformStreamDefaultController<any>) {
        const headerLen = this.getHeaderSizeByType((encodedFrame as any).type);
        const frameHeader = new Uint8Array(encodedFrame.data, 0, headerLen);
        const frameBody = new Uint8Array(encodedFrame.data, headerLen);

        const iv = Utils.genIvAsBuffer();
        logDebug("IV on encrypt: " + JSON.stringify(iv));

        const keyEntry = this.keyStore.getEncriptionKey();
        

        // const cryptoResult = await Utils.encryptSymmetric(frameBody, Buffer.from(keyEntry.key), Buffer.from(iv));
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

    async decryptFrame(encodedFrame: RTCEncodedVideoFrame|RTCEncodedAudioFrame, controller: TransformStreamDefaultController<any>) {
        const headerLen = this.getHeaderSizeByType((encodedFrame as any).type);
        const data = encodedFrame.data;
        const frameHeader = new Uint8Array(data, 0, headerLen);
        // const bodySize = encodedFrame.data.byteLength - headerSize - 8;
        
        const keyIdLenData = new Uint8Array(data, data.byteLength - NUM_AS_UINT8_SIZE, NUM_AS_UINT8_SIZE);

        const keyIdLen = Utils.oneByteUint8AsNum(keyIdLenData);

        const ivLenData = new Uint8Array(data, data.byteLength - NUM_AS_UINT8_SIZE*2 - keyIdLen, NUM_AS_UINT8_SIZE);

        const ivLen = Utils.oneByteUint8AsNum(ivLenData);


        const complementLen = headerLen + keyIdLen + ivLen + 2;
        const payloadLen = data.byteLength - complementLen;

        // const payload = new ArrayBuffer(payloadLen);
        // const payloadBuf = new Uint8Array(payload);
        const payload = data.slice(headerLen + 1, headerLen + 1 + payloadLen);


        // payloadBuf.set(new Uint8Array(data, data.byteLength));
        // let cursor = data.byteLength;

        logDebug({
            dataLength: data.byteLength,
            // payloadBufLen: payloadBuf.byteLength,
            payloadLen: payloadLen,
            complementLen: complementLen,
            keyIdLen: keyIdLen,
            ivLen: ivLen,
            payload: payload.byteLength,
            // cursor: cursor,
            headerLen: headerLen
        })
        // payloadBuf.set(Utils.numAsOneByteUint(headerLen), cursor);
        // // cursor += NUM_AS_UINT8_SIZE;
        // cursor += 1;

        // const sub = new Uint8Array(data, headerLen + payloadLen + ivLen, keyIdLen);
        // const subStr = new TextDecoder().decode(sub);
        // logError("sub.length: " +sub.byteLength + " / sub_as_str.length: " + subStr.length + " / subStr: " + subStr )
        const keyIdPos = headerLen + payloadLen + ivLen + 1;
        const keyIdArray = data.slice(keyIdPos, keyIdPos + keyIdLen);
        logError({keyIdArray});
        const keyId = new TextDecoder().decode(keyIdArray);

        // logError("calculated keyId - from: " + (headerLen + payloadLen + ivLen + 1) + " to: " + (headerLen + payloadLen + ivLen + 1 + keyIdLen) + ". KeyIdLen: " +keyIdLen + ". Extracted key len: " + keyId.length);
        // logDebug("extracted keyId", keyId);
        logDebug("Trying to get key with Id: " + keyId + " from store: " + JSON.stringify(this.keyStore) );
        try {
            if (!this.keyStore.hasKey(keyId)) {
                logError({msg: "Decryption failed. Cannot find key", keyId, store: this.keyStore});
                controller.enqueue(encodedFrame);
                return;
            }
            const keyEntry = this.keyStore.getKey(keyId);
            const iv = data.slice(headerLen + payloadLen, headerLen + payloadLen + ivLen);
            // logDebug("extraced iv: ", iv, "(len: ", iv.byteLength, ")");
            // const plain = await decryptSymmetric(Buffer.from(payload), Buffer.from(iv), Buffer.from(key.key));
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



// export async function onmessage(message: {data: events.WorkerBaseEvent}) {
self.onmessage = (message: any) => {
    logDebug("[e2ee-worker] onmessage: " + message);
    const { operation } = message.data;

    if (operation === 'initialize') {
        logDebug("worker initialize call")
    } 
    else 
    if (operation === 'encode' || operation === 'decode') {
        const context: TransformContext = {keyStore: getKeyStore()};
        const { readableStream, writableStream, participantId } = message.data;
        // const context = getParticipantContext(participantId);

        handleTransform(context, operation, readableStream, writableStream);
    } 
    else 
    if (operation === 'setKeys') {
        logDebug("Worker: setting keys...");
        const event = message.data as events.SetKeysEvent;
        getKeyStore().setKeys(event.keys);
    } 
};


export declare interface RTCTransformEvent {}

function createSenderTransform(_keyStore: KeyStore) {
    logDebug("create sender transform...");
    const encrypter = new EncryptTransform(_keyStore);

    return new TransformStream({
        start() {},
    
        async transform(encodedFrame, controller) {
            encrypter.encryptFrame(encodedFrame, controller);
        },
    
        flush() {}
    });
}
    
// Receiver transform
function createReceiverTransform(_keyStore: KeyStore) {
    const encrypter = new EncryptTransform(_keyStore);
    return new TransformStream({
        start() {},
        flush() {},
        async transform(encodedFrame, controller) {
            encrypter.decryptFrame(encodedFrame, controller);
        }
    });
}

function handleTransform(context: TransformContext, operation: string, readableStream: any, writableStream: any) {
    let transformStream: TransformStream;
    // logDebug("on handleTransform", {key, operation, readableStream, writableStream})
    logDebug("handleTransform: " + JSON.stringify({operation, context}));
    if (operation == "encode") {
        
        transformStream = createSenderTransform(context.keyStore);
        readableStream
            .pipeThrough(transformStream)
            .pipeTo(writableStream);
    } else
    if (operation == "decode") {
        transformStream = createReceiverTransform(context.keyStore);
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
function logError(msg: any) {
    postMessage({type: "error", data: msg});
}

if ((self as any).RTCTransformEvent) {
    (self as any).onrtctransform = (event: any) => {
        const transformer = event.transformer;
        const { operation } = transformer.options;
        logDebug("onrtctransfrom: "+JSON.stringify(event));
        handleTransform({keyStore: getKeyStore()}, operation, transformer.readable, transformer.writable);
    };
}

// self.postMessage({type:"debug", data:"Initialized!!!"});
logDebug("Initialized");