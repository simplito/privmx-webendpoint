import { CryptoFacade } from "../../crypto/CryptoFacade";
import { KeyStore } from "../KeyStore";

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

export interface TransformContext {
    id?: string;
    publisherId?: number;
}

/**
 * Per-frame AES-256-GCM encrypt/decrypt for WebRTC encoded frames.
 * Pure crypto logic — no worker messaging, no module-level globals.
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
     * @param lastRms - current local RMS level, embedded in the frame trailer so
     *                  the receiver can report audio activity without a separate channel.
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
        const frameHeader = new Uint8Array(encodedFrame.data, 0, headerLen);
        const frameBody = new Uint8Array(encodedFrame.data, headerLen);

        const iv = genIvAsBuffer();
        const keyId = this.keyStore.getEncryptionKeyId();
        const encrypted = await this.encryptAes(keyId, iv, frameBody, frameHeader);
        const keyIdBytes = new TextEncoder().encode(keyId);

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
     * Returns the decoded RMS value embedded in the frame, or null if the frame
     * could not be decrypted (pass-through for unknown keys, short frames, etc.).
     */
    async decryptFrame(
        encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
        kind: string,
        controller: TransformStreamDefaultController<unknown>,
    ): Promise<number | null> {
        const headerLen =
            kind === "video"
                ? this.getHeaderSizeByType((encodedFrame as RTCEncodedVideoFrame).type)
                : 1;
        const data = encodedFrame.data;

        if (data.byteLength < headerLen + 5) {
            controller.enqueue(encodedFrame);
            return null;
        }

        const frameHeader = new Uint8Array(data, 0, headerLen);
        const rmsPos = data.byteLength - 1;
        const rms = new Uint8Array(data, rmsPos, 1)[0] - 100;

        const keyIdLenPos = rmsPos - 1;
        const keyIdLen = new Uint8Array(data, keyIdLenPos, 1)[0];
        const keyIdPos = keyIdLenPos - keyIdLen;
        const keyId = new TextDecoder().decode(new Uint8Array(data, keyIdPos, keyIdLen));

        const ivLenPos = keyIdPos - 1;
        const ivLen = new Uint8Array(data, ivLenPos, 1)[0];
        const ivPos = ivLenPos - ivLen;
        const iv = new Uint8Array(data, ivPos, ivLen);

        const payloadLen = ivPos - headerLen;
        const payload = new Uint8Array(data.slice(headerLen, headerLen + payloadLen));

        if (!this.keyStore.hasKey(keyId)) {
            controller.enqueue(encodedFrame);
            return null;
        }

        const plain = await this.decryptAes(keyId, iv, payload, frameHeader);
        if (!plain) {
            controller.enqueue(encodedFrame);
            return null;
        }

        const result = new Uint8Array(frameHeader.byteLength + plain.byteLength);
        result.set(frameHeader);
        result.set(plain, frameHeader.byteLength);
        encodedFrame.data = result.buffer;
        controller.enqueue(encodedFrame);
        return rms;
    }
}
