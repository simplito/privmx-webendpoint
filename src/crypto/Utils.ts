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
