import { CryptoFacade } from "../crypto/CryptoFacade";

// Types for function parameters and return values
type BufferLike = ArrayBuffer | Uint8Array;
type CryptoMaterial = BufferLike | CryptoKey;

interface EncryptionResult {
    success: true;
    data: Uint8Array;
}

interface EncryptionError {
    success: false;
    error: string;
}

type EncryptionResponse = EncryptionResult | EncryptionError;

interface DecryptionResult {
    success: true;
    data: Uint8Array;
}

interface DecryptionError {
    success: false;
    error: string;
}

type DecryptionResponse = DecryptionResult | DecryptionError;

async function encryptWithAES256GCM(
    key: CryptoMaterial,
    iv: BufferLike,
    data: BufferLike,
    header: BufferLike,
): Promise<EncryptionResponse> {
    try {
        const cryptKey = key instanceof ArrayBuffer ? new Uint8Array(key) : key;
        const encrypted = await CryptoFacade.aeadEncrypt(
            cryptKey,
            new Uint8Array(iv),
            new Uint8Array(header),
            new Uint8Array(data),
        );

        return {
            success: true,
            data: new Uint8Array(encrypted),
        };
    } catch (error: unknown) {
        return {
            success: false,
            error: "EncryptionFailed",
        };
    }
}

async function decryptWithAES256GCM(
    key: CryptoMaterial,
    iv: BufferLike,
    encryptedData: BufferLike,
    header: BufferLike,
): Promise<DecryptionResponse> {
    try {
        const fullBuffer = new Uint8Array(encryptedData);
        if (fullBuffer.length < 16) {
            throw new Error("Invalid encrypted data length (too short for tag)");
        }
        const data = fullBuffer.slice(0, fullBuffer.length - 16);
        const tag = fullBuffer.slice(fullBuffer.length - 16);

        const cryptKey = key instanceof ArrayBuffer ? new Uint8Array(key) : key;
        const decrypted = await CryptoFacade.aeadDecrypt(
            cryptKey,
            new Uint8Array(iv),
            new Uint8Array(header),
            data,
            tag,
        );

        return {
            success: true,
            data: new Uint8Array(decrypted),
        };
    } catch (error: unknown) {
        return {
            success: false,
            error: "DecryptionFailed",
        };
    }
}

// Type guard functions for better type safety
function isEncryptionSuccess(result: EncryptionResponse): result is EncryptionResult {
    return result.success;
}

function isDecryptionSuccess(result: DecryptionResponse): result is DecryptionResult {
    return result.success;
}

export {
    encryptWithAES256GCM,
    decryptWithAES256GCM,
    isEncryptionSuccess,
    isDecryptionSuccess,
    type EncryptionResponse,
    type DecryptionResponse,
    type BufferLike,
    type CryptoMaterial,
};
