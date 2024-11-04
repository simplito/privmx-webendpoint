/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { PagingQuery, PagingList, Context } from "../Types";
import { BaseNative } from "./BaseNative";

export class ConnectionNative extends BaseNative {
    protected lastConnectionId: number = -1;

    protected async newApi(_connectionPtr: number): Promise<number> { 
        throw new Error("Use the newConnection() - specialized version of method instead.");
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.Connection_deleteConnection(taskId, ptr));
        this.deleteApiRef();
    }
    async newConnection(): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.Connection_newConnection(taskId));
    }
    async deleteConnection(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.Connection_deleteConnection(taskId, ptr));
        this.deleteApiRef();
    }
    async connect(ptr: number, args: [string, string, string]): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.Connection_connect(taskId, ptr, args));
        await this.getConnectionId(ptr, []);
    }
    async connectPublic(ptr: number, args: [string, string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.Connection_connectPublic(taskId, ptr, args));
    }
    async getConnectionId(ptr: number, args: []): Promise<number> {
        if (this.lastConnectionId < 0) {
            this.lastConnectionId = await this.runAsync<number>((taskId)=>this.api.lib.Connection_getConnectionId(taskId, ptr, args));
        }
        return this.lastConnectionId;        
    }
    async listContexts(ptr: number, args: [PagingQuery]): Promise<PagingList<Context>> {
        return this.runAsync<PagingList<Context>>((taskId)=>this.api.lib.Connection_listContexts(taskId, ptr, args));
    }
    async disconnect(ptr: number, args: []): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.Connection_disconnect(taskId, ptr, args));
    }
}
