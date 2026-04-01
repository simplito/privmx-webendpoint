import { getEmCrypto } from "./index";
import * as Types from "./Types";

/**
 * A user-friendly Javascript facade for cryptographic operations
 * backed by the internal EmCrypto WebCrypto/Polyfill implementations.
 */
export class CryptoFacade {
    /**
     * Generate secure random bytes.
     * @param length Number of bytes to generate.
     */
    static async randomBytes(length: number): Promise<ArrayBuffer> {
        return getEmCrypto().randomBytes({ length });
    }

    /**
     * Compute HMAC.
     */
    static async hmac(
        engine: "sha1" | "sha256" | "sha512",
        key: Uint8Array,
        data: Uint8Array,
    ): Promise<ArrayBuffer> {
        return getEmCrypto().hmac({ engine, key, data });
    }

    /**
     * Compute SHA256 hash.
     */
    static async sha256(data: Uint8Array): Promise<ArrayBuffer> {
        return getEmCrypto().sha256({ data });
    }

    /**
     * Compute SHA512 hash.
     */
    static async sha512(data: Uint8Array): Promise<ArrayBuffer> {
        return getEmCrypto().sha512({ data });
    }

    /**
     * AES-256-CBC PKCS7 Encrypt.
     */
    static async aes256CbcPkcs7Encrypt(
        key: Uint8Array,
        iv: Uint8Array,
        data: Uint8Array,
    ): Promise<ArrayBuffer> {
        return getEmCrypto().aes256CbcPkcs7Encrypt({ key, iv, data });
    }

    /**
     * AES-256-CBC PKCS7 Decrypt.
     */
    static async aes256CbcPkcs7Decrypt(
        key: Uint8Array,
        iv: Uint8Array,
        data: Uint8Array,
    ): Promise<ArrayBuffer> {
        return getEmCrypto().aes256CbcPkcs7Decrypt({ key, iv, data });
    }

    /**
     * AES-256-GCM (AEAD) Encrypt.
     */
    static async aeadEncrypt(
        key: Uint8Array,
        iv: Uint8Array,
        aad: Uint8Array,
        data: Uint8Array,
    ): Promise<ArrayBuffer> {
        return getEmCrypto().aeadEncrypt({ key, iv, aad, data });
    }

    /**
     * AES-256-GCM (AEAD) Decrypt.
     */
    static async aeadDecrypt(
        key: Uint8Array,
        iv: Uint8Array,
        aad: Uint8Array,
        data: Uint8Array,
        tag: Uint8Array,
    ): Promise<ArrayBuffer> {
        return getEmCrypto().aeadDecrypt({ key, iv, aad, data, tag });
    }

    /**
     * Derive a key using PBKDF2.
     */
    static async pbkdf2(
        password: string,
        salt: string,
        rounds: number,
        length: number,
        hash: string,
    ): Promise<ArrayBuffer> {
        return getEmCrypto().pbkdf2({ password, salt, rounds, length, hash });
    }

    /**
     * Generate an ECC key pair (secp256k1).
     * Returns { privateKey, publicKey } as Uint8Arrays.
     */
    static async eccGenPair(): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
        return getEmCrypto().eccGenPair();
    }

    /**
     * Derive a shared secret using ECDH.
     */
    static async eccDerive(privateKey: Uint8Array, publicKey: Uint8Array): Promise<ArrayBuffer> {
        return getEmCrypto().eccDerive({ privateKey, publicKey });
    }

    /**
     * Sign data using ECDSA.
     */
    static async eccSign(privateKey: Uint8Array, data: Uint8Array): Promise<ArrayBuffer> {
        return getEmCrypto().eccSign({ privateKey, data });
    }

    /**
     * Verify an ECDSA signature.
     */
    static async eccVerify(
        publicKey: Uint8Array,
        data: Uint8Array,
        signature: Uint8Array,
    ): Promise<boolean> {
        return getEmCrypto().eccVerify({ publicKey, data, signature });
    }
}
