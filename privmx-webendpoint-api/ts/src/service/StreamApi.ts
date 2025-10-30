
import {Types} from "../ServerTypes";
import { Utils } from "../webStreams/Utils";
import { WebRtcClient } from "../webStreams/WebRtcClient";
import { DataChannelMeta, StreamCreateMeta, StreamId } from "../webStreams/types/ApiTypes";
import { BaseApi } from "./BaseApi";
// import { StreamApiNative } from "../api/StreamApiNative";
import { ContainerPolicy, PagingList, PagingQuery, Stream, StreamEventSelectorType, StreamEventType, StreamRoom, UserWithPubKey, StreamSettings, StreamHandle, StreamSubscription } from "../Types";
import { StreamApiNative } from "../api/StreamApiNative";



export interface StreamTrack {
    id: Types.StreamTrackId;
    streamId?: Types.StreamId;
    streamHandle: StreamHandle;
    track?: MediaStreamTrack;
    dataChannelMeta?: DataChannelMeta;
}

export class StreamApi extends BaseApi {
    constructor(private native: StreamApiNative, ptr: number, private client: WebRtcClient) {
        super(ptr);
    }

    // local data
    private streams: Map<StreamHandle, Types.Stream> = new Map();
    private streamTracks: Map<string, StreamTrack> = new Map();
    private dataChannels: Map<string, RTCDataChannel> = new Map();

    public async createStreamRoom(
        contextId: string, 
        users: UserWithPubKey[], 
        managers: UserWithPubKey[], 
        publicMeta: Uint8Array, 
        privateMeta: Uint8Array, 
        policies?: ContainerPolicy
    ): Promise<Types.StreamRoomId> {
        const res = await this.native.createStreamRoom(this.servicePtr, [contextId, users, managers, publicMeta, privateMeta, policies]);
        return res as Types.StreamRoomId;
    }

    public async updateStreamRoom(
        streamRoomId: Types.StreamRoomId, 
        users: UserWithPubKey[],
        managers: UserWithPubKey[], 
        publicMeta: Uint8Array, 
        privateMeta: Uint8Array, 
        version: number, 
        force: boolean, 
        forceGenerateNewKey: boolean, 
        policies?: ContainerPolicy
    ): Promise<void> {
        return this.native.updateStreamRoom(this.servicePtr, [streamRoomId, users, managers, publicMeta, privateMeta, version, force, forceGenerateNewKey, policies]);
    }

    public async listStreamRooms(contextId: string, query: PagingQuery): Promise<PagingList<StreamRoom>> {
        return this.native.listStreamRooms(this.servicePtr, [contextId, query]);
    }

    public async joinStreamRoom(streamRoomId: Types.StreamRoomId): Promise<void> {
        return this.native.joinStreamRoom(this.servicePtr, [streamRoomId]);
    }

    public async leaveStreamRoom(streamRoomId: Types.StreamRoomId): Promise<void> {
        return this.native.leaveStreamRoom(this.servicePtr, [streamRoomId]);
    }

    public async getStreamRoom(streamRoomId: Types.StreamRoomId): Promise<StreamRoom> {
        return this.native.getStreamRoom(this.servicePtr, [streamRoomId]);
    }

    public async deleteStreamRoom(streamRoomId: Types.StreamRoomId): Promise<void> {
        return this.native.deleteStreamRoom(this.servicePtr, [streamRoomId]);
    }

    public async createStream(streamRoomId: Types.StreamRoomId): Promise<StreamHandle> {
        const meta: StreamCreateMeta = {};
        // tutaj uzupelniajac opcjonalne pola obiektu meta mozemy ustawiac w Janusie dodatkowe rzeczy

        const handle = await this.native.createStream(this.servicePtr, [streamRoomId]);
        this.streams.set(handle, {handle, streamRoomId, createStreamMeta: meta, remote: false});
        return handle;
    }

    public async listStreams(streamRoomId: Types.StreamRoomId): Promise<Stream[]> {
        const remoteStreams = await this.native.listStreams(this.servicePtr, [streamRoomId]);
        return remoteStreams;

    }

