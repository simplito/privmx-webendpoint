
import {StreamsApi, Types} from "../ServerTypes";
import { Utils } from "../webStreams/Utils";
import { WebRtcClient } from "../webStreams/WebRtcClient";
import { EncKey, RemoteStreamListener, SessionId, VideoStream } from "../webStreams/WebRtcClientTypes";
import { WebRtcConfig } from "../webStreams/WebRtcConfig";
import { DataChannelMeta, StreamCreateMeta, StreamId } from "../webStreams/types/ApiTypes";
import { StreamDataTrackAddRequest } from "../webStreams/types/StreamsApiTypes";
import { BaseApi } from "./BaseApi";
// import { StreamApiNative } from "../api/StreamApiNative";
import { ContainerPolicy, PagingList, PagingQuery, Stream, StreamEventSelectorType, StreamEventType, StreamJoinSettings, StreamRoom, UserWithPubKey } from "../Types";
import { StreamApiNative } from "../api/StreamApiNative";
import { VideoRoomId } from "../webStreams/types/MediaServerWebSocketApiTypes";



export interface StreamTrack {
    id: Types.StreamTrackId;
    streamId: Types.StreamId;
    track?: MediaStreamTrack;
    dataChannelMeta?: DataChannelMeta;
}

export class StreamApi extends BaseApi {
    // private static instance: Api;
    // public static async get() {
    //     if (!Api.instance) {
    //         const client = new WebRtcClient();
    //         const serverChannel = await client.getAppServerChannel();
    //         Api.instance = new Api(client, serverChannel);
    //     }
    //     return Api.instance;
    // }
    // constructor(private client: WebRtcClient, private serverChannel: AppServerChannel) {}
    constructor(private native: StreamApiNative, ptr: number, private client: WebRtcClient) {
        super(ptr);
    }

    // local data
    private streams: Map<StreamId, Types.Stream> = new Map();
    private streamTracks: Map<string, StreamTrack> = new Map();
    private dataChannels: Map<string, RTCDataChannel> = new Map();
 


    // API
    // ============ STREAMS ===================

    public async createStreamRoom(
        contextId: string, 
        users: UserWithPubKey[], 
        managers: UserWithPubKey[], 
        publicMeta: Uint8Array, 
        privateMeta: Uint8Array, 
        policies?: ContainerPolicy
    ): Promise<Types.StreamRoomId> {
        // await this.client.provideSession();
        // orig
        // const res = await this.serverChannel.call<StreamsApi.StreamRoomCreateRequest, Types.StreamRoomId>({kind: "streams.streamRoomCreate", data: {
        //     contextId, users, managers, privateMeta, publicMeta
        // }});

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
        // wewnetrznie jest to MediaServerApi.videoRoomEdit
        // await this.client.provideSession();
        // orig
        // return this.serverChannel.call<StreamsApi.StreamRoomUpdateRequest, void>({kind: "streams.streamRoomUpdate", data: {
        //     streamRoomId, users, managers, privateMeta, publicMeta
        // }});
        return this.native.updateStreamRoom(this.servicePtr, [streamRoomId, users, managers, publicMeta, privateMeta, version, force, forceGenerateNewKey, policies]);
    }

    public async listStreamRooms(contextId: string, query: PagingQuery): Promise<PagingList<StreamRoom>> {
        // wewnetrznie jest to MediaServerApi.videoRoomList  - oryginalnie funkcja zwracala VideoRoomList
        // await this.client.provideSession();
        // orig
        // return this.serverChannel.call<StreamsApi.StreamRoomListRequest, Types.StreamRoomList>({kind: "streams.streamRoomList", data: {
        //     contextId, query
        // }});
        return this.native.listStreamRooms(this.servicePtr, [contextId, query]);
    }

    public async getStreamRoom(streamRoomId: Types.StreamRoomId): Promise<StreamRoom> {
        // wewnetrznie jest to MediaServerApi.videoRoomList[streamId] - oryginalnie funkcja zwracala Types.StreamRoomInfo
        // await this.client.provideSession();
        
        // orig
        // return this.serverChannel.call<StreamsApi.StreamRoomGetRequest, Types.StreamRoomInfo>({kind: "streams.streamRoomGet", data: {
        //     streamRoomId
        // }});
        return this.native.getStreamRoom(this.servicePtr, [streamRoomId]);
    }

