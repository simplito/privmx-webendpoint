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
   * Generates a new private ECC key.
   *
   * @param {string} [randomSeed] optional string used as the base to generate the new key
   * @returns {string} generated ECC key in WIF format
   */
  async generatePrivateKey(randomSeed?: string | undefined): Promise<string> {
    return this.native.generatePrivateKey(this.servicePtr, [randomSeed]);
  }

  /**
     * Generates a new private ECC key from a password using pbkdf2.
     *
     * @param {string} password the password used to generate the new key
     * @param {string} salt random string (additional input for the hashing function)

     * @returns {string} generated ECC key in WIF format
     */
  async derivePrivateKey(password: string, salt: string): Promise<string> {
    return this.native.derivePrivateKey(this.servicePtr, [password, salt]);
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
}
