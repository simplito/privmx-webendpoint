import { ApiStatic } from "../api/ApiStatic";
import { ExtKeyNative, ExtKeyNativePtr } from "../api/ExtKeyNative";
import { FinalizationHelper } from "../FinalizationHelper";
import { BaseApi } from "./BaseApi";

export class ExtKey extends BaseApi {
    private static async freeExtKey(ptr: number): Promise<void> {
        const nativeApi = new ExtKeyNative(ApiStatic.getInstance());
        await nativeApi.deleteExtKey(ptr);
    }

    /**
     * Creates ExtKey from given seed.
     * @param {Uint8Array} seed the seed used to generate Key
     * @returns {ExtKey} object
    */
    static async fromSeed(seed: Uint8Array): Promise<ExtKey> {
        const ptr = await ExtKeyNative.fromSeed([seed]);
        const native = new ExtKeyNative(ApiStatic.getInstance());
        const extKey = new ExtKey(native, ptr as ExtKeyNativePtr);
        const fh = FinalizationHelper.getInstance();
        fh.register(extKey, {ptr: ptr, onFree: () => this.freeExtKey(ptr)});
        return extKey;
    }
    /**
     * Decodes ExtKey from Base58 format.
     *
     * @param {string} base58 the ExtKey in Base58
     * @returns {ExtKey} object
    */
    static async fromBase58(base58: string): Promise<ExtKey> {
        const ptr = await ExtKeyNative.fromBase58([base58]);
        const native = new ExtKeyNative(ApiStatic.getInstance());
        const extKey = new ExtKey(native, ptr as ExtKeyNativePtr);
        const fh = FinalizationHelper.getInstance();
        fh.register(extKey, {ptr: ptr, onFree: () => this.freeExtKey(ptr)});
        return extKey;
    }

    /**
     * Generates a new ExtKey.
     *
     * @returns {ExtKey} object
    */
    static async generateRandom(): Promise<ExtKey> {
        const ptr = await ExtKeyNative.generateRandom([]);
        const native = new ExtKeyNative(ApiStatic.getInstance());
        const extKey = new ExtKey(native, ptr as ExtKeyNativePtr);
        
        const fh = FinalizationHelper.getInstance();
        fh.register(extKey, {ptr: ptr, onFree: () => this.freeExtKey(ptr)});
        return extKey;
    }

    /**
     * //doc-gen:ignore
     */
    private constructor(private native: ExtKeyNative, public ptr: ExtKeyNativePtr) {
        super(ptr);
    }

    static fromPtr(ptr: ExtKeyNativePtr) {
        const native = new ExtKeyNative(ApiStatic.getInstance());
        return new ExtKey(native, ptr as ExtKeyNativePtr);
    }

    /**
     * Generates child ExtKey from a current ExtKey using BIP32.
     *
     * @param {number} index number from 0 to 2^31-1

     * @returns {ExtKey} object 
     */
    async derive(index: number): Promise<ExtKey> {
        const ptr = await this.native.derive(this.servicePtr, [index]);
        const extKey =  new ExtKey(this.native, ptr);
        const fh = FinalizationHelper.getInstance();
        fh.register(extKey, {ptr: ptr, onFree: () => ExtKey.freeExtKey(ptr)});
        return extKey;
    }


    /**
     * Generates hardened child ExtKey from a current ExtKey using BIP32.
     *
     * @param {number} index number from 0 to 2^31-1

     * @returns {ExtKey} object 
     */
    async deriveHardened(index: number): Promise<ExtKey> {
        const extKeyPtr = await this.native.deriveHardened(this.servicePtr, [index]);
        return new ExtKey(this.native, extKeyPtr);
    }


    /**
     * Converts ExtKey to Base58 string.
     *
     * @returns {string} ExtKey in Base58 format
    */
    async getPrivatePartAsBase58(): Promise<string> {
        return this.native.getPrivatePartAsBase58(this.servicePtr, []);
    }


    /**
     * Converts the public part of ExtKey to Base58 string.
     *
     * @returns {string} ExtKey in Base58 format
    */
    async getPublicPartAsBase58(): Promise<string> {
        return this.native.getPublicPartAsBase58(this.servicePtr, []);
    }


    /**
     * Extracts ECC PrivateKey.
     *
     * @returns {string} ECC key in WIF format
    */
    async getPrivateKey(): Promise<string> {
        return this.native.getPrivateKey(this.servicePtr, []);
    }

    /**
     * Extracts ECC PublicKey.
     *
     * @returns {string} ECC key in BASE58DER format
    */
    async getPublicKey(): Promise<string> {
        return this.native.getPublicKey(this.servicePtr, []);
    }

    /**
     * Extracts raw ECC PrivateKey.
     *
     * @returns {Uint8Array} ECC PrivateKey 
    */
    async getPrivateEncKey(): Promise<Uint8Array> {
        return this.native.getPrivateEncKey(this.servicePtr, []);
    }

    /**
     * Extracts ECC PublicKey Address.
     *
     * @returns {string} ECC Address in BASE58 format
    */
    async getPublicKeyAsBase58Address(): Promise<string> {
        return this.native.getPublicKeyAsBase58Address(this.servicePtr, []);
    }

    /**
     * Gets the chain code of Extended Key.
     * 
     * @returns {Uint8Array} Raw chain code
     */
    async getChainCode(): Promise<Uint8Array> {
        return this.native.getChainCode(this.servicePtr, []);
    }


    /**
     * Validates a signature of a message.
     * 
     * @param {Uint8Array} message data used on validation
     * @param {Uint8Array} signature signature of data to verify
     * @returns {boolean} message validation result
     */
    async verifyCompactSignatureWithHash(message: Uint8Array, signature: Uint8Array): Promise<boolean> {
        return this.native.verifyCompactSignatureWithHash(this.servicePtr, [message, signature]);
    }

    /**
     * Checks if ExtKey is Private.
     *
     * @returns {boolean} true if ExtKey is private
    */
    async isPrivate(): Promise<boolean> {
        return this.native.isPrivate(this.servicePtr, []);
    }

}