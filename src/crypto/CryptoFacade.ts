import { getEmCrypto } from "./index.js";
import * as Types from "./Types.js";

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
     * @param {number} length Number of bytes to generate.
     * @returns {Promise<ArrayBuffer>} cryptographically random bytes of the requested length
     */
    static async randomBytes(length: number): Promise<ArrayBuffer> {
        return getEmCrypto().randomBytes({ length });
    }

    /**
     * Compute HMAC.
     * @param {string} engine hash algorithm to use: `"sha1"`, `"sha256"`, or `"sha512"`
     * @param {FacadeKeyRef} key registered key ID or `CryptoKey` to use for the HMAC
     * @param {Uint8Array} data input bytes to authenticate
     * @returns {Promise<ArrayBuffer>} HMAC tag computed over `data` with `key` using the given `engine`
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
     * @param {Uint8Array} data input bytes to hash
     * @returns {Promise<ArrayBuffer>} 32-byte SHA-256 digest of `data`
     */
    static async sha256(data: Uint8Array): Promise<ArrayBuffer> {
        return getEmCrypto().sha256({ data });
    }

    /**
     * Compute SHA512 hash.
     * @param {Uint8Array} data input bytes to hash
     * @returns {Promise<ArrayBuffer>} 64-byte SHA-512 digest of `data`
     */
    static async sha512(data: Uint8Array): Promise<ArrayBuffer> {
        return getEmCrypto().sha512({ data });
    }

    /**
     * AES-256-CBC PKCS7 Encrypt.
     * @param {FacadeKeyRef} key registered key ID or `CryptoKey` for the 256-bit AES key
     * @param {Uint8Array} iv 16-byte initialisation vector
     * @param {Uint8Array} data plaintext bytes to encrypt
     * @returns {Promise<ArrayBuffer>} PKCS#7-padded AES-256-CBC ciphertext
     */
    static async aes256CbcPkcs7Encrypt(
        key: FacadeKeyRef,
        iv: Uint8Array,
        data: Uint8Array,
    ): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(key, "aes256CbcPkcs7Encrypt");
        return getEmCrypto().aes256CbcPkcs7Encrypt({ key, iv, data });
    }

    /**
     * AES-256-CBC PKCS7 Decrypt.
     * @param {FacadeKeyRef} key registered key ID or `CryptoKey` for the 256-bit AES key
     * @param {Uint8Array} iv 16-byte initialisation vector used during encryption
     * @param {Uint8Array} data PKCS#7-padded ciphertext to decrypt
     * @returns {Promise<ArrayBuffer>} decrypted plaintext bytes with PKCS#7 padding removed
     */
    static async aes256CbcPkcs7Decrypt(
        key: FacadeKeyRef,
        iv: Uint8Array,
        data: Uint8Array,
    ): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(key, "aes256CbcPkcs7Decrypt");
        return getEmCrypto().aes256CbcPkcs7Decrypt({ key, iv, data });
    }

    /**
     * AES-256-GCM (AEAD) Encrypt.
     * @param {FacadeKeyRef} key registered key ID or `CryptoKey` for the 256-bit AES-GCM key
     * @param {Uint8Array} iv 12-byte initialisation vector (nonce)
     * @param {Uint8Array} aad additional authenticated data — protected but not encrypted
     * @param {Uint8Array} data plaintext bytes to encrypt
     * @returns {Promise<ArrayBuffer>} AES-256-GCM ciphertext with the 16-byte authentication tag appended
     */
    static async aeadEncrypt(
        key: FacadeKeyRef,
        iv: Uint8Array,
        aad: Uint8Array,
        data: Uint8Array,
    ): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(key, "aeadEncrypt");
        return getEmCrypto().aeadEncrypt({ key, iv, aad, data });
    }

    /**
     * AES-256-GCM (AEAD) Decrypt.
     * @param {FacadeKeyRef} key registered key ID or `CryptoKey` for the 256-bit AES-GCM key
     * @param {Uint8Array} iv 12-byte initialisation vector (nonce) used during encryption
     * @param {Uint8Array} aad additional authenticated data that was authenticated but not encrypted
     * @param {Uint8Array} data ciphertext bytes to decrypt
     * @param {Uint8Array} tag 16-byte GCM authentication tag to verify before decrypting
     * @returns {Promise<ArrayBuffer>} decrypted plaintext bytes after successful tag verification
     */
    static async aeadDecrypt(
        key: FacadeKeyRef,
        iv: Uint8Array,
        aad: Uint8Array,
        data: Uint8Array,
        tag: Uint8Array,
    ): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(key, "aeadDecrypt");
        return getEmCrypto().aeadDecrypt({ key, iv, aad, data, tag });
    }

    /**
     * Derive a key using PBKDF2.
     * @param {string | CryptoKey} password source secret — either a plain-text password or an imported `CryptoKey`
     * @param {string} salt hex-encoded salt string to mix into the derivation
     * @param {number} rounds number of PBKDF2 iterations (higher is slower and more secure)
     * @param {number} length desired output length in bits (e.g. 256 for a 32-byte key)
     * @param {string} hash name of the underlying hash function, e.g. `"SHA-256"`
     * @returns {Promise<ArrayBuffer>} derived key material of `length` bits
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
     * @returns {Promise<{privateKey: Uint8Array, publicKey: Uint8Array}>} fresh secp256k1 key pair as raw byte arrays
     */
    static async eccGenPair(): Promise<{ privateKey: Uint8Array; publicKey: Uint8Array }> {
        return getEmCrypto().eccGenPair();
    }

    /**
     * Derive a shared secret using ECDH.
     * @param {FacadeKeyRef} privateKey registered key ID or `CryptoKey` for the local secp256k1 private key
     * @param {Uint8Array} publicKey raw bytes of the remote party's secp256k1 public key
     * @returns {Promise<ArrayBuffer>} ECDH shared secret derived from the two keys
     */
    static async eccDerive(privateKey: FacadeKeyRef, publicKey: Uint8Array): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(privateKey, "eccDerive");
        return getEmCrypto().eccDerive({ privateKey, publicKey });
    }

    /**
     * Sign data using ECDSA.
     * @param {FacadeKeyRef} privateKey registered key ID or `CryptoKey` for the secp256k1 signing key
     * @param {Uint8Array} data bytes to sign
     * @returns {Promise<ArrayBuffer>} DER-encoded ECDSA signature over `data`
     */
    static async eccSign(privateKey: FacadeKeyRef, data: Uint8Array): Promise<ArrayBuffer> {
        CryptoFacade.assertKeyRef(privateKey, "eccSign");
        return getEmCrypto().eccSign({ privateKey, data });
    }

    /**
     * Verify an ECDSA signature.
     * @param {Uint8Array} publicKey raw bytes of the secp256k1 public key to verify against
     * @param {Uint8Array} data bytes that were signed
     * @param {Uint8Array} signature DER-encoded ECDSA signature to verify
     * @returns {Promise<boolean>} `true` when the signature is valid for the given `data` and `publicKey`
     */
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
     * Uint8Array will be filled with zeros afterwards
     * @param {Uint8Array} key raw key bytes to import — zeroed out after import
     * @param {AlgorithmIdentifier} algo WebCrypto algorithm identifier for the key (e.g. `{ name: "AES-GCM" }`)
     * @param {KeyUsage[]} usages list of allowed key usages (e.g. `["encrypt", "decrypt"]`)
     * @param {string} [id] optional explicit key ID; a UUID is generated when omitted
     * @returns {Promise<string>} key ID to pass to all other `CryptoFacade` methods that accept a key
     */
    static async importKeyAndWipeMaterial(
        key: Uint8Array,
        algo: AlgorithmIdentifier,
        usages: KeyUsage[],
        id?: string,
    ): Promise<string> {
        return getEmCrypto().importKey({ key, algo, usages, id });
    }

    /**
     * Remove a key from the registry.
     * @param {string} id key ID returned by {@link importKeyAndWipeMaterial} to remove
     */
    static unregisterKey(id: string): void {
        getEmCrypto().unregisterKey({ id });
    }

    /**
     * Runtime guard: ensures that raw Uint8Array is never passed as a key.
     * @param {FacadeKeyRef} key the key reference to validate
     * @param {string} method name of the calling method, used in the error message
     */
    private static assertKeyRef(key: FacadeKeyRef, method: string): void {
        if (key instanceof Uint8Array || key instanceof ArrayBuffer) {
            throw new TypeError(
                `CryptoFacade.${method}: Raw key bytes are not allowed. ` +
                    "Use CryptoFacade.importKey() first to obtain a keyId.",
            );
        }
    }
}
