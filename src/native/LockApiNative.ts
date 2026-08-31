/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { LockLevel, LockOperationResult } from "../Types.js";
import { BaseNative } from "./BaseNative.js";

/**
 * Raw WASM wrapper for the C++ LockApi - holds and forwards raw pointers. Use
 * {@link LockApi} (src/service) instead.
 * @internal
 */
export class LockApiNative extends BaseNative {
    async newApi(connectionPtr: number): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.LockApi_newLockApi(taskId, connectionPtr),
        );
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId) => this.api.lib.LockApi_deleteLockApi(taskId, ptr));
        this.deleteApiRef();
    }
    async create(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId) => this.api.lib.LockApi_create(taskId, ptr, args));
    }
    async lock(
        ptr: number,
        args: [string, string, LockLevel],
    ): Promise<LockOperationResult> {
        return this.runAsync<LockOperationResult>((taskId) =>
            this.api.lib.LockApi_lock(taskId, ptr, args),
        );
    }
    async unlock(
        ptr: number,
        args: [string, string, LockLevel],
    ): Promise<LockOperationResult> {
        return this.runAsync<LockOperationResult>((taskId) =>
            this.api.lib.LockApi_unlock(taskId, ptr, args),
        );
    }
    async checkReservedLock(ptr: number, args: [string, string]): Promise<boolean> {
        return this.runAsync<boolean>((taskId) =>
            this.api.lib.LockApi_checkReservedLock(taskId, ptr, args),
        );
    }
}
