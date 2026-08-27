/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import {
    PagingQuery,
    PagingList,
    UserWithPubKey,
    Group,
    GroupSummary,
    ContainerPolicy,
    GroupEventSelectorType,
    GroupEventType,
} from "../Types.js";
import { BaseNative } from "./BaseNative.js";

/**
 * Raw WASM wrapper for the C++ GroupApi - holds and forwards raw pointers.
 * Use {@link GroupApi} (src/service) instead.
 * @internal
 */
export class GroupApiNative extends BaseNative {
    async newApi(connectionPtr: number): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_newGroupApi(taskId, connectionPtr),
        );
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId) => this.api.lib.GroupApi_deleteGroupApi(taskId, ptr));
        this.deleteApiRef();
    }
    async create(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId) => this.api.lib.GroupApi_create(taskId, ptr, args));
    }
    async createGroupWithKeyTree(
        ptr: number,
        args: [
            string,
            UserWithPubKey[],
            UserWithPubKey[],
            Uint8Array,
            Uint8Array,
            ContainerPolicy | undefined,
        ],
    ): Promise<string> {
        return this.runAsync<string>((taskId) =>
            this.api.lib.GroupApi_createGroupWithKeyTree(taskId, ptr, args),
        );
    }
    async addGroupMember(
        ptr: number,
        args: [
            string,
            UserWithPubKey,
            boolean,
            UserWithPubKey[],
            UserWithPubKey[],
            Uint8Array,
            Uint8Array,
        ],
    ): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_addGroupMember(taskId, ptr, args),
        );
    }
    async removeGroupMember(
        ptr: number,
        args: [string, string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array],
    ): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_removeGroupMember(taskId, ptr, args),
        );
    }
    async updateGroup(
        ptr: number,
        args: [
            string,
            Uint8Array,
            Uint8Array,
            number,
            boolean,
            boolean,
            ContainerPolicy | undefined,
        ],
    ): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_updateGroup(taskId, ptr, args),
        );
    }
    async deleteGroup(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_deleteGroup(taskId, ptr, args),
        );
    }
    async getGroup(ptr: number, args: [string]): Promise<Group> {
        return this.runAsync<Group>((taskId) => this.api.lib.GroupApi_getGroup(taskId, ptr, args));
    }
    async listGroups(ptr: number, args: [string, PagingQuery]): Promise<PagingList<GroupSummary>> {
        return this.runAsync<PagingList<GroupSummary>>((taskId) =>
            this.api.lib.GroupApi_listGroups(taskId, ptr, args),
        );
    }
    async subscribeFor(ptr: number, args: [string[]]): Promise<string[]> {
        return this.runAsync<string[]>((taskId) =>
            this.api.lib.GroupApi_subscribeFor(taskId, ptr, args),
        );
    }
    async unsubscribeFrom(ptr: number, args: [string[]]): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_unsubscribeFrom(taskId, ptr, args),
        );
    }
    async buildSubscriptionQuery(
        ptr: number,
        args: [GroupEventType, GroupEventSelectorType, string],
    ): Promise<string> {
        return this.runAsync<string>((taskId) =>
            this.api.lib.GroupApi_buildSubscriptionQuery(taskId, ptr, args),
        );
    }
}
