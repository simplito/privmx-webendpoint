/*!
PrivMX Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

export function toArrayBuffer(buffer: Uint8Array | ArrayBuffer): ArrayBuffer {
    if (buffer instanceof ArrayBuffer) {
        return buffer;
    }
    return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export function toBuffer(byteArray: ArrayBuffer | Uint8Array): Uint8Array {
    if (byteArray instanceof Uint8Array) {
        return byteArray;
    }
    return new Uint8Array(byteArray);
}

export function randomString(length: number): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    const randomValues = new Uint8Array(length);
    globalThis.crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
        result += chars.charAt(randomValues[i] % chars.length);
    }
    return result;
}
