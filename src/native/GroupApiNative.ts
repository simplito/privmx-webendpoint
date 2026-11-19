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
    CipherRange,
    SequenceAppendResult,
    SequenceItem,
    SequenceItemHeader,
    SequenceMarkInfo,
    GroupEventSelectorType,
    GroupEventType,
    GroupRoleChange,
    GroupRulesUpdate,
    GroupLogKind,
} from "../Types.js";
import { BaseNative } from "./BaseNative.js";
import type { NativeSegment } from "../service/groupPaths.js";

/** Results as the core serializes them; GroupApi maps them to the public shapes. @internal */
export interface NativeGroupLogEntry {
    seq: number;
    kind: GroupLogKind;
    author: string;
    authorPubKey: string;
    date: number;
    keyVersion: number;
    rosterVersion: number;
    addedUsers: string[];
    addedManagers: string[];
    removed: string[];
}
export interface NativeAudience {
    groups: string[];
    users: string[];
}
export interface NativeDecryptedEnvelope {
    data: Uint8Array;
    author: { userId: string; pubKey: string; role: string };
    keyVersion: number;
    encryptedAt: number;
    sharedWith: NativeAudience;
}
export interface NativeDecryptResult {
    statusCode: number;
    envelope: NativeDecryptedEnvelope;
    details: { userId: string; pubKey: string; envelopeKind: string };
}
export interface NativeDecryptOptions {
    expectedAuthor?: string;
    anyAuthor?: boolean;
    currentEpochOnly?: boolean;
}
export interface NativeEncryptOptions {
    alsoFor: Array<{ groupId?: string; user?: UserWithPubKey }>;
}
export interface NativeDecryptItem {
    envelope: Uint8Array;
    location: NativeSegment[];
    options: NativeDecryptOptions;
}
export interface NativeOutsiderEnvelope {
    data: Uint8Array;
    keyVersion: number;
    sender: { userId: string; pubKey: string };
    encryptedAt: number;
    sharedWith: NativeAudience;
}
export interface NativeSharedEnvelope {
    data: Uint8Array;
    sender: { userId: string; pubKey: string };
    homeGroupId: string;
    senderMembership: string;
    via: string;
    encryptedAt: number;
    sharedWith: NativeAudience;
}
export interface NativeEnvelopeHeader {
    version: number;
    groupId: string;
    keyVersion: number;
    fromOutsider: boolean;
    isSigned: boolean;
    isFile: boolean;
    hasLocation: boolean;
    authorUserId: string;
    sequenceId?: string;
    alsoForGroups: Array<{ groupId: string; keyVersion: number }>;
    alsoForUsers: string[];
}

