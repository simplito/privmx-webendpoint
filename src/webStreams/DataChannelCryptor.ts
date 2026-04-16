import { CryptoFacade } from "../crypto/CryptoFacade";
import { DataChannelCryptorDecryptStatus } from "../Types";
import { KeyStore } from "./KeyStore";
import { Logger } from "./Logger";

const AES_GCM_KEY_LENGTH_BYTES = 32;
const GCM_NONCE_LENGTH_BYTES = 12;
const GCM_TAG_LENGTH_BITS = 128;
const VERSION_LENGTH_BYTES = 1;
const KEY_ID_LENGTH_BYTES = 1;
const SEQUENCE_NUMBER_LENGTH_BYTES = 4;

const WIRE_FORMAT_VERSION = 1;

const FIXED_HEADER_LENGTH =
    VERSION_LENGTH_BYTES +
    KEY_ID_LENGTH_BYTES +
    SEQUENCE_NUMBER_LENGTH_BYTES +
    GCM_NONCE_LENGTH_BYTES;

export interface EncryptToWireFormatParams {
    plaintext: Uint8Array;
    sequenceNumber: number;
}

export interface DecryptFromWireFormatParams {
    frame: Uint8Array;
    lastSequenceNumber: number;
}

export interface ParsedEncryptedFrame {
    version: number;
    sequenceNumber: number;
    keyId: string;
    iv: Uint8Array;
    ciphertext: Uint8Array;
    header: Uint8Array; // AAD
}

/**
 * Serialises and deserialises encrypted data channel frames.
 *
 * Wire format:
 * ```
 * [Version:1B][SeqNum:4B big-endian][IV:12B][KeyIdLen:1B][KeyId:Var][Ciphertext+Tag:Var]
 * ```
 * Everything before the ciphertext is used as AAD for AES-256-GCM.
 * Sequence numbers are strictly increasing per remote stream for replay protection.
 */
export class DataChannelCryptor {
    private readonly textEncoder = new TextEncoder();
    private readonly textDecoder = new TextDecoder();
    private readonly logger = new Logger();

    constructor(private keyStore: KeyStore) {}

    /**
     * Encrypts `params.plaintext` using the active session key and returns the
     * complete wire-format frame including version, sequence number, IV, key ID,
     * and AES-GCM ciphertext+tag.
     */
    async encryptToWireFormat(params: EncryptToWireFormatParams): Promise<Uint8Array> {
        const { plaintext, sequenceNumber } = params;
        const internalKeyId  = this.keyStore.getEncryptionKeyId();
        const keyId          = this.keyStore.getEncryptionExternalKeyId();

        this.assertKeyId(keyId);

        this.assertSequenceNumberValue(sequenceNumber);

        if (sequenceNumber < 0) {
            throw new Error("sequenceNumber must be non-negative");
        }

        const keyIdBytes = this.textEncoder.encode(keyId);

        if (keyIdBytes.length > 0xffff) {
            throw new Error(`keyId too long: ${keyIdBytes.length}`);
        }

        const iv = crypto.getRandomValues(new Uint8Array(GCM_NONCE_LENGTH_BYTES));

        const header = this.serializeHeader({
            version: WIRE_FORMAT_VERSION,
            sequenceNumber,
            iv,
            keyIdBytes,
        });

        const encrypted = await CryptoFacade.aeadEncrypt(internalKeyId, iv, header, plaintext);

        const ciphertext = new Uint8Array(encrypted);

        return this.concat(header, ciphertext);
    }

    /**
     * Parses and decrypts a wire-format frame, verifying the sequence number
     * is strictly greater than `params.lastSequenceNumber` (replay protection).
     *
     * @returns the decrypted payload and the accepted sequence number.
     * @throws `DataChannelCryptorError` on authentication failure, replay,
     *         unrecognised key ID, or a malformed frame.
     */
    async decryptFromWireFormat(
        params: DecryptFromWireFormatParams,
    ): Promise<{ data: Uint8Array; seq: number }> {
        const parsed = this.parseEncryptedFrame(params.frame, params.lastSequenceNumber);
        this.logger.debug("decryptFromWireFormat", params, parsed);

        if (!this.keyStore.hasKey(parsed.keyId)) {
            throw new DataChannelCryptorError(
                DataChannelCryptorDecryptStatus.KEY_NOT_FOUND,
                `Key not found: ${parsed.keyId}`,
            );
        }

        try {
            const fullBuffer = parsed.ciphertext;
            if (fullBuffer.length < 16) {
                throw new Error("Ciphertext too short for tag");
            }
            const data = fullBuffer.slice(0, fullBuffer.length - 16);
            const tag = fullBuffer.slice(fullBuffer.length - 16);

            const decrypted = await CryptoFacade.aeadDecrypt(
                this.keyStore.resolveKeyId(parsed.keyId),
                parsed.iv,
                parsed.header,
                data,
                tag,
            );

            return { data: new Uint8Array(decrypted), seq: parsed.sequenceNumber };
        } catch {
            throw new DataChannelCryptorError(
                DataChannelCryptorDecryptStatus.DECRYPT_AUTH_FAILED,
                `Decryption failed (auth error)`,
            );
        }
    }

