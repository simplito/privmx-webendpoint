/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { UserWithPubKey } from "../Types";
import { BaseNative } from "./BaseNative";

export class EventApiNative extends BaseNative {
    async newApi(connectionPtr: number): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.EventApi_newEventApi(taskId, connectionPtr));
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.EventApi_deleteEventApi(taskId, ptr));
        this.deleteApiRef();
    }
    async create(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.EventApi_create(taskId, ptr, args));
    }
    async emitEvent(ptr: number, args: [string, string, Uint8Array, UserWithPubKey[]]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.EventApi_emitEvent(taskId, ptr, args));
    }
    async subscribeForCustomEvents(ptr: number, args: [string, string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.EventApi_subscribeForCustomEvents(taskId, ptr, args));
    }
    async unsubscribeFromCustomEvents(ptr: number, args: [string, string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.EventApi_unsubscribeFromCustomEvents(taskId, ptr, args));
    }    
}
