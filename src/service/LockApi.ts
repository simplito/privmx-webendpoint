/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { BaseApi } from "./BaseApi.js";
import { LockApiNative } from "../native/LockApiNative.js";
import { LockLevel, LockOperationResult } from "../Types.js";

/**
 * Provides distributed locking of arbitrary resources identified by a string
 * ID. Lock levels follow the SQLite locking model:
 * `NONE < SHARED < RESERVED < PENDING < EXCLUSIVE`.
 *
 * Obtain via {@link EndpointFactory.createLockApi}; do not construct directly.
 *
 * ## Workflow
 * {@link lock} a resource at the level your operation needs → do the work →
 * {@link unlock} (or downgrade to `SHARED`) when done. Use
 * {@link checkReservedLock} to probe whether any connection already holds a
 * `RESERVED` or higher lock before attempting an escalation.
 *
 * All methods reject with `NativeError` on server/crypto errors and throw
 * `Error` when the underlying connection has been closed.
 */
export class LockApi extends BaseApi {
    /**
     * Resolved from the connection's IoC container by
     * {@link EndpointFactory.createLockApi} - do not call directly.
     * @internal
     */
    constructor(
        private native: LockApiNative,
        ptr: number,
    ) {
        super(ptr);
    }

    /**
     * Attempts to acquire a lock on a resource at the requested level.
     *
     * The lock is tracked server-side per `uuid`; call again with a higher
     * `lockLevel` to escalate an existing lock held under the same `uuid`.
     *
     * @param {string} resourceId identifier of the resource to lock - any
     *   application-chosen string, not tied to a specific container type
     * @param {string} uuid caller-unique identifier used to track lock
     *   ownership - generate one per logical lock holder and reuse it across
     *   {@link lock}/{@link unlock} calls for that holder
     * @param {LockLevel} lockLevel desired lock level (`SHARED`, `RESERVED`,
     *   `PENDING`, or `EXCLUSIVE`)
     * @returns {LockOperationResult} whether the requested level was acquired
     *   and the level actually held by the caller after the call
     * @throws {NativeError} when `lockLevel` is invalid or the endpoint is not
     *   initialized
     */
    async lock(
        resourceId: string,
        uuid: string,
        lockLevel: LockLevel,
    ): Promise<LockOperationResult> {
        return this.native.lock(this.servicePtr, [resourceId, uuid, lockLevel]);
    }

    /**
     * Releases or downgrades a lock held on a resource.
     *
     * Pass `LockLevel.NONE` to release the lock fully, or a lower level (e.g.
     * `SHARED`) to downgrade an escalated lock while keeping a reader lock.
     *
     * @param {string} resourceId identifier of the resource to unlock -
     *   matching the value passed to {@link lock}
     * @param {string} uuid caller-unique identifier matching the one used
     *   during lock acquisition in {@link lock}
     * @param {LockLevel} lockLevel target level to downgrade to (`NONE`
     *   releases fully, `SHARED` keeps a reader lock)
     * @returns {LockOperationResult} whether the operation succeeded and the
     *   level held by the caller after the call
     * @throws {NativeError} when `lockLevel` is invalid or the endpoint is not
     *   initialized
     */
    async unlock(
        resourceId: string,
        uuid: string,
        lockLevel: LockLevel,
    ): Promise<LockOperationResult> {
        return this.native.unlock(this.servicePtr, [resourceId, uuid, lockLevel]);
    }

    /**
     * Checks whether any connection (including the caller) holds a `RESERVED`
     * or higher lock on the resource.
     *
     * Use it to probe for contention before attempting to escalate a `SHARED`
     * lock to `RESERVED` or higher with {@link lock}.
     *
     * @param {string} resourceId identifier of the resource to check
     * @param {string} uuid caller-unique identifier, as used with
     *   {@link lock}/{@link unlock}
     * @returns {boolean} `true` if a `RESERVED` or higher lock exists on the
     *   resource, `false` otherwise
     */
    async checkReservedLock(resourceId: string, uuid: string): Promise<boolean> {
        return this.native.checkReservedLock(this.servicePtr, [resourceId, uuid]);
    }
}
