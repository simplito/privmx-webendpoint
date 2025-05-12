/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { PagingQuery, PagingList, UserWithPubKey, Kvdb, KvdbEntry, ContainerPolicy, KvdbKeysPagingQuery, KvdbEntryPagingQuery, DeleteEntriesResult } from "../Types";
import { BaseNative } from "./BaseNative";

export class KvdbApiNative extends BaseNative {
    async newApi(connectionPtr: number): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.KvdbApi_newKvdbApi(taskId, connectionPtr));
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.KvdbApi_deleteKvdbApi(taskId, ptr));
        this.deleteApiRef();
    }
    async create(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.KvdbApi_create(taskId, ptr, args));
    }
    async createKvdb(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, ContainerPolicy|undefined]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.KvdbApi_createKvdb(taskId, ptr, args));
    }
    async updateKvdb(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, number, boolean, boolean, ContainerPolicy|undefined]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.KvdbApi_updateKvdb(taskId, ptr, args));
    }
    async deleteKvdb(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.KvdbApi_deleteKvdb(taskId, ptr, args));
    }
    async getKvdb(ptr: number, args: [string]): Promise<Kvdb> {
        return this.runAsync<Kvdb>((taskId)=>this.api.lib.KvdbApi_getKvdb(taskId, ptr, args));
    }
    async listKvdbs(ptr: number, args: [string, PagingQuery]): Promise<PagingList<Kvdb>> {
        return this.runAsync<PagingList<Kvdb>>((taskId)=>this.api.lib.KvdbApi_listKvdbs(taskId, ptr, args));
    }
    async getEntry(ptr: number, args: [string, string]): Promise<KvdbEntry> {
        return this.runAsync<KvdbEntry>((taskId)=>this.api.lib.KvdbApi_getEntry(taskId, ptr, args));
    }
    async listEntriesKeys(ptr: number, args: [string, KvdbKeysPagingQuery]): Promise<PagingList<string>> {
        return this.runAsync<PagingList<string>>((taskId)=>this.api.lib.KvdbApi_listEntriesKeys(taskId, ptr, args));
    }
    async listEntries(ptr: number, args: [string, KvdbEntryPagingQuery]): Promise<PagingList<KvdbEntry>> {
        return this.runAsync<PagingList<KvdbEntry>>((taskId)=>this.api.lib.KvdbApi_listEntries(taskId, ptr, args));
    }
    async setEntry(ptr: number, args: [string, string, Uint8Array, Uint8Array, Uint8Array, number]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.KvdbApi_setEntry(taskId, ptr, args));
    }
    async deleteEntry(ptr: number, args: [string, string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.KvdbApi_deleteEntry(taskId, ptr, args));
    }
    async deleteEntries(ptr: number, args: [string, string[]]): Promise<DeleteEntriesResult> {
        return this.runAsync<DeleteEntriesResult>((taskId)=>this.api.lib.KvdbApi_deleteEntries(taskId, ptr, args));
    }
    async subscribeForKvdbEvents(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.KvdbApi_subscribeForKvdbEvents(taskId, ptr, args));
    }
    async unsubscribeFromKvdbEvents(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.KvdbApi_unsubscribeFromKvdbEvents(taskId, ptr, args));
    }
    async subscribeForEntryEvents(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.KvdbApi_subscribeForEntryEvents(taskId, ptr, args));
    }
    async unsubscribeFromEntryEvents(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.KvdbApi_unsubscribeFromEntryEvents(taskId, ptr, args));
    }
}
