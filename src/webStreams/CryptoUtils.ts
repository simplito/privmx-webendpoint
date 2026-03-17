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
        const cryptoKey = await ensureCryptoKey(key, "encrypt");

        // Encrypt the data
        const encrypted: ArrayBuffer = await crypto.subtle.encrypt(
            {
                name: "AES-GCM",
                iv: iv,
                additionalData: header,
                tagLength: 128, // 16 bytes * 8 = 128 bits (TAG_LEN equivalent)
            },
            cryptoKey,
            data,
        );

        // The encrypted result contains both ciphertext and authentication tag
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
        const cryptoKey = await ensureCryptoKey(key, "decrypt");

        const decrypted: ArrayBuffer = await crypto.subtle.decrypt(
            {
                name: "AES-GCM",
                iv: iv,
                additionalData: header,
                tagLength: 128,
            },
            cryptoKey,
            encryptedData,
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

async function ensureCryptoKey(
    key: CryptoMaterial,
    usage: KeyUsage,
): Promise<CryptoKey> {
    if (key instanceof CryptoKey) {
        return key;
    }

    return crypto.subtle.importKey(
        "raw",
        key,
        { name: "AES-GCM" },
        false,
        [usage],
    );
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
