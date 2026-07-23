import { CryptoFacade } from "../../crypto/CryptoFacade.js";
import { KeyStore } from "../KeyStore.js";
import { FrameIvGenerator } from "./FrameIvGenerator.js";
import { clearHeaderLength, RTCEncodedVideoFrameType } from "./codecHeader.js";
import {
    FRAME_V2_FLAG_KEYFRAME,
    assembleFrameV2,
    frameV2Aad,
    parseFrameV2,
    serializeFrameV2Trailer,
} from "./frameV2.js";

const GCM_TAG_LENGTH_BYTES = 16;

export type { RTCEncodedVideoFrameType } from "./codecHeader.js";

/**
 * Identifies the track a transform pipeline belongs to.
 * @internal
 */
export interface TransformContext {
    id?: string;
}

/**
 * Orchestrates per-frame AES-256-GCM encrypt/decrypt for WebRTC encoded frames
 * using the version-2 wire format. Holds no wire-layout or codec knowledge -
 * frame framing lives in {@link ./frameV2.js} and the cleartext-header length in
 * {@link ./codecHeader.js}; this class only splits the frame, drives the key/
 * nonce, and calls the crypto facade.
 * @internal
 */
export class EncryptTransform {
    constructor(
        private readonly keyStore: KeyStore,
        private readonly ivGenerator: FrameIvGenerator = new FrameIvGenerator(),
    ) {}

    private async encryptAes(
        keyId: string,
        iv: Uint8Array,
        data: Uint8Array,
        aad: Uint8Array,
    ): Promise<Uint8Array> {
        return new Uint8Array(await CryptoFacade.aeadEncryptFrame(keyId, iv, aad, data));
    }

    private async decryptAes(
        keyId: string,
        iv: Uint8Array,
        dataWithTag: Uint8Array,
        aad: Uint8Array,
    ): Promise<Uint8Array | null> {
        // dataWithTag is the contiguous ciphertext+tag from the wire; the frame
        // AEAD route verifies the trailing 16-byte GCM tag in place.
        if (dataWithTag.length < GCM_TAG_LENGTH_BYTES) return null;
        try {
            return new Uint8Array(await CryptoFacade.aeadDecryptFrame(keyId, iv, aad, dataWithTag));
        } catch {
            return null;
        }
    }

    /**
     * Encrypts `encodedFrame` in place into a v2 wire frame and enqueues it. The
     * codec header stays cleartext at the front; the trailer and codec header are
     * authenticated as AAD.
     */
    async encryptFrame(
        encodedFrame: RTCEncodedAudioFrame | RTCEncodedVideoFrame,
        kind: string,
        controller: TransformStreamDefaultController<unknown>,
    ): Promise<void> {
        const videoType = (encodedFrame as RTCEncodedVideoFrame).type as
            | RTCEncodedVideoFrameType
            | undefined;
        const headerLen = clearHeaderLength(kind, videoType);
        // A frame shorter than its own header (e.g. an empty DTX audio frame)
        // carries no payload.
        if (encodedFrame.data.byteLength < headerLen) {
            controller.enqueue(encodedFrame);
            return;
        }
        const codecHeader = new Uint8Array(encodedFrame.data, 0, headerLen);
        const body = new Uint8Array(encodedFrame.data, headerLen);

        const iv = this.ivGenerator.next(); // Prefix ∥ Counter
        const flags = kind === "video" && videoType === "key" ? FRAME_V2_FLAG_KEYFRAME : 0;
        const trailer = serializeFrameV2Trailer(
            iv,
            this.keyStore.getEncryptionEpoch(),
            headerLen,
            flags,
        );
        const aad = frameV2Aad(codecHeader, trailer);

        const encrypted = await this.encryptAes(this.keyStore.getEncryptionKeyId(), iv, body, aad);

        encodedFrame.data = assembleFrameV2(codecHeader, encrypted, trailer);
        controller.enqueue(encodedFrame);
    }

    /**
     * Decrypts a v2 `encodedFrame` in place and enqueues it, or - never throwing
     * - enqueues it unmodified when the frame is not v2, is malformed, carries an
     * unknown key epoch, or fails the AEAD tag.
     */
    async decryptFrame(
        encodedFrame: RTCEncodedVideoFrame | RTCEncodedAudioFrame,
        controller: TransformStreamDefaultController<unknown>,
    ): Promise<void> {
        const parsed = parseFrameV2(encodedFrame.data);
        if (!parsed) {
            // Not a v2 frame (wrong/absent version marker or too short) - a plain
            // or foreign frame. Pass through unchanged.
            controller.enqueue(encodedFrame);
            return;
        }
        const { iv, epoch, codecHeader, ciphertext, aad } = parsed;

        // Epoch selects the candidate key(s); the correct key is always among
        // them because the epoch tag is derived from the (shared) key id.
        for (const internalKeyId of this.keyStore.resolveInternalKeyIdsByEpoch(epoch)) {
            const plain = await this.decryptAes(internalKeyId, iv, ciphertext, aad);
            if (plain) {
                const result = new Uint8Array(codecHeader.length + plain.length);
                result.set(codecHeader);
                result.set(plain, codecHeader.length);
                encodedFrame.data = result.buffer;
                controller.enqueue(encodedFrame);
                return;
            }
        }

        // v2-shaped but undecryptable (unknown epoch, tampered, or a foreign
        // frame whose last byte happened to equal the version marker).
        controller.enqueue(encodedFrame);
    }
}
