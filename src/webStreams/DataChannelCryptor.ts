import { DataChannelCryptorDecryptStatus } from "../Types";
import { KeyStore } from "./KeyStore";
import { Logger } from "./Logger";

const AES_GCM_KEY_LENGTH_BYTES = 32;
const GCM_NONCE_LENGTH_BYTES = 12;
const GCM_TAG_LENGTH_BITS = 128;
const VERSION_LENGTH_BYTES = 1;
const KEY_ID_LENGTH_BYTES = 2;
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

export class DataChannelCryptor {
    private readonly textEncoder = new TextEncoder();
    private readonly textDecoder = new TextDecoder();

    constructor(private keyStore: KeyStore) {}

    async encryptToWireFormat(params: EncryptToWireFormatParams): Promise<Uint8Array> {
        const { plaintext, sequenceNumber } = params;
        const keyId = this.keyStore.getEncryptionKeyId();

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

        const cryptoKey = await this.keyStore.getEncriptionKey();

        const encrypted = await crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv,
                additionalData: header,
                tagLength: GCM_TAG_LENGTH_BITS,
            },
            cryptoKey,
            plaintext,
        );

        const ciphertext = new Uint8Array(encrypted);

        return this.concat(header, ciphertext);
    }

    async decryptFromWireFormat(
        params: DecryptFromWireFormatParams,
    ): Promise<{ data: Uint8Array; seq: number }> {
        const parsed = this.parseEncryptedFrame(params.frame, params.lastSequenceNumber);
        const logger = new Logger();
        logger.debug("decryptFromWireFormat", params, parsed);

        if (!this.keyStore.hasKey(parsed.keyId)) {
            throw new DataChannelCryptorError(
                DataChannelCryptorDecryptStatus.KEY_NOT_FOUND,
                `Key not found: ${parsed.keyId}`,
            );
        }

        const cryptoKey = await this.keyStore.getKey(parsed.keyId);

        try {
            const decrypted = await crypto.subtle.decrypt(
                {
                    name: "AES-GCM",
                    iv: parsed.iv,
                    additionalData: parsed.header,
                    tagLength: GCM_TAG_LENGTH_BITS,
                },
                cryptoKey,
                parsed.ciphertext,
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

        const keyIdLength = view.getUint16(offset, false);
        offset += KEY_ID_LENGTH_BYTES;

        const sequenceNumber = view.getUint32(offset, false);
        offset += SEQUENCE_NUMBER_LENGTH_BYTES;

        this.assertSequence(sequenceNumber, lastSeq);

        const iv = frame.slice(offset, offset + GCM_NONCE_LENGTH_BYTES);
        offset += GCM_NONCE_LENGTH_BYTES;

        this.assertIv(iv);

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

        view.setUint16(offset, keyIdBytes.length, false);
        offset += KEY_ID_LENGTH_BYTES;

        view.setUint32(offset, sequenceNumber, false);
        offset += SEQUENCE_NUMBER_LENGTH_BYTES;

        header.set(iv, offset);
        offset += GCM_NONCE_LENGTH_BYTES;

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