export interface NativeFileInfo {
    author?: { userId: string; pubKey: string; role: string };
    sender?: { userId: string; pubKey: string };
    homeGroupId: string;
    senderMembership: string;
    via: string;
    sharedWith: NativeAudience;
    keyVersion: number;
    size: number;
    complete: boolean;
}

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
            Uint8Array | undefined,
            string,
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
    async removeGroupMembers(ptr: number, args: [string, string[]]): Promise<number> {
        return this.runAsync<number>((taskId) =>
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
    async rotateGroupKey(ptr: number, args: [string]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_rotateGroupKey(taskId, ptr, args),
        );
    }
    async deriveGroupId(ptr: number, args: [string, Uint8Array]): Promise<string> {
        return this.runAsync<string>((taskId) =>
            this.api.lib.GroupApi_deriveGroupId(taskId, ptr, args),
        );
    }
    async getGroups(
        ptr: number,
        args: [string[]],
    ): Promise<Array<{ statusCode: number; group: Group }>> {
        return this.runAsync<Array<{ statusCode: number; group: Group }>>((taskId) =>
            this.api.lib.GroupApi_getGroups(taskId, ptr, args),
        );
    }
    async getGroupPublicKey(
        ptr: number,
        args: [string, string],
    ): Promise<{ groupId: string; keyVersion: number; pubKey: string }> {
        return this.runAsync<{
            groupId: string;
            keyVersion: number;
            pubKey: string;
        }>((taskId) => this.api.lib.GroupApi_getGroupPublicKey(taskId, ptr, args));
    }
    async setGroupVisibility(ptr: number, args: [string, string]): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_setGroupVisibility(taskId, ptr, args),
        );
    }
    async reseatGroupMembers(ptr: number, args: [string, string[]]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_reseatGroupMembers(taskId, ptr, args),
        );
    }
    async setGroupRoles(ptr: number, args: [string, GroupRoleChange[]]): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_setGroupRoles(taskId, ptr, args),
        );
    }
    async updateGroupRules(ptr: number, args: [string, GroupRulesUpdate]): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_updateGroupRules(taskId, ptr, args),
        );
    }
    async getGroupLog(
        ptr: number,
        args: [string, PagingQuery],
    ): Promise<PagingList<NativeGroupLogEntry>> {
        return this.runAsync<PagingList<NativeGroupLogEntry>>((taskId) =>
            this.api.lib.GroupApi_getGroupLog(taskId, ptr, args),
        );
    }
    async encrypt(
        ptr: number,
        args: [string, NativeSegment[], Uint8Array, NativeEncryptOptions],
    ): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId) =>
            this.api.lib.GroupApi_encrypt(taskId, ptr, args),
        );
    }
    async decrypt(
        ptr: number,
        args: [string, NativeSegment[], Uint8Array, NativeDecryptOptions],
    ): Promise<NativeDecryptedEnvelope> {
        return this.runAsync<NativeDecryptedEnvelope>((taskId) =>
            this.api.lib.GroupApi_decrypt(taskId, ptr, args),
        );
    }
    async decryptMany(
        ptr: number,
        args: [string, NativeDecryptItem[]],
    ): Promise<NativeDecryptResult[]> {
        return this.runAsync<NativeDecryptResult[]>((taskId) =>
            this.api.lib.GroupApi_decryptMany(taskId, ptr, args),
        );
    }
    async encryptAsOutsider(
        ptr: number,
        args: [string, string, NativeSegment[], Uint8Array, NativeEncryptOptions],
    ): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId) =>
            this.api.lib.GroupApi_encryptAsOutsider(taskId, ptr, args),
        );
    }
    async encryptAnonymously(
        ptr: number,
        args: [string, string, NativeSegment[], Uint8Array],
    ): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId) =>
            this.api.lib.GroupApi_encryptAnonymously(taskId, ptr, args),
        );
    }
    async decryptFromOutsider(
        ptr: number,
        args: [string, NativeSegment[], Uint8Array, NativeDecryptOptions],
    ): Promise<NativeOutsiderEnvelope> {
        return this.runAsync<NativeOutsiderEnvelope>((taskId) =>
            this.api.lib.GroupApi_decryptFromOutsider(taskId, ptr, args),
        );
    }
    async decryptAnonymous(
        ptr: number,
        args: [string, NativeSegment[], Uint8Array],
    ): Promise<{ data: Uint8Array; keyVersion: number }> {
        return this.runAsync<{ data: Uint8Array; keyVersion: number }>((taskId) =>
            this.api.lib.GroupApi_decryptAnonymous(taskId, ptr, args),
        );
    }
    async decryptShared(
        ptr: number,
        args: [string, NativeSegment[], Uint8Array, NativeDecryptOptions],
    ): Promise<NativeSharedEnvelope> {
        return this.runAsync<NativeSharedEnvelope>((taskId) =>
            this.api.lib.GroupApi_decryptShared(taskId, ptr, args),
        );
    }
    async peekEnvelope(ptr: number, args: [Uint8Array]): Promise<NativeEnvelopeHeader> {
        return this.runAsync<NativeEnvelopeHeader>((taskId) =>
            this.api.lib.GroupApi_peekEnvelope(taskId, ptr, args),
        );
    }
    async beginFileEncryption(ptr: number, args: [string, NativeSegment[], NativeEncryptOptions]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_beginFileEncryption(taskId, ptr, args),
        );
    }
    async beginFileEncryptionAsOutsider(ptr: number, args: [string, string, NativeSegment[], NativeEncryptOptions]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_beginFileEncryptionAsOutsider(taskId, ptr, args),
        );
    }
    async beginFileEncryptionAnonymously(ptr: number, args: [string, string, NativeSegment[]]): Promise<number> {
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
    async beginFileDecryption(ptr: number, args: [string, NativeSegment[], Uint8Array, NativeDecryptOptions]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_beginFileDecryption(taskId, ptr, args),
        );
    }
    async beginFileDecryptionFromOutsider(ptr: number, args: [string, NativeSegment[], Uint8Array, NativeDecryptOptions]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_beginFileDecryptionFromOutsider(taskId, ptr, args),
        );
    }
    async beginAnonymousFileDecryption(ptr: number, args: [string, NativeSegment[], Uint8Array]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_beginAnonymousFileDecryption(taskId, ptr, args),
        );
    }
    async beginSharedFileDecryption(ptr: number, args: [string, NativeSegment[], Uint8Array, NativeDecryptOptions]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_beginSharedFileDecryption(taskId, ptr, args),
        );
    }
    async decryptFileChunk(ptr: number, args: [number, Uint8Array]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId) =>
            this.api.lib.GroupApi_decryptFileChunk(taskId, ptr, args),
        );
    }
    async getFileCipherRange(ptr: number, args: [number, number, number]): Promise<CipherRange> {
        return this.runAsync<CipherRange>((taskId) =>
            this.api.lib.GroupApi_getFileCipherRange(taskId, ptr, args),
        );
    }
    async seekInEncryptedFile(ptr: number, args: [number, number]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_seekInEncryptedFile(taskId, ptr, args),
        );
    }
    async finishFileDecryption(ptr: number, args: [number]): Promise<NativeFileInfo> {
        return this.runAsync<NativeFileInfo>((taskId) =>
            this.api.lib.GroupApi_finishFileDecryption(taskId, ptr, args),
        );
    }
    async beginSequence(ptr: number, args: [string, NativeSegment[], number]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_beginSequence(taskId, ptr, args),
        );
    }
    async getSequenceHeader(ptr: number, args: [number]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId) =>
            this.api.lib.GroupApi_getSequenceHeader(taskId, ptr, args),
        );
    }
    async appendToSequence(ptr: number, args: [number, Uint8Array]): Promise<SequenceAppendResult> {
        return this.runAsync<SequenceAppendResult>((taskId) =>
            this.api.lib.GroupApi_appendToSequence(taskId, ptr, args),
        );
    }
    async checkpointSequence(ptr: number, args: [number]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId) =>
            this.api.lib.GroupApi_checkpointSequence(taskId, ptr, args),
        );
    }
    async finishSequence(ptr: number, args: [number]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId) =>
            this.api.lib.GroupApi_finishSequence(taskId, ptr, args),
        );
    }
    async openSequence(ptr: number, args: [string, NativeSegment[], Uint8Array, NativeDecryptOptions, Uint8Array | undefined]): Promise<number> {
        return this.runAsync<number>((taskId) =>
            this.api.lib.GroupApi_openSequence(taskId, ptr, args),
        );
    }
    async readSequenceItem(ptr: number, args: [number, Uint8Array]): Promise<SequenceItem> {
        return this.runAsync<SequenceItem>((taskId) =>
            this.api.lib.GroupApi_readSequenceItem(taskId, ptr, args),
        );
    }
    async verifySequenceMark(ptr: number, args: [number, Uint8Array]): Promise<SequenceMarkInfo> {
        return this.runAsync<SequenceMarkInfo>((taskId) =>
            this.api.lib.GroupApi_verifySequenceMark(taskId, ptr, args),
        );
    }
    async closeSequence(ptr: number, args: [number]): Promise<void> {
        return this.runAsync<void>((taskId) =>
            this.api.lib.GroupApi_closeSequence(taskId, ptr, args),
        );
    }
    async peekSequenceItem(ptr: number, args: [Uint8Array]): Promise<SequenceItemHeader> {
        return this.runAsync<SequenceItemHeader>((taskId) =>
            this.api.lib.GroupApi_peekSequenceItem(taskId, ptr, args),
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
