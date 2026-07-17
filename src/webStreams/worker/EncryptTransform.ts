import { CryptoFacade } from "../../crypto/CryptoFacade.js";
import { KeyStore } from "../KeyStore.js";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function genIvAsBuffer(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(12));
}

function numAsOneByteUint(num: number): Uint8Array {
    if (num > 255) throw new Error("Out of bounds value");
    const arr = new Uint8Array(1);
    arr[0] = num;
    return arr;
}

const NUM_AS_UINT8_SIZE = 1;

/**
 * The three encoded video frame types defined by the WebRTC Encoded Transform spec.
 * @internal
 */
export type RTCEncodedVideoFrameType = "key" | "delta" | "empty";

/**
 * Identifies the track a transform pipeline belongs to.
 * @internal
 */
export interface TransformContext {
    id?: string;
}

/**
 * Per-frame AES-256-GCM encrypt/decrypt for WebRTC encoded frames.
 * Pure crypto logic - no worker messaging, no module-level globals.
 * @internal
 */
export class EncryptTransform {
    constructor(private readonly keyStore: KeyStore) {}

    private getHeaderSizeByType(type: RTCEncodedVideoFrameType): number {
        if (type === "key") return 10;
        if (type === "delta") return 3;
        if (type === "empty") return 1;
        return 0;
    }

    private async encryptAes(
        keyId: string,
        iv: Uint8Array,
        data: Uint8Array,
        header: Uint8Array,
    ): Promise<Uint8Array> {
        return new Uint8Array(await CryptoFacade.aeadEncrypt(keyId, iv, header, data));
    }

    private async decryptAes(
        keyId: string,
        iv: Uint8Array,
        encryptedData: Uint8Array,
        header: Uint8Array,
    ): Promise<Uint8Array | null> {
        if (encryptedData.length < 16) return null;
        const data = encryptedData.slice(0, encryptedData.length - 16);
        const tag = encryptedData.slice(encryptedData.length - 16);
        try {
            return new Uint8Array(await CryptoFacade.aeadDecrypt(keyId, iv, header, data, tag));
        } catch {
            return null;
        }
    }

    /**
     * @param lastRms - value embedded in the frame trailer's legacy RMS byte,
     *                  kept only so the wire format stays byte-compatible with
     *                  older/other clients. Callers should pass a fixed
     *                  placeholder; nothing derives real audio activity from it
     *                  on this side anymore (see `AudioManager`).
     */
    async encryptFrame(
        encodedFrame: RTCEncodedAudioFrame | RTCEncodedVideoFrame,
        kind: string,
        controller: TransformStreamDefaultController<unknown>,
        lastRms: number,
    ): Promise<void> {
        const headerLen =
            kind === "video"
                ? this.getHeaderSizeByType((encodedFrame as RTCEncodedVideoFrame).type)
                : 1;
        // A frame shorter than its own header (e.g. an empty DTX audio frame)
        // carries no payload.
        if (encodedFrame.data.byteLength < headerLen) {
            controller.enqueue(encodedFrame);
            return;
        }
        const frameHeader = new Uint8Array(encodedFrame.data, 0, headerLen);
        const frameBody = new Uint8Array(encodedFrame.data, headerLen);

        const iv = genIvAsBuffer();
        const internalKeyId = this.keyStore.getEncryptionKeyId();
        const wireKeyId = this.keyStore.getEncryptionExternalKeyId();
        const encrypted = await this.encryptAes(internalKeyId, iv, frameBody, frameHeader);
        const keyIdBytes = textEncoder.encode(wireKeyId);

        const posOfCipher = frameHeader.byteLength;
        const posOfIv = posOfCipher + encrypted.byteLength;
        const posOfIvSize = posOfIv + iv.byteLength;
        const posOfKeyId = posOfIvSize + NUM_AS_UINT8_SIZE;
        const posOfKeyIdSize = posOfKeyId + keyIdBytes.byteLength;
        const posOfRMS = posOfKeyIdSize + NUM_AS_UINT8_SIZE;

        const result = new Uint8Array(posOfRMS + NUM_AS_UINT8_SIZE);
        result.set(frameHeader);
        result.set(encrypted, posOfCipher);
        result.set(iv, posOfIv);
        result.set(numAsOneByteUint(iv.byteLength), posOfIvSize);
        result.set(keyIdBytes, posOfKeyId);
        result.set(numAsOneByteUint(keyIdBytes.byteLength), posOfKeyIdSize);
        result.set(numAsOneByteUint(lastRms + 100), posOfRMS);

        encodedFrame.data = result.buffer;
        controller.enqueue(encodedFrame);
    }

    /**
     * Decrypts `encodedFrame` in place and enqueues it, or - never throwing -
     * enqueues it unmodified when the key is unknown, the AEAD tag fails, or
     * the frame is too short/malformed to contain the wire-format trailer.
     * The trailer's legacy RMS byte is skipped for offset purposes only; its
     * value is never read (see `AudioManager` for real audio-level acquisition).
     */
    async decryptFrame(
        encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
        kind: string,
        controller: TransformStreamDefaultController<unknown>,
    ): Promise<void> {
        const headerLen =
            kind === "video"
                ? this.getHeaderSizeByType((encodedFrame as RTCEncodedVideoFrame).type)
                : 1;
        const data = encodedFrame.data;

        if (data.byteLength < headerLen + 5) {
            controller.enqueue(encodedFrame);
            return;
        }

        const frameHeader = new Uint8Array(data, 0, headerLen);
        const rmsTrailerPos = data.byteLength - 1;

        const keyIdLenPos = rmsTrailerPos - 1;
        const keyIdLen = new Uint8Array(data, keyIdLenPos, 1)[0];
        const keyIdPos = keyIdLenPos - keyIdLen;
        // A trailer that would reach into the header means a plain/foreign frame
        // with arbitrary bytes in the length positions - pass it through.
        if (keyIdPos < headerLen + 1) {
            controller.enqueue(encodedFrame);
            return;
        }
        const keyId = textDecoder.decode(new Uint8Array(data, keyIdPos, keyIdLen));

        const ivLenPos = keyIdPos - 1;
        const ivLen = new Uint8Array(data, ivLenPos, 1)[0];
        const ivPos = ivLenPos - ivLen;
        if (ivPos < headerLen) {
            controller.enqueue(encodedFrame);
            return;
        }
        const iv = new Uint8Array(data, ivPos, ivLen);

        const payloadLen = ivPos - headerLen;
        const payload = new Uint8Array(data.slice(headerLen, headerLen + payloadLen));

        if (!this.keyStore.hasKey(keyId)) {
            controller.enqueue(encodedFrame);
            return;
        }

        const plain = await this.decryptAes(
            this.keyStore.resolveKeyId(keyId),
            iv,
            payload,
            frameHeader,
        );
        if (!plain) {
            controller.enqueue(encodedFrame);
            return;
        }

        const result = new Uint8Array(frameHeader.byteLength + plain.byteLength);
        result.set(frameHeader);
        result.set(plain, frameHeader.byteLength);
        encodedFrame.data = result.buffer;
        controller.enqueue(encodedFrame);
    }
}
