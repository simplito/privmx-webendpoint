/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { Event } from "../Types";
import { BaseNative } from "./BaseNative";

export class EventQueueNative extends BaseNative {
    protected async newApi(_connectionPtr: number): Promise<number> { 
        throw new Error("Use the newEventQueue() - specialized version of method instead.");
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.EventQueue_deleteEventQueue(taskId, ptr));
        this.deleteApiRef();
    }
    async newEventQueue(): Promise<number> {
        return this.runAsync<number>((taskId)=>this.api.lib.EventQueue_newEventQueue(taskId));
    }
    async deleteEventQueue(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.EventQueue_deleteEventQueue(taskId, ptr));
        this.deleteApiRef();
    }
    async waitEvent(ptr: number, args: []): Promise<Event> {
        return this.runAsync<Event>((taskId)=>this.api.lib.EventQueue_waitEvent(taskId, ptr, args));
    }
    async emitBreakEvent(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.EventQueue_emitBreakEvent(taskId, ptr, args));
    }
}