    public async addStreamTrack(streamHandle: StreamHandle, meta: Types.StreamTrackMeta): Promise<Types.StreamTrackId> {
        //// orig
        //// tutaj byly tez wysylane dane dataChannela na serwer aplikacyjny i tam trzymane w mapie

        // const key = streamId.toString();
        // if (! this.streams.has(key)) {
        //     console.log("LOG: ", this.streams);
        //     throw new Error("[addStreamTrack]: there is no Stream with given Id: "+key);
        // }
        // for (const [key, streamTrack] of this.streamTracks.entries()) {
        //     if (streamTrack.track && streamTrack.track?.id === meta.track?.id) {
        //         throw new Error("[addStreamTrack] StreamTrack with given browser's track already added.");
        //     }
        // }
        // const stream = this.streams.get(key);
        // if (! stream) {
        //     throw new Error("Cannot find stream by id");
        // }
        
        // const streamTrackId = Utils.getRandomString(8) as Types.StreamTrackId;
        // const streamTrack: StreamTrack = {
        //     id: streamTrackId,
        //     streamId: streamId,
        //     track: meta.track,
        //     dataChannelMeta: meta.dataChannel
        // };

        // this.streamTracks.set(streamTrackId, streamTrack);

        // if (streamTrack.dataChannelMeta) {
        //     await this.client.provideSession();
        //     const request: StreamDataTrackAddRequest = {
        //         kind: "streams.streamDataTrackAdd",
        //         data: {
        //             streamRoomId: stream.streamRoomId,
        //             streamId: streamTrack.streamId,
        //             streamTrackId: streamTrack.id,
        //             meta: streamTrack.dataChannelMeta
        //         }
        //     };
            
        //     await this.serverChannel.call<StreamsApi.StreamDataTrackAddRequest, void>(request);
        // }


        if (! this.streams.has(streamHandle)) {
            console.log("LOG: ", this.streams);
            throw new Error("[addStreamTrack]: there is no Stream with given Id: "+streamHandle);
        }
        for (const [key, streamTrack] of this.streamTracks.entries()) {
            if (streamTrack.track && streamTrack.track?.id === meta.track?.id) {
                throw new Error("[addStreamTrack] StreamTrack with given browser's track already added.");
            }
        }
        const stream = this.streams.get(streamHandle);
        if (! stream) {
            throw new Error("Cannot find stream by id");
        }
        
        const streamTrackId = Utils.getRandomString(8) as Types.StreamTrackId;
        const streamTrack: StreamTrack = {
            id: streamTrackId,
            streamHandle: streamHandle,
            track: meta.track,
            dataChannelMeta: meta.dataChannel
        };

        this.streamTracks.set(streamTrackId, streamTrack);
        return streamTrackId;
    }

    public async removeStreamTrack(_streamTrackId: Types.StreamTrackId): Promise<void> {
        // await this.client.provideSession();
        // const track = Array.from(this.streamTracks.values()).find(x => x.id === streamTrackId);
        // if (!track) {
        //     throw new Error("There is no track with given id");
        // }
        // const streamKey = track?.streamId.toString();
        // const streamEntry = this.streams.get(streamKey);
        // if (! streamEntry) {
        //     throw new Error("Cannot get local stream by given id");
        // }

        // await this.client.provideSession();
        // return this.serverChannel.call<StreamsApi.StreamTrackRemoveRequest, void>({kind: "streams.streamTrackRemove", data: {
        //     streamTrackId, streamRoomId: streamEntry.streamRoomId, streamId: streamEntry.streamId
        // }});

        throw new Error("not implemented");
    }

    public async streamTrackSendData(_streamTrackId: Types.StreamTrackId, _data: Buffer): Promise<void> {
        // if (! this.dataChannels.has(streamTrackId)) {
        //     throw new Error("No data channel with given id");
        // }
        // const channel = this.dataChannels.get(streamTrackId);
        // if (!channel) {
        //     throw new Error("Cannot access data channel..");
        // }
        // channel.send(data);
                throw new Error("not implemented");
    }

