
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

const NUM_AS_UINT8_SIZE = 8;

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
        console.log("IV on encrypt: ", iv);

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
        console.log("keyId to payload: ", keyIdAsUint8);
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
        console.log("keyIdLenData", keyIdLenData);
        const keyIdLen = Utils.oneByteUint8AsNum(keyIdLenData);
        console.log("keyIdLen", keyIdLen);
        const ivLenData = new Uint8Array(data, data.byteLength - NUM_AS_UINT8_SIZE*2 - keyIdLen, NUM_AS_UINT8_SIZE);
        console.log("ivLenData", ivLenData);
        const ivLen = Utils.oneByteUint8AsNum(ivLenData);
        console.log("ivLen", ivLen);

        const complementLen = headerLen + keyIdLen + ivLen + 2;
        const payloadLen = data.byteLength - complementLen;

        // const payload = new ArrayBuffer(payloadLen);
        // const payloadBuf = new Uint8Array(payload);
        const payload = data.slice(headerLen + 1, headerLen + 1 + payloadLen);


        // payloadBuf.set(new Uint8Array(data, data.byteLength));
        // let cursor = data.byteLength;

        console.log({
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

        const keyId = new TextDecoder('utf-8').decode(
            data.slice(headerLen + payloadLen + ivLen + 1, headerLen + payloadLen + ivLen + 1 + keyIdLen)
        );
        console.log("extracted keyId", keyId);
        const keyEntry = this.keyStore.getKey(keyId);
   
        const iv = data.slice(headerLen + payloadLen, headerLen + payloadLen + ivLen);
        console.log("extraced iv: ", iv, "(len: ", iv.byteLength, ")");
        // const plain = await decryptSymmetric(Buffer.from(payload), Buffer.from(iv), Buffer.from(key.key));
        const decryptionResult = await decryptWithAES256GCM(keyEntry.key, iv, payload, frameHeader);
        if (!isDecryptionSuccess(decryptionResult)) {
            throw new Error("Cannot decrypt frame");
        }
        const plain = decryptionResult.data;
        console.log("plain", plain);
        const result = new ArrayBuffer(frameHeader.byteLength + plain.byteLength);
        const writableResult = new Uint8Array(result);
        writableResult.set(frameHeader);
        writableResult.set(new Uint8Array(plain), frameHeader.byteLength);

        encodedFrame.data = result;
        controller.enqueue(encodedFrame);      
    }

}


let keyStore: KeyStore;

export async function onmessage(message: {data: events.WorkerBaseEvent}) {
    const { operation } = message.data;

    if (operation === 'initialize') {
        keyStore = new KeyStore();
        console.log("worker initialized")
    } 
    else 
    if (operation === 'encode' || operation === 'decode') {
        const context: TransformContext = {keyStore};
        const { readableStream, writableStream, participantId } = (message.data as any).data;
        // const context = getParticipantContext(participantId);

        handleTransform(context, operation, readableStream, writableStream);
    } 
    else 
    if (operation === 'setKeys') {
        const event = message.data as events.SetKeysEvent;
        keyStore.setKeys(event.keys);
    } 
};


export declare interface RTCTransformEvent {}

function createSenderTransform(_keyStore: KeyStore) {
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
    // console.log("on handleTransform", {key, operation, readableStream, writableStream})
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
        console.error(`Invalid operation: ${operation}`);
    }
}

if ((self as any).RTCTransformEvent) {
    (self as any).onrtctransform = (event: any) => {
        const transformer = event.transformer;
        const { operation } = transformer.options;
        handleTransform({keyStore}, operation, transformer.readable, transformer.writable);
    };
}    
