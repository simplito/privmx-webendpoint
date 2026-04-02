import { getEmCrypto } from "./index";
import * as Types from "./Types";

/**
 * Accepted key type for CryptoFacade operations.
 * Refer to Types.FacadeKeyRef for definition.
 */
export type FacadeKeyRef = Types.FacadeKeyRef;

/**
 * A user-friendly Javascript facade for cryptographic operations
 * backed by the internal EmCrypto WebCrypto/Polyfill implementations.
 *
 * All key parameters accept only `CryptoKey` or `string` (keyId).
 * To use raw key bytes, first call `importKey()` to obtain a keyId.
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
        key: FacadeKeyRef,
        data: Uint8Array,
    ): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(key, "hmac");
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
        key: FacadeKeyRef,
        iv: Uint8Array,
        data: Uint8Array,
        wipe?: boolean,
    ): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(key, "aes256CbcPkcs7Encrypt");
        return getEmCrypto().aes256CbcPkcs7Encrypt({ key, iv, data, wipe });
    }

    /**
     * AES-256-CBC PKCS7 Decrypt.
     */
    static async aes256CbcPkcs7Decrypt(
        key: FacadeKeyRef,
        iv: Uint8Array,
        data: Uint8Array,
        wipe?: boolean,
    ): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(key, "aes256CbcPkcs7Decrypt");
        return getEmCrypto().aes256CbcPkcs7Decrypt({ key, iv, data, wipe });
    }

    /**
     * AES-256-GCM (AEAD) Encrypt.
     */
    static async aeadEncrypt(
        key: FacadeKeyRef,
        iv: Uint8Array,
        aad: Uint8Array,
        data: Uint8Array,
        wipe?: boolean,
    ): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(key, "aeadEncrypt");
        return getEmCrypto().aeadEncrypt({ key, iv, aad, data, wipe });
    }

    /**
     * AES-256-GCM (AEAD) Decrypt.
     */
    static async aeadDecrypt(
        key: FacadeKeyRef,
        iv: Uint8Array,
        aad: Uint8Array,
        data: Uint8Array,
        tag: Uint8Array,
        wipe?: boolean,
    ): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(key, "aeadDecrypt");
        return getEmCrypto().aeadDecrypt({ key, iv, aad, data, tag, wipe });
    }

    /**
     * Derive a key using PBKDF2.
     */
    static async pbkdf2(
        password: string | CryptoKey,
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
    static async eccDerive(
        privateKey: FacadeKeyRef,
        publicKey: Uint8Array,
    ): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(privateKey, "eccDerive");
        return getEmCrypto().eccDerive({ privateKey, publicKey });
    }

    /**
     * Sign data using ECDSA.
     */
    static async eccSign(
        privateKey: FacadeKeyRef,
        data: Uint8Array,
    ): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(privateKey, "eccSign");
        return getEmCrypto().eccSign({ privateKey, data });
    }

    static async eccVerify(
        publicKey: Uint8Array,
        data: Uint8Array,
        signature: Uint8Array,
    ): Promise<boolean> {
        return getEmCrypto().eccVerify({ publicKey, data, signature });
    }

    /**
     * Import a raw key into the registry and return its ID.
     * This is the ONLY method that accepts raw Uint8Array key bytes.
     */
    static async importKey(
        key: Uint8Array,
        algo: AlgorithmIdentifier,
        usages: KeyUsage[],
        id?: string,
    ): Promise<string> {
        return getEmCrypto().importKey({ key, algo, usages, id });
    }

    /**
     * Remove a key from the registry.
     */
    static unregisterKey(id: string): void {
        getEmCrypto().unregisterKey({ id });
    }

    /**
     * Runtime guard: ensures that raw Uint8Array is never passed as a key.
     */
    private static assertKeyRef(key: FacadeKeyRef, method: string): void {
        if (key instanceof Uint8Array || key instanceof ArrayBuffer) {
            throw new TypeError(
                `CryptoFacade.${method}: Raw key bytes are not allowed. ` +
                `Use CryptoFacade.importKey() first to obtain a keyId.`,
            );
        }
    }
}
