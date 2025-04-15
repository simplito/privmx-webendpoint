import { BaseApi } from "../service";
import { Api } from "./Api";
import { BaseNative } from "./BaseNative";
export type ExtKeyNativePtr = number & {__extKeyNativePtr: never};

export class ExtKeyNative extends BaseNative {
    protected async newApi(): Promise<number> { 
        throw new Error("Use the specialized version of method instead.");
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.ExtKey_deleteExtKey(taskId, ptr));
    }

    async newExtKey(): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.ExtKey_newExtKey(taskId));
    }
    async deleteExtKey(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.ExtKey_deleteExtKey(taskId, ptr));
        this.deleteApiRef();
    }

    // static fromSeed(ptr: number, args: [Uint8Array]): ExtKey {
    //     // seed: Uint8Array
    //     // const ptr = this.runAsync<void>((taskId)=>this.api.lib.ExtKey_create(taskId, ptr, args));
    //     throw new Error("not implemented");
    // }
    // static fromBase58(ptr: number, args: [string]): ExtKey {
    //     // base58: string
    //     // return this.runAsync<void>((taskId)=>this.api.lib.ExtKey_create(taskId, ptr, args));
    //     throw new Error("not implemented");
    // }
    // static generateRandom(ptr: number, args: []): ExtKey {
    //     // return this.runAsync<void>((taskId)=>this.api.lib.ExtKey_create(taskId, ptr, args));
    //     throw new Error("not implemented");
    // }

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
