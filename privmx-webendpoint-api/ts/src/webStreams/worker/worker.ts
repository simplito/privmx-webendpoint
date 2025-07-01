
import {Utils} from "../Utils";
function isBitOn(byte: number, index: number) {
    return Boolean(byte & (1 << index));
}

function getRandomString(size: number): string {
    return [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');
}

async function encryptSymmetric(plaintext: Uint8Array | string, key: string, iv: string) : Promise<{ciphertext: Buffer, iv: string}> {
    // encode the text you want to encrypt
    let encodedPlaintext: Uint8Array;
    if (typeof plaintext === "string") {
        encodedPlaintext = new TextEncoder().encode(plaintext);
    } else {
        encodedPlaintext = plaintext;
    }
  
    // prepare the secret key for encryption
    const secretKey = await crypto.subtle.importKey('raw', Buffer.from(key, 'base64'), {
        name: 'AES-GCM',
        length: 256
    }, true, ['encrypt', 'decrypt']);
    // encrypt the text with the secret key
    const ciphertext = await crypto.subtle.encrypt({
        name: 'AES-GCM',
        iv: Buffer.from(iv, "base64"),
    }, secretKey, encodedPlaintext);
    
    // return the encrypted text "ciphertext" and the IV
    // encoded in base64
    return ({
        ciphertext: Buffer.from(ciphertext),
        iv: iv
    });
}

async function decryptSymmetric(ciphertext: Uint8Array | string, iv: string, key: string) {
    // prepare the secret key
    // check pad
    const pad = 16 - ((ciphertext as Uint8Array).length % 16);
        if (pad > 0) {
            console.log("some padding needed", pad);
        }
    console.log("1.1");
    const secretKey = await crypto.subtle.importKey(
        'raw',
        Buffer.from(key, 'base64'), 
        {
        name: 'AES-GCM',
        length: 256
    }, true, ['encrypt', 'decrypt']);
    console.log("1.2");
    // decrypt the encrypted text "ciphertext" with the secret key and IV
    const cleartext = await crypto.subtle.decrypt({
        name: 'AES-GCM',
        iv: Buffer.from(iv, 'base64'),
    }, secretKey, typeof(ciphertext) === "string" ? new TextEncoder().encode(ciphertext) : ciphertext);
    console.log(1.3);
    // decode the text and return it
    return cleartext;
}


export class EncryptTransform { // eslint-disable-line no-unused-vars
    private static frameId: number = 1;
    private static getFrameId() {
        return EncryptTransform.frameId++;
    }
    private key: string = "";
    private iv: string = "";
    /** @override */

    async init(key: string, iv: string) {
        console.log("====> WORKER INIT with key / iv: ", key, "iv: ", iv);
        this.key = key;
        this.iv = iv;
    }

    private getHeaderSizeByType(type: "key" | "delta" | "undefined") {
        if (type === "key") return 10;
        if (type === "delta") return 3;
        if (type === "undefined") return 1;
        return 0;
    }

    async encrypt(encodedFrame: RTCEncodedVideoFrame|RTCEncodedAudioFrame, controller: TransformStreamDefaultController<any>) {
        const headerSize = this.getHeaderSizeByType((encodedFrame as any).type);
        
        // Thіs is not encrypted and contains the VP8 payload descriptor or the Opus TOC byte.
        const frameHeader = new Uint8Array(encodedFrame.data, 0, headerSize);
        const frameBody = new Uint8Array(encodedFrame.data, headerSize);

        // const pad = 16 - (encodedFrame.data.byteLength % 16);
        // const encodedFrameWithPad = new ArrayBuffer(encodedFrame.data.byteLength + pad);
        // const encodedFrameWithPadUint = new Uint8Array(encodedFrameWithPad);
        // encodedFrameWithPadUint.set(new Uint8Array(encodedFrame.data));
        // const cryptoResult = await encryptSymmetric(encodedFrameWithPadUint, this.key, this.iv);

        const cryptoResult = await encryptSymmetric(frameBody, this.key, this.iv);

        const newData = new ArrayBuffer(frameHeader.byteLength + cryptoResult.ciphertext.byteLength + 8);
        const newUint8 = new Uint8Array(newData);
        // console.log({headerSize, cipherSize: cryptoResult.ciphertext.byteLength, newDataSize: newData.byteLength});
        newUint8.set(frameHeader);
        newUint8.set(cryptoResult.ciphertext, headerSize);

        // write frame id
        const frameIdUint = Utils.numToUint8Array(EncryptTransform.getFrameId());

        newUint8.set(frameIdUint, headerSize + cryptoResult.ciphertext.byteLength);
        encodedFrame.data = newData;
        // return crypto.subtle.encrypt({
        //     name: ENCRYPTION_ALGORITHM,
        //     iv,
        //     additionalData: new Uint8Array(encodedFrame.data, 0, frameHeader.byteLength)
        // }, this._cryptoKeyRing[keyIndex].encryptionKey, new Uint8Array(encodedFrame.data,
        //     UNENCRYPTED_BYTES[encodedFrame.type]))
        // .then(cipherText => {
        //     const newData = new ArrayBuffer(frameHeader.byteLength + cipherText.byteLength
        //         + iv.byteLength + frameTrailer.byteLength);
        //     const newUint8 = new Uint8Array(newData);

        //     newUint8.set(frameHeader); // copy first bytes.
        //     newUint8.set(
        //         new Uint8Array(cipherText), frameHeader.byteLength); // add ciphertext.
        //     newUint8.set(
        //         new Uint8Array(iv), frameHeader.byteLength + cipherText.byteLength); // append IV.
        //     newUint8.set(
        //             frameTrailer,
        //             frameHeader.byteLength + cipherText.byteLength + iv.byteLength); // append frame trailer.

        //     encodedFrame.data = newData;

        //     return controller.enqueue(encodedFrame);
        // }, e => {
        //     // TODO: surface this to the app.
        //     console.error(e);

        //     // We are not enqueuing the frame here on purpose.
        // });
        

        /* NOTE WELL:
         * This will send unencrypted data (only protected by DTLS transport encryption) when no key is configured.
         * This is ok for demo purposes but should not be done once this becomes more relied upon.
         */
        controller.enqueue(encodedFrame);
        
    }


    async decrypt(encodedFrame: RTCEncodedVideoFrame|RTCEncodedAudioFrame, controller: TransformStreamDefaultController<any>) {
        const headerSize = this.getHeaderSizeByType((encodedFrame as any).type);
        const frameHeader = new Uint8Array(encodedFrame.data, 0, headerSize);
        const bodySize = encodedFrame.data.byteLength - headerSize - 8;

        try {
            console.log("encodedFrame.data", encodedFrame.data);
            const frameIdUInt = new Uint8Array(encodedFrame.data, headerSize + bodySize, 8);
            const frameId = Utils.uint8ArrayToNum(frameIdUInt);
            console.log("decoded frameId", frameId, "read from:", headerSize + bodySize, "of total", encodedFrame.data.byteLength);
            let res: ArrayBuffer = new ArrayBuffer(0);
            try {
                res = await decryptSymmetric(new Uint8Array(encodedFrame.data, headerSize, bodySize), this.iv, this.key);
            }
            catch (ex) {
                console.log("cannot decode frame. Invalid key");
                controller.enqueue(encodedFrame);
                return;
            }
            console.log("decrypted", res);
            console.log(2)
            const newData = new ArrayBuffer(frameHeader.byteLength + res.byteLength);
            const newUint8 = new Uint8Array(newData);
            newUint8.set(frameHeader);
            newUint8.set(Buffer.from(res), headerSize);
            console.log(3)
            encodedFrame.data = newData;
            controller.enqueue(encodedFrame);
    
        }
        catch (e) {
            console.log("decrypt error", e);
            controller.enqueue(encodedFrame);
        }        
    }


    async transform3(frame: VideoFrame|EncodedVideoChunk, controller: TransformStreamDefaultController<any>) {
        console.log("encryptor - encrypt frame...");
        let data: Uint8Array;

        if (frame instanceof VideoFrame) {
            data = new Uint8Array(frame.allocationSize());
        } else
        if (frame instanceof EncodedVideoChunk) {
            data = new Uint8Array(frame.byteLength);
        } else {
            throw new Error("Unsupported frame type for transform");
        }

        const layout = await frame.copyTo(data);
        const frameHeader = new Uint8Array(data, 0, 10);

        // Frame trailer contains the R|IV_LENGTH and key index
        // const frameTrailer = new Uint8Array(2);

        // frameTrailer[0] = IV_LENGTH;
        // frameTrailer[1] = keyIndex;

        // Construct frame trailer. Similar to the frame header described in
        // https://tools.ietf.org/html/draft-omara-sframe-00#section-4.2
        // but we put it at the end.
        //
        // ---------+-------------------------+-+---------+----
        // payload  |IV...(length = IV_LENGTH)|R|IV_LENGTH|KID |
        // ---------+-------------------------+-+---------+----
        const cryptoResult = await encryptSymmetric(new Uint8Array(data), this.key, this.iv);
        const newData = new ArrayBuffer(frameHeader.byteLength + cryptoResult.ciphertext.byteLength);
        const newUint8 = new Uint8Array(newData);
        newUint8.set(frameHeader);
        newUint8.set(cryptoResult.ciphertext);


        if (frame instanceof VideoFrame) {
            const format = frame.format;
            if (!format) {
                throw new Error("Cannot extract frame format");
            }
            const options: VideoFrameBufferInit = {
            codedHeight: frame.codedHeight,
            codedWidth: frame.codedWidth,
            colorSpace: frame.colorSpace,
            displayHeight: frame.displayHeight,
            displayWidth: frame.displayWidth,
            duration: frame.duration ? frame.duration : undefined,
            format: format,
            layout: layout as PlaneLayout[],
            timestamp: frame.timestamp,
            visibleRect: frame.visibleRect as DOMRectInit
            };
            const processedFrame = new VideoFrame(newData, options);
            controller.enqueue(processedFrame);
        }
        else
        if (frame instanceof EncodedVideoChunk) {
            if (frame.type === "key") {
                const firstByte = data.at(0);
                if (firstByte) {
                    console.log("first byte set", firstByte);
                    const isKeyBit = isBitOn(firstByte, 0);
                    console.log("first bit is (for keyframe): ", isKeyBit); 
                }
            }
            else {
                const firstByte = data.at(0);
                if (firstByte) {
                    console.log("first byte set", firstByte);
                    const isKeyBit = isBitOn(firstByte, 0);
                    console.log("first bit is (for delta): ", isKeyBit);
                }
            }
            const newChunk = new EncodedVideoChunk({
            data: frame.type === "key" ? data:  newData, timestamp: frame.timestamp, type: frame.type, duration: frame.duration ? frame.duration : undefined
            });
            controller.enqueue(newChunk);
        }

    }
}

export declare interface RTCTransformEvent {}
export interface EventData {
    operation: string;
    key: string;
    iv: string;
}
let key: string;
let iv: string;

function createSenderTransform(key: string, iv: string) {
    const encrypter = new EncryptTransform();
    encrypter.init(key, iv);

    return new TransformStream({
        start() {},
    
        async transform(encodedFrame, controller) {
            encrypter.encrypt(encodedFrame, controller);
        },
    
        flush() {}
    });
}

export async function onmessage(event: any) {
    const { operation } = event.data;

    if (operation === 'initialize') {
        key = event.data.key;
        iv = event.data.iv;

        // if (sharedKey) {
        //     sharedContext = new Context({ sharedKey });
        // }
    } else if (operation === 'encode' || operation === 'decode') {
        const { readableStream, writableStream, participantId } = event.data;
        // const context = getParticipantContext(participantId);

        handleTransform({key, iv}, operation, readableStream, writableStream);
    } else if (operation === 'setKey') {
        const { participantId, key, keyIndex } = event.data;
        // const context = getParticipantContext(participantId);

        // if (key) {
        //     context.setKey(key, keyIndex);
        // } else {
        //     context.setKey(false, keyIndex);
        // }
    } 
    // else if (operation === 'cleanup') {
    //     const { participantId } = event.data;

    //     contexts.delete(participantId);
    // } else if (operation === 'cleanupAll') {
    //     contexts.clear();
    // } else {
    //     console.error('e2ee worker', operation);
    // }
};
    
// Receiver transform
function createReceiverTransform(_key: string, _iv: string) {
    const encrypter = new EncryptTransform();
    encrypter.init(key, iv);
    return new TransformStream({
        start() {},
        flush() {},
        async transform(encodedFrame, controller) {
            // nic nie rob - todo: impl funkcji deszyfrujacej
            console.log("recv frame..");
            encrypter.decrypt(encodedFrame, controller);
        }
    });
}

function handleTransform(context: {key: string, iv: string}, operation: string, readableStream: any, writableStream: any) {
    let transformStream: TransformStream;
    console.log("on handleTransform", {key, iv, operation, readableStream, writableStream})
    if (operation == "encode") {
        transformStream = createSenderTransform(context.key, context.iv);
        readableStream
            .pipeThrough(transformStream)
            .pipeTo(writableStream);
    } else
    if (operation == "decode") {
        transformStream = createReceiverTransform(context.key, context.iv);
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
        const { operation, key, iv } = transformer.options;
        // const context = getParticipantContext(participantId);
        const context = {key, iv};

        handleTransform(context, operation, transformer.readable, transformer.writable);
    };
}    
