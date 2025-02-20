/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseNative } from "./BaseNative";

export class CryptoApiNative extends BaseNative {
    async newApi(): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.CryptoApi_newCryptoApi(taskId));
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.CryptoApi_deleteCryptoApi(taskId, ptr));
        this.deleteApiRef();
    }
    async create(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.CryptoApi_create(taskId, ptr, args));
    }
    async signData(ptr: number, args: [Uint8Array, string]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId)=>this.api.lib.CryptoApi_signData(taskId, ptr, args));
    }
    async verifySignature(ptr: number, args: [Uint8Array, Uint8Array, string]): Promise<boolean> {
        return this.runAsync<boolean>((taskId)=>this.api.lib.CryptoApi_verifySignature(taskId, ptr, args));
    }
    async generatePrivateKey(ptr: number, args: [string|undefined]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.CryptoApi_generatePrivateKey(taskId, ptr, args));
    }
    async derivePrivateKey(ptr: number, args: [string, string]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.CryptoApi_derivePrivateKey(taskId, ptr, args));
    }
    async derivePrivateKey2(ptr: number, args: [string, string]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.CryptoApi_derivePrivateKey2(taskId, ptr, args));
    }
    async derivePublicKey(ptr: number, args: [string]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.CryptoApi_derivePublicKey(taskId, ptr, args));
    }
    async generateKeySymmetric(ptr: number, args: []): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId)=>this.api.lib.CryptoApi_generateKeySymmetric(taskId, ptr, args));
    }
    async encryptDataSymmetric(ptr: number, args: [Uint8Array, Uint8Array]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId)=>this.api.lib.CryptoApi_encryptDataSymmetric(taskId, ptr, args));
    }
    async decryptDataSymmetric(ptr: number, args: [Uint8Array, Uint8Array]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId)=>this.api.lib.CryptoApi_decryptDataSymmetric(taskId, ptr, args));
    }
    async convertPEMKeytoWIFKey(ptr: number, args: [string]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.CryptoApi_convertPEMKeytoWIFKey(taskId, ptr, args));
    }
}
