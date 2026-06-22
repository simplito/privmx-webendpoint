/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * Common base of every API class (ThreadApi, StoreApi, Connection, …). Holds the
 * raw pointer to the corresponding C++ object inside the WASM module and guards
 * its lifetime.
 *
 * Lifetime rule for all subclasses: an API instance is bound to the `Connection`
 * it was created from. After {@link Connection.disconnect} (or
 * `PrivmxClient.disconnect()`), every method of every API obtained from that
 * connection throws an `Error` ("This API instance is no longer valid…") —
 * create a new connection and new API instances to continue.
 *
 * Users never construct or interact with this class directly; it exists so the
 * service classes share one invalidation mechanism.
 */
export class BaseApi {
    private _servicePtr: number;

    /**
     * Instances are created by `EndpointFactory` with a pointer
     * returned from the WASM module — never constructed by SDK users.
     * @internal
     */
    constructor(ptr: number) {
        this._servicePtr = ptr;
    }

    /**
     * Raw pointer to the C++ API object, passed back into the WASM
     * module on every native call. Throws after {@link destroyRefs} so that a
     * stale pointer is never handed to C++ (which would be use-after-free).
     * @internal
     */
    public get servicePtr() {
        if (this._servicePtr < 0) {
            throw new Error(
                "This API instance is no longer valid: its connection has been disconnected. " +
                    "Reconnect with EndpointFactory.connect() and obtain new API instances.",
            );
        }
        return this._servicePtr;
    }

    /**
     * Invalidates this instance by clearing the WASM pointer. Called
     * automatically by `Connection.disconnect()` (via `freeApis()`) right before
     * the C++ object is deleted — not by SDK users.
     * @internal
     */
    public destroyRefs() {
        this._servicePtr = -1;
    }
}
