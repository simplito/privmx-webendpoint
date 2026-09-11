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
    GroupMemberToAdd,
    ContainerPolicy,
    DecryptedEnvelope,
    DecryptedFileInfo,
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
    async createGroup(
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
            this.api.lib.GroupApi_createGroup(taskId, ptr, args),
        );
    }
    async addGroupMembers(ptr: number, args: [string, GroupMemberToAdd[]]): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_addGroupMembers(taskId, ptr, args),
        );
    }
    async removeGroupMembers(ptr: number, args: [string, string[]]): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_removeGroupMembers(taskId, ptr, args),
        );
    }
    async updateGroupPublicMeta(ptr: number, args: [string, Uint8Array, number]): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_updateGroupPublicMeta(taskId, ptr, args),
        );
    }
    async updateGroupPrivateMeta(ptr: number, args: [string, Uint8Array, number]): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_updateGroupPrivateMeta(taskId, ptr, args),
        );
    }
    async updateGroupPolicy(ptr: number, args: [string, ContainerPolicy]): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_updateGroupPolicy(taskId, ptr, args),
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
    async encrypt(ptr: number, args: [string, Uint8Array]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId) =>
            this.api.lib.GroupApi_encrypt(taskId, ptr, args),
        );
    }
    async encryptAnonymously(ptr: number, args: [string, string, Uint8Array]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId) =>
            this.api.lib.GroupApi_encryptAnonymously(taskId, ptr, args),
        );
    }
    async decrypt(ptr: number, args: [Uint8Array]): Promise<DecryptedEnvelope> {
        return this.runAsync<DecryptedEnvelope>((taskId) =>
            this.api.lib.GroupApi_decrypt(taskId, ptr, args),
        );
    }
    async beginFileEncryption(ptr: number, args: [string, number]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_beginFileEncryption(taskId, ptr, args),
        );
    }
    async beginFileEncryptionAnonymously(
        ptr: number,
        args: [string, string, number],
    ): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_beginFileEncryptionAnonymously(taskId, ptr, args),
        );
    }
    async encryptFileChunk(ptr: number, args: [number, Uint8Array]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId) =>
            this.api.lib.GroupApi_encryptFileChunk(taskId, ptr, args),
        );
    }
    async finishFileEncryption(ptr: number, args: [number]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId) =>
            this.api.lib.GroupApi_finishFileEncryption(taskId, ptr, args),
        );
    }
    async beginFileDecryption(ptr: number, args: [Uint8Array]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_beginFileDecryption(taskId, ptr, args),
        );
    }
    async decryptFileChunk(ptr: number, args: [number, Uint8Array]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId) =>
            this.api.lib.GroupApi_decryptFileChunk(taskId, ptr, args),
        );
    }
    async seekInEncryptedFile(ptr: number, args: [number, number]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_seekInEncryptedFile(taskId, ptr, args),
        );
    }
    async finishFileDecryption(ptr: number, args: [number]): Promise<DecryptedFileInfo> {
        return this.runAsync<DecryptedFileInfo>((taskId) =>
            this.api.lib.GroupApi_finishFileDecryption(taskId, ptr, args),
        );
    }
    async sendCustomEvent(
        ptr: number,
        args: [string, string, Uint8Array, string[]],
    ): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_sendCustomEvent(taskId, ptr, args),
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
    async buildCustomEventSubscriptionQuery(
        ptr: number,
        args: [string, GroupEventSelectorType, string],
    ): Promise<string> {
        return this.runAsync<string>((taskId) =>
            this.api.lib.GroupApi_buildCustomEventSubscriptionQuery(taskId, ptr, args),
        );
    }
}