    public async streamTrackRecvData(_streamTrackId: Types.StreamTrackId, _onData: (data: Buffer) => void): Promise<void> {
        // if (! this.dataChannels.has(streamTrackId)) {
        //     throw new Error("No data channel with given id");
        // }
        // const channel = this.dataChannels.get(streamTrackId);
        // if (!channel) {
        //     throw new Error("Cannot access data channel..");
        // }
        // channel.addEventListener("message", evt => {
        //     onData(evt.data);
        // })
                throw new Error("not implemented");
    }

    // PART DONE
    public async publishStream(streamHandle: StreamHandle): Promise<void> {
        // configure client
        const mediaTracks: MediaStreamTrack[] = [];
        for (const value of this.streamTracks.values()) {
            if (value.streamHandle === streamHandle && value.track) {
                mediaTracks.push(value.track);
            }
        }
        const _stream = this.streams.get(streamHandle);
        if (!_stream) {
            throw new Error("No stream defined to publish");
        }

        // // natywna obsluga datachanneli
        // let dataChannelId = -1;
        // for (const value of this.streamTracks.values()) {
        //     if (value.streamId === streamId && value.dataChannelMeta) {
        //         const channel = peerConnection.createDataChannel(value.dataChannelMeta.name, {id: (++dataChannelId)});
        //         console.log("CREATING AND SETTING UP data channel", value, channel);
        //         this.dataChannels.set(value.id, channel);
        //     }
        // }

        // await this.client.provideSession();
        // console.log("-----> call streamPublish with new offer", offer);
        // const joinResult = await this.serverChannel.call<StreamsApi.StreamPublishRequest, JoinedEvent>({kind: "streams.streamPublish", data: {
        //     streamRoomId: _stream.streamRoomId,
        //     streamId: streamId,
        //     peerConnectionOffer: offer
        // }});
        // // update local streams info
        // const streamUpdate = this.streams.get(key);
        // if (streamUpdate) {
        //     streamUpdate.remoteStreamInfo = {
        //         id: joinResult.id as unknown as StreamId
        //     }
        //     this.streams.set(key, streamUpdate);    
        // }


        // createOfferAndSetLocalDescription... jest wolane przez kod C++ 
        // const sdp = webRtcImpl.createOfferAndSetLocalDescription()

        const mediaStream = new MediaStream(mediaTracks);
        // tutaj createPeerConnectionWithLocalStream przypisuje w ostatnim kroku utworzone PeerConnection do this wiec nie trzeba go zwracac
        // const turnCredentials = await this.native.getTurnCredentials(this.servicePtr,[]);
        // console.log("peerCredentials: ", peerCredentials);
        // const overrideUrl = "turn:webrtc1.s24.simplito.com:3478";
        // const overridenCreds = peerCredentials.map(x => {
        //     return {...x, url: overrideUrl}
        // });
        // console.log("override peerCredentials url with: ", overrideUrl);
        const turnCredentials = await this.native.getTurnCredentials(this.servicePtr,[]);
        await this.client.setTurnCredentials(turnCredentials);
        await this.client.createPeerConnectionWithLocalStream(_stream.streamRoomId, mediaStream);

        return this.native.publishStream(this.servicePtr, [streamHandle]);
    }

    // PART DONE
    public async unpublishStream(streamHandle: StreamHandle): Promise<void> {
        if (!this.streams.has(streamHandle)) {
            throw new Error ("No local stream with given id to unpublish"); 
        }
        const _stream = this.streams.get(streamHandle);

        // orig
        // await this.client.provideSession();
        // const streamIdToUnpublish = _stream.remoteStreamInfo?.id;

        // // clean local stream info
        // _stream.remoteStreamInfo = undefined;
        // this.streams.set(_stream.streamId.toString(), _stream);

        // if (!streamIdToUnpublish) {
        //     throw new Error("Cannot find remote stream id to unpublish");
        // }


        // await this.serverChannel.call<StreamsApi.StreamUnpublishRequest, void>({kind: "streams.streamUnpublish", data: {
        //     streamRoomId: _stream.streamRoomId,
        //     streamId: streamIdToUnpublish
        // }});


        await this.native.unpublishStream(this.servicePtr, [streamHandle]);
        this.streams.delete(streamHandle);
    }

