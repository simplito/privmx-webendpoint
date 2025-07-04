/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { ContainerPolicy, PagingList, PagingQuery, Stream, StreamRoom, StreamSettings, TurnCredentials, UserWithPubKey } from "../Types";
import { WebRtcClient } from "../webStreams/WebRtcClient";
import { WebRtcInterfaceImpl } from "../webStreams/WebRtcInterfaceImpl";
import { BaseNative } from "./BaseNative";

export class StreamApiNative extends BaseNative {
    protected webRtcInterfacePtr: number = -1;
    protected webRtcInterfaceImpl: WebRtcInterfaceImpl | null;

    // private async createWebRtcInterfaceImpl(): Promise<void> {
    //      // - init webRtcInterface po stronie CPP i zwrot wskaznika
    //     this.webRtcInterfacePtr = await this.runAsync<number>((taskId)=>this.api.lib.StreamApi_newWebRtcInterface(taskId));
    // }
    async newApi(connectionPtr: number, eventApiPtr: number): Promise<number> {
        // TODO: tutaj jeszcze kilka rzeczy:
        // - init em_webrtc po stronie JS

        // po przekazaniu tutaj wskaznika do webrtc, mozemy go pozniej juz nie przekazywac w pozostalych funkcjach
        // await this.createWebRtcInterfaceImpl();
        this.bindWebRtcInterfaceAsHandler();
        return this.runAsync<number>((taskId)=>this.api.lib.StreamApi_newStreamApi(taskId, connectionPtr, eventApiPtr));
    }
    async deleteApi(ptr: number): Promise<void> {
        await this.runAsync<void>((taskId)=>this.api.lib.StreamApi_deleteStreamApi(taskId, ptr));
        this.deleteApiRef();
    }
    async create(ptr: number, args: []): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StreamApi_create(taskId, ptr, args));
    }

    async createStreamRoom(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, ContainerPolicy|undefined]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.StreamApi_createStreamRoom(taskId, ptr, args));
    }
    async updateStreamRoom(ptr: number, args: [string, UserWithPubKey[], UserWithPubKey[], Uint8Array, Uint8Array, number, boolean, boolean, ContainerPolicy|undefined]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StreamApi_updateStreamRoom(taskId, ptr, args));
    }
    async deleteStreamRoom(ptr: number, args: [string]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StreamApi_deleteStreamRoom(taskId, ptr, args));
    }
    async getStreamRoom(ptr: number, args: [string]): Promise<StreamRoom> {
        return this.runAsync<StreamRoom>((taskId)=>this.api.lib.StreamApi_getStreamRoom(taskId, ptr, args));
    }
    async listStreamRooms(ptr: number, args: [string, PagingQuery]): Promise<PagingList<StreamRoom>> {
        return this.runAsync<PagingList<StreamRoom>>((taskId)=>this.api.lib.StreamApi_listStreamRooms(taskId, ptr, args));
    }
    async createStream(ptr: number, args: [string, number]): Promise<number> {
        // params from api: streamRoomId, streamId
        // params to lib: streamRoomId, streamId, webrtcInterfacePtr
        // const libArgs: [string, number, number] = [...args, this.webRtcInterfacePtr];
        return this.runAsync<number>((taskId)=>this.api.lib.StreamApi_createStream(taskId, ptr, args));
    }
    async publishStream(ptr: number, args: [number]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StreamApi_publishStream(taskId, ptr, args));
    }
    async unpublishStream(ptr: number, args: [number]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StreamApi_unpublishStream(taskId, ptr, args));
    }

    async joinStream(ptr: number, args: [string, number[], any]): Promise<number> {
        // params from api: streamRoomId, streamIds[], settings:any
        // params to lib: streamRoomId, streamsIds[], settings:any, webrtcInterfacePtr
        // const libArgs: [string, number[], any, number] = [...args, this.webRtcInterfacePtr];
        return this.runAsync<number>((taskId)=>this.api.lib.StreamApi_joinStream(taskId, ptr, args));
    }
    async listStreams(ptr: number, args: [string]): Promise<Stream[]> {
        return this.runAsync<Stream[]>((taskId)=>this.api.lib.StreamApi_listStreams(taskId, ptr, args));
    }
    async leaveStream(ptr: number, args: [number]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StreamApi_leaveStream(taskId, ptr, args));
    }
    async keyManagement(ptr: number, args: [boolean]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StreamApi_keyManagement(taskId, ptr, args));
    }
    async getTurnCredentials(ptr: number, args: []): Promise<TurnCredentials> {
        return this.runAsync<TurnCredentials>((taskId)=>this.api.lib.StreamApi_getTurnCredentials(taskId, ptr, args));
    }
    protected bindWebRtcInterfaceAsHandler(): void {
        // if (this.webRtcInterfacePtr > -1) {
        //     await this.deleteWebRtcInterface(this.webRtcInterfacePtr);
        //     this.webRtcInterfacePtr = -1;
        //     this.webRtcInterfaceImpl = null;
        // }

        // const [client] = args;
        this.webRtcInterfaceImpl = new WebRtcInterfaceImpl();
        console.log("webRtcInterfaceImpl(JS) created", this.webRtcInterfaceImpl);
        (window as any).webRtcInterfaceToNativeHandler = this.webRtcInterfaceImpl;
        console.log("... and binded to window", (window as any).webRtcInterfaceToNativeHandler);
        // this.webRtcInterfacePtr = await this.newWebRtcInterface(connectionPtr);
    }

    // protected async newWebRtcInterface(connectionPtr: number): Promise<number> {
    //     return this.runAsync<number>((taskId) => this.api.lib.StreamApi_newWebRtcInterface(taskId, connectionPtr));
    // }

    // protected async deleteWebRtcInterface(ptr: number): Promise<void> {
    //     await this.runAsync<void>((taskId)=>this.api.lib.StreamApi_deleteWebRtcInterface(taskId, ptr));
    // }
}
