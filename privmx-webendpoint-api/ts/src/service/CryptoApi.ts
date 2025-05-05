/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi";
import { CryptoApiNative } from "../api/CryptoApiNative";
import { BIP39 } from "../Types";

export class CryptoApi extends BaseApi {
    constructor(private native: CryptoApiNative, ptr: number) {
        super(ptr);
    }

    /**
     * Creates a signature of data using given key.
     *
     * @param {Uint8Array} data buffer to sign
     * @param {string} privateKey key used to sign data
     * @returns {Uint8Array} signature
     */
    async signData(data: Uint8Array, privateKey: string): Promise<Uint8Array> {
        return this.native.signData(this.servicePtr, [data, privateKey]);
    }

    /**
     * Validate a signature of data using given key.
     *
     * @param {Uint8Array} data buffer
     * @param {Uint8Array} signature signature of data to verify
     * @param {string} publicKey public ECC key in BASE58DER format used to validate data
     * @return data validation result
     */
    async verifySignature(data: Uint8Array, signature: Uint8Array, publicKey: string) {
        return this.native.verifySignature(this.servicePtr, [data, signature, publicKey]);
    }

    /**
     * Generates a new private ECC key.
     *
     * @param {string} [randomSeed] optional string used as the base to generate the new key
     * @returns {string} generated ECC key in WIF format
     */
    async generatePrivateKey(randomSeed?: string | undefined): Promise<string> {
        return this.native.generatePrivateKey(this.servicePtr, [randomSeed]);
    }

    /**
     * (deprecated) Generates a new private ECC key from a password using pbkdf2.
     *
     * @param {string} password the password used to generate the new key
     * @param {string} salt random string (additional input for the hashing function)
  
     * @returns {string} generated ECC key in WIF format
     */
    async derivePrivateKey(password: string, salt: string): Promise<string> {
        return this.native.derivePrivateKey(this.servicePtr, [password, salt]);
    }

    /**
     * Generates a new private ECC key from a password using pbkdf2.
     *
     * @param {string} password the password used to generate the new key
     * @param {string} salt random string (additional input for the hashing function)
  
     * @returns {string} generated ECC key in WIF format
     */
    async derivePrivateKey2(password: string, salt: string): Promise<string> {
        return this.native.derivePrivateKey2(this.servicePtr, [password, salt]);
    }

    /**
     * Generates a new public ECC key as a pair to an existing private key.
     * @param {string} privateKey private ECC key in WIF format
     * @returns {string} generated ECC key in BASE58DER format
     */
    async derivePublicKey(privateKey: string): Promise<string> {
        return this.native.derivePublicKey(this.servicePtr, [privateKey]);
    }

    /**
     * Generates a new symmetric key.
     * @returns {Uint8Array} generated key.
     */
    async generateKeySymmetric(): Promise<Uint8Array> {
        return this.native.generateKeySymmetric(this.servicePtr, []);
    }

    /**
     * Encrypts buffer with a given key using AES.
     *
     * @param {Uint8Array} data buffer to encrypt
     * @param {Uint8Array} symmetricKey key used to encrypt data
     * @returns {Uint8Array} encrypted data buffer
     */
    async encryptDataSymmetric(
        data: Uint8Array,
        symmetricKey: Uint8Array
    ): Promise<Uint8Array> {
        return this.native.encryptDataSymmetric(this.servicePtr, [
            data,
            symmetricKey,
        ]);
    }

    /**
     * Decrypts buffer with a given key using AES.
     *
     * @param {Uint8Array} data buffer to decrypt
     * @param {Uint8Array} symmetricKey key used to decrypt data
     * @returns {Uint8Array} plain (decrypted) data buffer
     */
    async decryptDataSymmetric(
        data: Uint8Array,
        symmetricKey: Uint8Array
    ): Promise<Uint8Array> {
        return this.native.decryptDataSymmetric(this.servicePtr, [
            data,
            symmetricKey,
        ]);
    }

    /**
     * Converts given private key in PEM format to its WIF format.
     *
     * @param {string} pemKey private key to convert
     * @returns {string} private key in WIF format
     */
    async convertPEMKeytoWIFKey(pemKey: string): Promise<string> {
        return this.native.convertPEMKeytoWIFKey(this.servicePtr, [pemKey]);
    }

    /**
     * Generates ECC key and BIP-39 mnemonic from a password using BIP-39.
     * 
     * @param {number} strength size of BIP-39 entropy, must be a multiple of 32
     * @param {string} password the password used to generate the Key
     * @returns {BIP39} object containing ECC Key and associated with it BIP-39 mnemonic and entropy
     */
    async generateBip39(strength: number, password: string = ""): Promise<BIP39> {
        return this.native.generateBip39(this.servicePtr, [strength, password]);
    }

    /**
     * Generates ECC key using BIP-39 mnemonic.
     * 
     * @param {string} mnemonic the BIP-39 entropy used to generate the Key
     * @param {string} password the password used to generate the Key
     * @return BIP39_t object containing ECC Key and associated with it BIP-39 mnemonic and entropy
     */
    async fromMnemonic(mnemonic: string, password: string = ""): Promise<BIP39> {
        return this.native.fromMnemonic(this.servicePtr, [mnemonic, password]);
    }

    /**
     * Generates ECC key using BIP-39 entropy.
     * 
     * @param {Uint8Array} entropy the BIP-39 entropy used to generate the Key
     * @param {string} password the password used to generate the Key
     * @return {BIP39} object containing ECC Key and associated with it BIP-39 mnemonic and entropy
     */
    async fromEntropy(entropy: Uint8Array, password: string = ""): Promise<BIP39> {
        return this.native.fromEntropy(this.servicePtr, [entropy, password]);
    }

    /**
     * Converts BIP-39 entropy to mnemonic.
     * 
     * @param {Uint8Array} entropy BIP-39 entropy
     * @return {string} BIP-39 mnemonic
     */
    async entropyToMnemonic(entropy: Uint8Array): Promise<string> {
        return this.native.entropyToMnemonic(this.servicePtr, [entropy]);
    }

    /**
     * Converts BIP-39 mnemonic to entropy.
     * 
     * @param {string} mnemonic BIP-39 mnemonic
     * @return {Uint8Array} BIP-39 entropy
     */
    async mnemonicToEntropy(mnemonic: string): Promise<Uint8Array> {
        return this.native.mnemonicToEntropy(this.servicePtr, [mnemonic]);
    }

    /**
     * Generates a seed used to generate a key using BIP-39 mnemonic with PBKDF2.
     * 
     * @param {string} mnemonic BIP-39 mnemonic
     * @param {string} password the password used to generate the seed
     * @return {Uint8Array} generated seed 
     */
    async mnemonicToSeed(mnemonic: string, password: string = ""): Promise<Uint8Array> {
        return this.native.mnemonicToSeed(this.servicePtr, [mnemonic, password]);
    }
}
