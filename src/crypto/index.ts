/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { EmCrypto } from "./EmCrypto";

let emCryptoInstance: EmCrypto | null = null;

export function getEmCrypto(): EmCrypto {
    if (!emCryptoInstance) {
        emCryptoInstance = new EmCrypto();
    }
    return emCryptoInstance;
}

export function setGlobalEmCrypto(): void {
    const emCrypto = getEmCrypto();
    const target =
        typeof window !== "undefined"
            ? (window as any)
            : typeof globalThis !== "undefined"
              ? (globalThis as any)
              : (self as any);
    target.em_crypto = emCrypto;
    if (typeof window !== "undefined") {
        (window as any).em_crypto = emCrypto;
    }
    if (typeof self !== "undefined") {
        (self as any).em_crypto = emCrypto;
    }
    if (typeof globalThis !== "undefined") {
        (globalThis as any).em_crypto = emCrypto;
    }
}

export function getMethodCaller(): (name: string, params: any) => Promise<any> {
    return getEmCrypto().methodCaller.bind(getEmCrypto());
}

export { EmCrypto };
export * from "./CryptoFacade";
