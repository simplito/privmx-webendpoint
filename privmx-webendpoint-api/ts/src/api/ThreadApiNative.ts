/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { PagingQuery, PagingList, UserWithPubKey, Thread, Message, ContainerPolicy } from "../Types";
import { BaseNative } from "./BaseNative";

export class ThreadApiNative extends BaseNative {
    async newApi(connectionPtr: number): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.ThreadApi_newThreadApi(taskId, connectionPtr));
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.ThreadApi_deleteThreadApi(taskId, ptr));
        this.deleteApiRef();
    }
    async create(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.ThreadApi_create(taskId, ptr, args));
    }
    async createThread(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, ContainerPolicy|undefined]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.ThreadApi_createThread(taskId, ptr, args));
    }
    async updateThread(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, number, boolean, boolean, ContainerPolicy|undefined]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.ThreadApi_updateThread(taskId, ptr, args));
    }
    async deleteThread(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.ThreadApi_deleteThread(taskId, ptr, args));
    }
    async getThread(ptr: number, args: [string]): Promise<Thread> {
        return this.runAsync<Thread>((taskId)=>this.api.lib.ThreadApi_getThread(taskId, ptr, args));
    }
    async listThreads(ptr: number, args: [string, PagingQuery]): Promise<PagingList<Thread>> {
        return this.runAsync<PagingList<Thread>>((taskId)=>this.api.lib.ThreadApi_listThreads(taskId, ptr, args));
    }
    async getMessage(ptr: number, args: [string]): Promise<Message> {
        return this.runAsync<Message>((taskId)=>this.api.lib.ThreadApi_getMessage(taskId, ptr, args));
    }
    async listMessages(ptr: number, args: [string, PagingQuery]): Promise<PagingList<Message>> {
        return this.runAsync<PagingList<Message>>((taskId)=>this.api.lib.ThreadApi_listMessages(taskId, ptr, args));
    }
    async sendMessage(ptr: number, args: [string, Uint8Array, Uint8Array, Uint8Array]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.ThreadApi_sendMessage(taskId, ptr, args));
    }
    async deleteMessage(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.ThreadApi_deleteMessage(taskId, ptr, args));
    }
    async updateMessage(ptr: number, args: [string, Uint8Array, Uint8Array, Uint8Array]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.ThreadApi_updateMessage(taskId, ptr, args));
    }
    async subscribeForThreadEvents(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.ThreadApi_subscribeForThreadEvents(taskId, ptr, args));
    }
    async unsubscribeFromThreadEvents(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.ThreadApi_unsubscribeFromThreadEvents(taskId, ptr, args));
    }
    async subscribeForMessageEvents(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.ThreadApi_subscribeForMessageEvents(taskId, ptr, args));
    }
    async unsubscribeFromMessageEvents(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.ThreadApi_unsubscribeFromMessageEvents(taskId, ptr, args));
    }
}