    parseEncryptedFrame(frame: Uint8Array, lastSeq: number): ParsedEncryptedFrame {
        this.assertFrameLength(frame);

        const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);

        let offset = 0;

        const version = view.getUint8(offset);
        offset += 1;

        if (version !== WIRE_FORMAT_VERSION) {
            throw new DataChannelCryptorError(
                DataChannelCryptorDecryptStatus.UNSUPPORTED_VERSION,
                `Unsupported version: ${version}`,
            );
        }

        const sequenceNumber = view.getUint32(offset, false);
        offset += SEQUENCE_NUMBER_LENGTH_BYTES;

        this.assertSequence(sequenceNumber, lastSeq);

        const iv = frame.slice(offset, offset + GCM_NONCE_LENGTH_BYTES);
        offset += GCM_NONCE_LENGTH_BYTES;

        this.assertIv(iv);

        const keyIdLength = view.getUint8(offset);
        offset += KEY_ID_LENGTH_BYTES;

        const headerLength = FIXED_HEADER_LENGTH + keyIdLength;

        if (frame.length < headerLength) {
            throw new DataChannelCryptorError(
                DataChannelCryptorDecryptStatus.FRAME_TRUNCATED,
                `Frame truncated`,
            );
        }

        const keyIdBytes = frame.slice(offset, offset + keyIdLength);
        offset += keyIdLength;

        const keyId = this.textDecoder.decode(keyIdBytes);
        this.assertKeyId(keyId);

        const ciphertext = frame.slice(offset);

        const header = frame.slice(0, headerLength);

        return {
            version,
            sequenceNumber,
            keyId,
            iv,
            ciphertext,
            header,
        };
    }

    private serializeHeader(params: {
        version: number;
        sequenceNumber: number;
        iv: Uint8Array;
        keyIdBytes: Uint8Array;
    }): Uint8Array {
        const { version, sequenceNumber, iv, keyIdBytes } = params;

        this.assertIv(iv);
        this.assertSequenceNumberValue(sequenceNumber);

        const header = new Uint8Array(FIXED_HEADER_LENGTH + keyIdBytes.length);

        const view = new DataView(header.buffer);

        let offset = 0;

        view.setUint8(offset, version);
        offset += VERSION_LENGTH_BYTES;

        view.setUint32(offset, sequenceNumber, false);
        offset += SEQUENCE_NUMBER_LENGTH_BYTES;

        header.set(iv, offset);
        offset += GCM_NONCE_LENGTH_BYTES;

        view.setUint8(offset, keyIdBytes.length);
        offset += KEY_ID_LENGTH_BYTES;

        header.set(keyIdBytes, offset);

        return header;
    }

    private assertFrameLength(frame: Uint8Array) {
        if (!frame || frame.length < FIXED_HEADER_LENGTH) {
            throw new DataChannelCryptorError(
                DataChannelCryptorDecryptStatus.FRAME_TOO_SHORT,
                "Frame too short",
            );
        }
    }

    private assertKeyId(keyId: string): void {
        if (!keyId || keyId.trim().length === 0) {
            throw new DataChannelCryptorError(
                DataChannelCryptorDecryptStatus.INVALID_KEY_ID,
                "Invalid KeyID",
            );
        }
    }

    private assertSequence(msgSeq: number, lastSeq: number): void {
        if (msgSeq <= lastSeq) {
            throw new DataChannelCryptorError(
                DataChannelCryptorDecryptStatus.INVALID_DATA_SEQUENCE,
                `Invalid data sequence number: ${msgSeq}`,
            );
        }
    }

    private assertSequenceNumberValue(sequenceNumber: number): void {
        if (!Number.isInteger(sequenceNumber)) {
            throw new Error(`sequenceNumber must be an integer, got: ${sequenceNumber}`);
        }
        if (sequenceNumber < 0 || sequenceNumber > 0xffffffff) {
            throw new Error(`sequenceNumber must fit in uint32, got: ${sequenceNumber}`);
        }
    }

    private assertIv(iv: Uint8Array): void {
        if (iv.length !== GCM_NONCE_LENGTH_BYTES) {
            throw new DataChannelCryptorError(
                DataChannelCryptorDecryptStatus.INVALID_IV_LENGTH,
                `Invalid IV length: ${iv.length}`,
            );
        }
    }

    private concat(a: Uint8Array, b: Uint8Array): Uint8Array {
        const out = new Uint8Array(a.length + b.length);
        out.set(a);
        out.set(b, a.length);
        return out;
    }
}

export class DataChannelCryptorError extends Error {
    public readonly code: DataChannelCryptorDecryptStatus;

    public constructor(code: DataChannelCryptorDecryptStatus, message: string) {
        super(message);
        this.name = "DataChannelCryptorError";
        this.code = code;
    }
}