    public async deleteStreamRoom(streamRoomId: Types.StreamRoomId): Promise<void> {
        // wewnetrznie jest to MediaServerApi.videoRoomDestroy
        // await this.client.provideSession();
        // orig
        //     return this.serverChannel.call<StreamsApi.StreamRoomDeleteRequest, void>({kind: "streams.streamRoomDelete", data: {
        //         streamRoomId
        //     }});
        return this.native.deleteStreamRoom(this.servicePtr, [streamRoomId]);
    }

    public async createStream(streamRoomId: Types.StreamRoomId): Promise<Types.StreamId> {
    // definicja do call-a do native:
    // public async createStream(streamRoomId: Types.StreamRoomId, localStreamId: Types.StreamId): Promise<Types.StreamId> {
    
        // await this.client.provideSession();
        // orig - oryginalnie ta funkcja dzialala tylko lokalnie - teraz wysyla swoje dane do C++ a tam jest call na webrtcInterface.udpdateKeys()
        // const streamId = Utils.generateNumericId() as StreamId;
        // const key = streamId.toString();
        // this.streams.set(key, {streamId, streamRoomId, createStreamMeta: meta, remote: false});
        // return streamId;

        const streamId = Utils.generateNumericId() as StreamId;
        const meta: StreamCreateMeta = {};
        // tutaj uzupelniajac opcjonalne pola obiektu meta mozemy ustawiac w Janusie dodatkowe rzeczy

        const localStreamId = await this.native.createStream(this.servicePtr, [streamRoomId, streamId]) as Types.StreamId;
        this.streams.set(localStreamId, {streamId, streamRoomId, createStreamMeta: meta, remote: false});
        return localStreamId;
    }

    // public async updateStream(streamRoomId: Types.StreamRoomId, localStreamId: Types.StreamId): Promise<Types.StreamId> {
    //     const webrtcInterfacePtr: number; // tutaj cos musimy przekazac do C++
    //     return await this.native.updateStream(this.servicePtr, [streamRoomId, localStreamId, webrtcInterfacePtr]) as Types.StreamId;
    // }

    public async listStreams(streamRoomId: Types.StreamRoomId): Promise<Stream[]> {
        // orig - oryginalnie funkcja zwracala StreamList z lista Types.Stream[]
        // // todo: powinno zwracac zarowno strumienie zdalne jak i lokalne nasze
        // const localStreams = Array.from(this.streams.values());
        // await this.client.provideSession();
        // const remoteStreams = await this.serverChannel.call<StreamsApi.StreamListRequest, Types.Stream[]>({kind: "streams.streamList", data: {
        //     streamRoomId, query
        // }});
        // return {list: [...localStreams, ...remoteStreams]};
        // const localStreams: Stream[] = Array.from(this.streams.values()).map(x => {
        //     return {streamId: x.streamId, userId: ""};
        // });
        const remoteStreams = await this.native.listStreams(this.servicePtr, [streamRoomId]);
        // return [...localStreams, ...remoteStreams];
        return remoteStreams;

    }

    public async getStream(_streamRoomId: Types.StreamRoomId, _streamId: Types.StreamId): Promise<Stream> {
        // orig - oryginalnie funkcja zwraacala Types.Stream a nastepnie mapowala streamy remote i zwracala zdalne ids
        // console.log("streamGet", streamRoomId,"|", streamId, " ]");
        // await this.client.provideSession();
        // const remoteStream = await this.serverChannel.call<StreamsApi.StreamGetRequest, Types.Stream>({kind: "streams.streamGet", data: {
        //     streamRoomId, streamId
        // }});

        // return remoteStream;
        throw new Error("not supported");
    }


