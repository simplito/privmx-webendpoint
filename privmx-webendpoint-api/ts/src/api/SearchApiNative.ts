/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { ContainerPolicy, IndexMode, PagingList, PagingQuery, SearchIndex, UserWithPubKey, Document } from "../Types";
import { BaseNative } from "./BaseNative";

export class SearchApiNative extends BaseNative {
    async newApi(connectionPtr: number, storeApiPtr: number, kvdbApiPtr: number): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.SearchApi_newSearchApi(taskId, connectionPtr, storeApiPtr, kvdbApiPtr));
    }
    async deleteApi(ptr: number): Promise<void> {
        this.runAsync<void>((taskId)=>this.api.lib.SearchApi_deleteSearchApi(taskId, ptr));
        this.deleteApiRef();
    }
    async create(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SearchApi_create(taskId, ptr, args));
    }
    async createSearchIndex(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, IndexMode, ContainerPolicy|undefined]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.SearchApi_createSearchIndex(taskId, ptr, args));
    }
    async updateSearchIndex(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, number, boolean, boolean, ContainerPolicy|undefined]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SearchApi_updateSearchIndex(taskId, ptr, args));
    }
    async deleteSearchIndex(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SearchApi_deleteSearchIndex(taskId, ptr, args));
    }
    async getSearchIndex(ptr: number, args: [string]): Promise<SearchIndex> {
        return this.runAsync<SearchIndex>((taskId)=>this.api.lib.SearchApi_getSearchIndex(taskId, ptr, args));
    }
    async listSearchIndexes(ptr: number, args: [string, PagingQuery]): Promise<PagingList<SearchIndex>> {
        return this.runAsync<PagingList<SearchIndex>>((taskId)=>this.api.lib.SearchApi_listSearchIndexes(taskId, ptr, args));
    }
    async openSearchIndex(ptr: number, args: [string]): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.SearchApi_openSearchIndex(taskId, ptr, args));
    }
    async closeSearchIndex(ptr: number, args: [number]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SearchApi_closeSearchIndex(taskId, ptr, args));
    }
    async addDocument(ptr: number, args: [number, string, string]): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.SearchApi_addDocument(taskId, ptr, args));
    }
    async updateDocument(ptr: number, args: [number, Document]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SearchApi_updateDocument(taskId, ptr, args));
    }
    async deleteDocument(ptr: number, args: [number, number]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.SearchApi_deleteDocument(taskId, ptr, args));
    }
    async getDocument(ptr: number, args: [number, number]): Promise<Document> {
        return this.runAsync<Document>((taskId)=>this.api.lib.SearchApi_getDocument(taskId, ptr, args));
    }
    async listDocuments(ptr: number, args: [string, PagingQuery]): Promise<PagingList<Document>> {
        return this.runAsync<PagingList<Document>>((taskId)=>this.api.lib.SearchApi_listDocuments(taskId, ptr, args));
    }
    async searchDocuments(ptr: number, args: [number, string, PagingQuery]): Promise<PagingList<Document>> {
        return this.runAsync<PagingList<Document>>((taskId)=>this.api.lib.SearchApi_searchDocuments(taskId, ptr, args));
    }
}