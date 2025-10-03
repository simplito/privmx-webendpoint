/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { Jsep, SdpWithRoomModel } from "../service/WebRtcInterface";
import { ContainerPolicy, PagingList, PagingQuery, Stream, StreamEventSelectorType, StreamEventType, StreamRoom, StreamSettings, TurnCredentials, UserWithPubKey } from "../Types";
import { WebRtcClient } from "../webStreams/WebRtcClient";
import { SessionId } from "../webStreams/WebRtcClientTypes";
import { WebRtcInterfaceImpl } from "../webStreams/WebRtcInterfaceImpl";
import { Api } from "./Api";
import { BaseNative } from "./BaseNative";

export class StreamApiNative extends BaseNative {
    protected static bindingId: number = -1;
    public static getBindingId() {
        return ++this.bindingId;
    }
    protected webRtcInterfacePtr: number = -1;
    protected selfPtr: number = -1;
    protected webRtcInterfaceImpl: WebRtcInterfaceImpl | null;
    
    constructor(api: Api, protected webRtcClient: WebRtcClient) {
        super(api);
        webRtcClient.bindApiInterface({
            trickle:(sessionId: SessionId, candidate: RTCIceCandidate) => {
                return this.trickle(this.selfPtr, [sessionId, candidate]);
            },
            acceptOffer:(sessionId: SessionId, sdp: Jsep) => {
                return this.acceptOfferOnReconfigure(this.selfPtr, [sessionId, sdp]);
            }
        });
    }

    async newApi(connectionPtr: number, eventApiPtr: number): Promise<number> {
        const bindingId = StreamApiNative.getBindingId();
        this.bindWebRtcInterfaceAsHandler(bindingId);
        this.selfPtr = await this.runAsync<number>((taskId)=>this.api.lib.StreamApi_newStreamApi(taskId, connectionPtr, eventApiPtr, bindingId));
        return this.selfPtr;
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

    async joinStream(ptr: number, args: [string, number[], any, number]): Promise<number> {
        // params from api: streamRoomId, streamIds[], settings:any
        // params to lib: streamRoomId, streamsIds[], settings:any, webrtcInterfacePtr
        // const libArgs: [string, number[], any, number] = [...args, this.webRtcInterfacePtr];
        return this.runAsync<number>((taskId)=>this.api.lib.StreamApi_joinStream(taskId, ptr, args));
    }
    async listStreams(ptr: number, args: [string]): Promise<Stream[]> {
        return this.runAsync<Stream[]>((taskId)=>this.api.lib.StreamApi_listStreams(taskId, ptr, args));
    }
    async leaveStream(ptr: number, args: [string, number[]]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StreamApi_leaveStream(taskId, ptr, args));
    }
    async keyManagement(ptr: number, args: [boolean]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StreamApi_keyManagement(taskId, ptr, args));
    }
    async getTurnCredentials(ptr: number, args: []): Promise<TurnCredentials[]> {
        return this.runAsync<TurnCredentials[]>((taskId)=>this.api.lib.StreamApi_getTurnCredentials(taskId, ptr, args));
    }
    async subscribeFor(ptr: number, args: [string[]]): Promise<string[]> {
        return this.runAsync<string[]>((taskId)=>this.api.lib.StreamApi_subscribeFor(taskId, ptr, args));
    }
    async unsubscribeFrom(ptr: number, args: [string[]]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StreamApi_unsubscribeFrom(taskId, ptr, args));
    }
    async buildSubscriptionQuery(ptr: number, args: [StreamEventType, StreamEventSelectorType, string]): Promise<string> {
        return this.runAsync<string>((taskId)=>this.api.lib.StreamApi_buildSubscriptionQuery(taskId, ptr, args));
    }

    async trickle(ptr: number, args: [number, RTCIceCandidate]): Promise<void> {
        const [sessionId, candidate] = args;
        const convertedArgs: [number, string] = [sessionId, JSON.stringify(candidate)];
        return this.runAsync<void>((taskId)=>this.api.lib.StreamApi_trickle(taskId, ptr, convertedArgs));
    }

    async acceptOfferOnReconfigure(ptr: number, args: [number, Jsep]): Promise<void> {
        return this.runAsync<void>((taskId)=>this.api.lib.StreamApi_acceptOfferOnReconfigure(taskId, ptr, args));
    }

    protected bindWebRtcInterfaceAsHandler(bindingId: number): void {
        // if (this.webRtcInterfacePtr > -1) {
        //     await this.deleteWebRtcInterface(this.webRtcInterfacePtr);
        //     this.webRtcInterfacePtr = -1;
        //     this.webRtcInterfaceImpl = null;
        // }

        // const [client] = args;

        this.webRtcInterfaceImpl = new WebRtcInterfaceImpl(this.webRtcClient);
        console.log("webRtcInterfaceImpl(JS) created", this.webRtcInterfaceImpl, "with bindingId: ", bindingId);
        let windowBinder = (window as any).webRtcInterfaceToNativeHandler;
        if (!windowBinder) {
            windowBinder = {};
        }
        windowBinder[bindingId] = this.webRtcInterfaceImpl;
        (window as any).webRtcInterfaceToNativeHandler = windowBinder;
        console.log("... and binded to window", (window as any).webRtcInterfaceToNativeHandler[bindingId]);
        // this.webRtcInterfacePtr = await this.newWebRtcInterface(connectionPtr);
    }

    // protected async newWebRtcInterface(connectionPtr: number): Promise<number> {
    //     return this.runAsync<number>((taskId) => this.api.lib.StreamApi_newWebRtcInterface(taskId, connectionPtr));
    // }

    // protected async deleteWebRtcInterface(ptr: number): Promise<void> {
    //     await this.runAsync<void>((taskId)=>this.api.lib.StreamApi_deleteWebRtcInterface(taskId, ptr));
    // }
}
