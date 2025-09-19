/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { PagingQuery, PagingList, UserWithPubKey, Store, File, ContainerPolicy, StoreEventSelectorType, StoreEventType } from "../Types";
import { BaseNative } from "./BaseNative";

export class StoreApiNative extends BaseNative {
    async newApi(connectionPtr: number): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.StoreApi_newStoreApi(taskId, connectionPtr));
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.StoreApi_deleteStoreApi(taskId, ptr));
        this.deleteApiRef();
    }
    async create(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StoreApi_create(taskId, ptr, args));
    }
    async createStore(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, ContainerPolicy|undefined]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.StoreApi_createStore(taskId, ptr, args));
    }
    async updateStore(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, number, boolean, boolean, ContainerPolicy|undefined]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StoreApi_updateStore(taskId, ptr, args));
    }
    async deleteStore(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StoreApi_deleteStore(taskId, ptr, args));
    }
    async getStore(ptr: number, args: [string]): Promise<Store> {
        return this.runAsync<Store>((taskId)=>this.api.lib.StoreApi_getStore(taskId, ptr, args));
    }
    async listStores(ptr: number, args: [string, PagingQuery]): Promise<PagingList<Store>> {
        return this.runAsync<PagingList<Store>>((taskId)=>this.api.lib.StoreApi_listStores(taskId, ptr, args));
    }
    async createFile(ptr: number, args: [string, Uint8Array, Uint8Array, number, boolean]): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.StoreApi_createFile(taskId, ptr, args));
    }
    async updateFile(ptr: number, args: [string, Uint8Array, Uint8Array, number]): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.StoreApi_updateFile(taskId, ptr, args));
    }
    async updateFileMeta(ptr: number, args: [string, Uint8Array, Uint8Array]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StoreApi_updateFileMeta(taskId, ptr, args));
    }
    async writeToFile(ptr: number, args: [number, Uint8Array, boolean]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StoreApi_writeToFile(taskId, ptr, args));
    }
    async deleteFile(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StoreApi_deleteFile(taskId, ptr, args));
    }
    async getFile(ptr: number, args: [string]): Promise<File> {
        return this.runAsync<File>((taskId)=>this.api.lib.StoreApi_getFile(taskId, ptr, args));
    }
    async listFiles(ptr: number, args: [string, PagingQuery]): Promise<PagingList<File>> {
        return this.runAsync<PagingList<File>>((taskId)=>this.api.lib.StoreApi_listFiles(taskId, ptr, args));
    }
    async openFile(ptr: number, args: [string]): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.StoreApi_openFile(taskId, ptr, args));
    }
    async readFromFile(ptr: number, args: [number, number]): Promise<Uint8Array> {
        return this.runAsync<Uint8Array>((taskId)=>this.api.lib.StoreApi_readFromFile(taskId, ptr, args));
    }
    async seekInFile(ptr: number, args: [number, number]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StoreApi_seekInFile(taskId, ptr, args));
    }
    async closeFile(ptr: number, args: [number]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.StoreApi_closeFile(taskId, ptr, args));
    }
    async subscribeFor(ptr: number, args: [string[]]): Promise<string[]> {
        return this.runAsync<string[]>((taskId)=>this.api.lib.StoreApi_subscribeFor(taskId, ptr, args));
    }
    async unsubscribeFrom(ptr: number, args: [string[]]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StoreApi_unsubscribeFrom(taskId, ptr, args));
    }
    async buildSubscriptionQuery(ptr: number, args: [StoreEventType, StoreEventSelectorType, string]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.StoreApi_buildSubscriptionQuery(taskId, ptr, args));
    }
}
