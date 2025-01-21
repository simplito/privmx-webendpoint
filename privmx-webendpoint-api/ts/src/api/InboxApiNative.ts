/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { PagingQuery, PagingList, UserWithPubKey, Inbox, InboxPublicView, InboxEntry, FilesConfig, ContainerWithoutItemPolicy } from "../Types";
import { BaseNative } from "./BaseNative";

export class InboxApiNative extends BaseNative {
    async newApi(connectionPtr: number, threadApiPtr: number, storeApiPtr: number): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.InboxApi_newInboxApi(taskId, connectionPtr, threadApiPtr, storeApiPtr));
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.InboxApi_deleteInboxApi(taskId, ptr));
        this.deleteApiRef();
    }
    async create(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.InboxApi_create(taskId, ptr, args));
    }
    async createInbox(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, FilesConfig|undefined, ContainerWithoutItemPolicy|undefined]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.InboxApi_createInbox(taskId, ptr, args));
    }
    async updateInbox(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, FilesConfig|undefined, number, boolean, boolean, ContainerWithoutItemPolicy|undefined]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.InboxApi_updateInbox(taskId, ptr, args));
    }
    async getInbox(ptr: number, args: [string]): Promise<Inbox> {
        return this.runAsync<Inbox>((taskId)=>this.api.lib.InboxApi_getInbox(taskId, ptr, args));
    }
    async listInboxes(ptr: number, args: [string, PagingQuery]): Promise<PagingList<Inbox>> {
        return this.runAsync<PagingList<Inbox>>((taskId)=>this.api.lib.InboxApi_listInboxes(taskId, ptr, args));
    }
    async getInboxPublicView(ptr: number, args: [string]): Promise<InboxPublicView> {
        return this.runAsync<InboxPublicView>((taskId)=>this.api.lib.InboxApi_getInboxPublicView(taskId, ptr, args));
    }
    async deleteInbox(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.InboxApi_deleteInbox(taskId, ptr, args));
    }
    async prepareEntry(ptr: number, args: [string, Uint8Array, number[], string|undefined]): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.InboxApi_prepareEntry(taskId, ptr, args));
    }
    async sendEntry(ptr: number, args: [number]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.InboxApi_sendEntry(taskId, ptr, args));
    }
    async readEntry(ptr: number, args: [string]): Promise<InboxEntry> {
        return this.runAsync<InboxEntry>((taskId)=>this.api.lib.InboxApi_readEntry(taskId, ptr, args));
    }
    async deleteEntry(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.InboxApi_deleteEntry(taskId, ptr, args));
    }
    async listEntries(ptr: number, args: [string, PagingQuery]): Promise<PagingList<InboxEntry>> {
        return this.runAsync<PagingList<InboxEntry>>((taskId)=>this.api.lib.InboxApi_listEntries(taskId, ptr, args));
    }
    async createFileHandle(ptr: number, args: [Uint8Array, Uint8Array, number]): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.InboxApi_createFileHandle(taskId, ptr, args));
    }
    async writeToFile(ptr: number, args: [number, number, Uint8Array]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.InboxApi_writeToFile(taskId, ptr, args));
    }
    async openFile(ptr: number, args: [string]): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.InboxApi_openFile(taskId, ptr, args));
    }
    async readFromFile(ptr: number, args: [number, number]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId)=>this.api.lib.InboxApi_readFromFile(taskId, ptr, args));
    }
    async seekInFile(ptr: number, args: [number, number]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.InboxApi_seekInFile(taskId, ptr, args));
    }
    async closeFile(ptr: number, args: [number]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.InboxApi_closeFile(taskId, ptr, args));
    }
    async subscribeForInboxEvents(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.InboxApi_subscribeForInboxEvents(taskId, ptr, args));
    }
    async unsubscribeFromInboxEvents(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.InboxApi_unsubscribeFromInboxEvents(taskId, ptr, args));
    }
    async subscribeForEntryEvents(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.InboxApi_subscribeForEntryEvents(taskId, ptr, args));
    }
    async unsubscribeFromEntryEvents(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.InboxApi_unsubscribeFromEntryEvents(taskId, ptr, args));
    }
}
