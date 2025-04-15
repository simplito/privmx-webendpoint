/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { ExtKey } from "../service/ExtKey";
import { BIP39 } from "../Types";
import { BaseNative } from "./BaseNative";
import { ExtKeyNativePtr } from "./ExtKeyNative";

export interface BIP39Native {
    mnemonic: string;
    extKey: ExtKeyNativePtr;
    entropy: Uint8Array;
};
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


    async generateBip39(ptr: number, args: [number, string]): Promise<BIP39> {
        const bipNative = await this.runAsync<BIP39Native>((taskId)=>this.api.lib.CryptoApi_generateBip39(taskId, ptr, args));
        return this.convertBIP(bipNative);
    }

    async fromMnemonic(ptr: number, args: [string, string]): Promise<BIP39> {
        const bipNative = await this.runAsync<BIP39Native>((taskId)=>this.api.lib.CryptoApi_fromMnemonic(taskId, ptr, args));
        return this.convertBIP(bipNative);
    }

    async fromEntropy(ptr: number, args: [Uint8Array, string]): Promise<BIP39> {
        const bipNative = await this.runAsync<BIP39Native>((taskId)=>this.api.lib.CryptoApi_fromEntropy(taskId, ptr, args));
        return this.convertBIP(bipNative);
    }

    async entropyToMnemonic(ptr: number, args: [Uint8Array]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.CryptoApi_entropyToMnemonic(taskId, ptr, args));
    }

    async mnemonicToEntropy(ptr: number, args: [string]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId)=>this.api.lib.CryptoApi_mnemonicToEntropy(taskId, ptr, args));
    }

    async mnemonicToSeed(ptr: number, args: [string, string]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId)=>this.api.lib.CryptoApi_mnemonicToSeed(taskId, ptr, args));
    }

    private convertBIP(bipNative: BIP39Native): BIP39 {
        return {
            mnemonic: bipNative.mnemonic,
            entropy: bipNative.entropy,
            extKey: ExtKey.fromPtr(this.api, bipNative.extKey)
        };
    }
}