    // public async joinStream(streamRoomId: Types.StreamRoomId, streamsIds: StreamId[], settings: StreamSettings): Promise<number> {


    //     const peerCredentials = await this.native.getTurnCredentials(this.servicePtr,[]);
    //     await this.client.setTurnCredentials(peerCredentials);
    //     this.client.addRemoteStreamListener(streamRoomId, settings.onRemoteTrack);
    //     const localStreamId = Utils.generateNumericId() as StreamId;
    //     const res = await this.native.joinStream(this.servicePtr, [streamRoomId, streamsIds, settings.settings, localStreamId]);

    //     // TODO: to powinno sie zadziac dopiero w attached
    //     this.client.getConnectionManager().initialize(streamRoomId, "subscriber");

    //     this.streams.set(localStreamId, {streamId: res as StreamId, streamRoomId, createStreamMeta: {}, remote: true});
    //     return res;
    // }

    // public async leaveStream(streamRoomId: Types.StreamRoomId, streamsIds: StreamId[]): Promise<void> {
        
    //     // if (!this.streams.has(_streamId)) {
    //     //     throw new Error ("No stream with given id to leave");
    //     // }
    //     // const _stream = this.streams.get(_streamId);

    //     await this.native.leaveStream(this.servicePtr, [streamRoomId, streamsIds]);
    //     // this.streams.delete(_streamId);
    // }


    async subscribeToRemoteStreams(streamRoomId: Types.StreamRoomId, subscriptions: StreamSubscription[], settings: StreamSettings): Promise<void> {
        // native part
        const peerCredentials = await this.native.getTurnCredentials(this.servicePtr,[]);
        await this.client.setTurnCredentials(peerCredentials);
        this.client.addRemoteStreamListener(streamRoomId, settings.onRemoteTrack);

        // server / core part
        await this.native.subscribeToRemoteStreams(this.servicePtr, [streamRoomId, subscriptions, settings]);

        // TODO: to powinno sie zadziac dopiero w attached
        this.client.getConnectionManager().initialize(streamRoomId, "subscriber");
        // this.streams.set(localStreamId, {streamId: res as StreamId, streamRoomId, createStreamMeta: {}, remote: true});
    }

    async modifyRemoteStreamsSubscriptions(streamRoomId: Types.StreamRoomId, subscriptionsToAdd: StreamSubscription[], subscriptionsToRemove: StreamSubscription[], settings: StreamSettings): Promise<void> {
        await this.native.modifyRemoteStreamsSubscriptions(this.servicePtr, [streamRoomId, subscriptionsToAdd, subscriptionsToRemove, settings]);

    }

    async unsubscribeFromRemoteStreams(streamRoomId: Types.StreamRoomId, subscriptions: StreamSubscription[], settings: StreamSettings): Promise<void> {
        await this.native.unsubscribeFromRemoteStreams(this.servicePtr, [streamRoomId, subscriptions, settings]);
    }
    

  /**
   * Subscribe for the Thread events on the given subscription query.
   * 
   * @param {string[]} subscriptionQueries list of queries
   * @return list of subscriptionIds in maching order to subscriptionQueries
   */
    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
      return this.native.subscribeFor(this.servicePtr, [subscriptionQueries]);
    }

    /**
     * Unsubscribe from events for the given subscriptionId.
     * @param {string[]} subscriptionIds list of subscriptionId
     */
    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
      return this.native.unsubscribeFrom(this.servicePtr, [subscriptionIds]);
    }

    /**
     * Generate subscription Query for the Stream events.
     * @param {EventType} eventType type of event which you listen for
     * @param {EventSelectorType} selectorType scope on which you listen for events  
     * @param {string} selectorId ID of the selector
     */
    async buildSubscriptionQuery(eventType: StreamEventType, selectorType: StreamEventSelectorType, selectorId: string): Promise<string> {
      return this.native.buildSubscriptionQuery(this.servicePtr, [eventType, selectorType, selectorId]);
    }
}