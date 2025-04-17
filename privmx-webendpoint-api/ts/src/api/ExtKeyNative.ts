import { ApiStatic } from "./ApiStatic";
import { BaseNative } from "./BaseNative";
export type ExtKeyNativePtr = number & {__extKeyNativePtr: never};

export class ExtKeyNative extends BaseNative {
    protected async newApi(): Promise<number> { 
        throw new Error("Use the specialized version of method instead.");
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.ExtKey_deleteExtKey(taskId, ptr));
    }

    async deleteExtKey(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.ExtKey_deleteExtKey(taskId, ptr));
        this.deleteApiRef();
    }

    static async fromSeed(args: [Uint8Array]): Promise<ExtKeyNativePtr> {
        const api = ApiStatic.getInstance();
        return api.runAsync<ExtKeyNativePtr>((taskId)=>api.lib.ExtKey_fromSeed(taskId, args));
    }
    static async fromBase58(args: [string]): Promise<ExtKeyNativePtr> {
        // base58: string
        const api = ApiStatic.getInstance();
        return api.runAsync<ExtKeyNativePtr>((taskId)=>api.lib.ExtKey_fromBase58(taskId, args));
    }
    static async generateRandom(args: []): Promise<ExtKeyNativePtr> {
        const api = ApiStatic.getInstance();
        return api.runAsync<ExtKeyNativePtr>((taskId)=>api.lib.ExtKey_generateRandom(taskId, args));
    }

    async derive(ptr: number, args: [number]): Promise<ExtKeyNativePtr> {
        // index: number
        return this.runAsync<ExtKeyNativePtr>((taskId)=>this.api.lib.ExtKey_derive(taskId, ptr, args));
    }
    async deriveHardened(ptr: number, args: [number]): Promise<ExtKeyNativePtr> {
        // index: number
        return this.runAsync<ExtKeyNativePtr>((taskId)=>this.api.lib.ExtKey_deriveHardened(taskId, ptr, args));
    }

    getPrivatePartAsBase58(ptr: number, args: []): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.ExtKey_getPrivatePartAsBase58(taskId, ptr, args));
    }

    getPublicPartAsBase58(ptr: number, args: []): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.ExtKey_getPublicPartAsBase58(taskId, ptr, args));
    }

    getPrivateKey(ptr: number, args: []): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.ExtKey_getPrivateKey(taskId, ptr, args));
    }

    getPublicKey(ptr: number, args: []): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.ExtKey_getPublicKey(taskId, ptr, args));
    }

    getPrivateEncKey(ptr: number, args: []): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId)=>this.api.lib.ExtKey_getPrivateEncKey(taskId, ptr, args));
    }

    getPublicKeyAsBase58Address(ptr: number, args: []): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.ExtKey_getPublicKeyAsBase58Address(taskId, ptr, args));
    }

    getChainCode(ptr: number, args: []): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId)=>this.api.lib.ExtKey_getChainCode(taskId, ptr, args));
    }

    verifyCompactSignatureWithHash(ptr: number, args: [Uint8Array, Uint8Array]): Promise<boolean> {
        // message: Uint8Array, signature: Uint8Array
        return this.runAsync<boolean>((taskId)=>this.api.lib.ExtKey_verifyCompactSignatureWithHash(taskId, ptr, args));
    }

    isPrivate(ptr: number, args: []): Promise<boolean> {
        return this.runAsync<boolean>((taskId)=>this.api.lib.ExtKey_isPrivate(taskId, ptr, args));
    }
}