    public async addStreamTrack(streamId: Types.StreamId, meta: Types.StreamTrackMeta): Promise<Types.StreamTrackId> {
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


        if (! this.streams.has(streamId)) {
            console.log("LOG: ", this.streams);
            throw new Error("[addStreamTrack]: there is no Stream with given Id: "+streamId);
        }
        for (const [key, streamTrack] of this.streamTracks.entries()) {
            if (streamTrack.track && streamTrack.track?.id === meta.track?.id) {
                throw new Error("[addStreamTrack] StreamTrack with given browser's track already added.");
            }
        }
        const stream = this.streams.get(streamId);
        if (! stream) {
            throw new Error("Cannot find stream by id");
        }
        
        const streamTrackId = Utils.getRandomString(8) as Types.StreamTrackId;
        const streamTrack: StreamTrack = {
            id: streamTrackId,
            streamId: streamId,
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

    public async listStreamTracks(_streamRoomId: Types.StreamRoomId, _streamId: Types.StreamId): Promise<Types.StreamTrackList> {
        // await this.client.provideSession();
        // return this.serverChannel.call<StreamsApi.StreamTrackListRequest, Types.StreamTrackList>({kind: "streams.streamTrackList", data: {
        //     streamRoomId, streamId
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
    public async publishStream(streamId: Types.StreamId): Promise<void> {
        // configure client
        const mediaTracks: MediaStreamTrack[] = [];
        for (const value of this.streamTracks.values()) {
            if (value.streamId === streamId && value.track) {
                mediaTracks.push(value.track);
            }
        }
        console.log(1);
        const _stream = this.streams.get(streamId);
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
        console.log(2);

        
        await this.client.createPeerConnectionWithLocalStream(_stream.streamRoomId, mediaStream);
        console.log(3);

        return this.native.publishStream(this.servicePtr, [streamId]);
    }

    // PART DONE
    public async unpublishStream(streamId: Types.StreamId): Promise<void> {
        if (!this.streams.has(streamId)) {
            throw new Error ("No local stream with given id to unpublish"); 
        }
        const _stream = this.streams.get(streamId);

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


        await this.native.unpublishStream(this.servicePtr, [streamId]);
        this.streams.delete(streamId);
    }

    // PART DONE
    // public async streamJoin(streamRoomId: Types.StreamRoomId, streamToJoin: Types.StreamAndTracksSelector): Promise<void> {
    public async joinStream(streamRoomId: Types.StreamRoomId, streamsIds: StreamId[], settings: StreamJoinSettings): Promise<number> {
        // int64_t joinStream(const std::string& streamRoomId, const std::vector<int64_t>& streamsId, const Settings& settings, int64_t localStreamId, std::shared_ptr<WebRTCInterface> webRtc);
        //// orig - ciekawe, ze nie ma operacji na connection tutaj?
        //// oryginalnie funkcja przyjmowala streamToJoin typu StreamAndTrackSelector gdzie podawany byl jeden stream i ew lista tracks jako opcja...
        // await this.client.provideSession();
        // return this.serverChannel.call<StreamsApi.StreamJoinRequest, void>({kind: "streams.streamJoin", data: {
        //     streamRoomId: streamRoomId,
        //     streamToJoin: streamToJoin
        // }});

        const peerCredentials = await this.native.getTurnCredentials(this.servicePtr,[]);
        // console.log("peerCredentials: ", peerCredentials);
        // const overrideUrl = "turn:webrtc1.s24.simplito.com:3478";
        // const overridenCreds = peerCredentials.map(x => {
        //     return {...x, url: overrideUrl}
        // });
        await this.client.setTurnCredentials(peerCredentials);
        // await this.client.createPeerConnectionOnJoin(peerCredentials);

        this.client.addRemoteStreamListener(settings.onRemoteTrack);
        const localStreamId = Utils.generateNumericId() as StreamId;
        const res = await this.native.joinStream(this.servicePtr, [streamRoomId, streamsIds, settings.settings, localStreamId]);

        // TODO: to powinno sie zadziac dopiero w attached
        this.client.getConnectionManager().initialize(streamRoomId, "publisher");

        this.streams.set(localStreamId, {streamId: res as StreamId, streamRoomId, createStreamMeta: {}, remote: true});
        return res;
    }

    public async leaveStream(_streamId: Types.StreamId): Promise<void> {
        
        if (!this.streams.has(_streamId)) {
            throw new Error ("No stream with given id to leave");
        }
        const _stream = this.streams.get(_streamId);
        // await this.client.provideSession();

        // return this.serverChannel.call<StreamsApi.StreamLeaveRequest, void>({kind: "streams.streamLeave", data: {
        //     streamToLeave: {
        //         streamId: streamId,
        //         streamRoomId: _stream.streamRoomId
        //     }
        // }});
        await this.native.leaveStream(this.servicePtr, [_stream.streamId]);
        this.streams.delete(_streamId);
    }

    // public async addRemoteStreamListener(listener: RemoteStreamListener) {
    //     this.client.addRemoteStreamListener(listener);
    // }

    // public async testSetStreamEncKey(key: EncKey) {
    //     console.log("setting key: ", key)
    //     this.client.setEncKey(key.key, key.iv);
    // }

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