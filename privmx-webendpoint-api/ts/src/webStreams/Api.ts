import { JoinedEvent, VideoRoomId } from "appServer/mediaServer/MediaServerWebSocketApiTypes";
import {StreamsApi, Types} from "../ServerTypes";
import { AppServerChannel } from "./AppServerChannel";
import { Utils } from "./Utils";
import { WebRtcClient } from "./WebRtcClient";
import { EncKey, RemoteStreamListener, VideoStream } from "./WebRtcClientTypes";
import { WebRtcConfig } from "./WebRtcConfig";
import { DataChannelMeta, StreamId } from "appServer/types/ApiTypes";
import { StreamDataTrackAddRequest } from "appServer/types/StreamsApiTypes";


export interface StreamTrack {
    id: Types.StreamTrackId;
    streamId: Types.StreamId;
    track?: MediaStreamTrack;
    dataChannelMeta?: DataChannelMeta;
}

export class Api {
    private static instance: Api;
    public static async get() {
        if (!Api.instance) {
            const client = new WebRtcClient();
            const serverChannel = await client.getAppServerChannel();
            Api.instance = new Api(client, serverChannel);
        }
        return Api.instance;
    }

    // local data
    private streams: Map<string, Types.Stream> = new Map();
    private streamTracks: Map<string, StreamTrack> = new Map();
    private dataChannels: Map<string, RTCDataChannel> = new Map();
 
    constructor(private client: WebRtcClient, private serverChannel: AppServerChannel) {}

    // API
    // ============ STREAMS ===================

    public async streamRoomCreate(contextId: string, users: Types.UserWithPubKey[], managers: Types.UserWithPubKey[], privateMeta: Types.PrivateMeta, publicMeta: Types.PublicMeta): Promise<Types.StreamRoomId> {
        await this.client.provideSession();
        const res = await this.serverChannel.call<StreamsApi.StreamRoomCreateRequest, Types.StreamRoomId>({kind: "streams.streamRoomCreate", data: {
            contextId, users, managers, privateMeta, publicMeta
        }});
        return res;
    }

    public async streamRoomUpdate(streamRoomId: Types.StreamRoomId, users: Types.UserWithPubKey[], managers: Types.UserWithPubKey[], privateMeta: Types.PrivateMeta, publicMeta: Types.PublicMeta): Promise<void> {
        // wewnetrznie jest to MediaServerApi.videoRoomEdit
        await this.client.provideSession();
        return this.serverChannel.call<StreamsApi.StreamRoomUpdateRequest, void>({kind: "streams.streamRoomUpdate", data: {
            streamRoomId, users, managers, privateMeta, publicMeta
        }});
    }

    public async streamRoomList(contextId: string, query: Types.ListQuery = {skip: 0, limit: 100, order: "asc"}): Promise<Types.StreamRoomList> {
        // wewnetrznie jest to MediaServerApi.videoRoomList
        await this.client.provideSession();
        return this.serverChannel.call<StreamsApi.StreamRoomListRequest, Types.StreamRoomList>({kind: "streams.streamRoomList", data: {
            contextId, query
        }});
    }

    public async streamRoomGet(streamRoomId: Types.StreamRoomId): Promise<Types.StreamRoomInfo> {
        // wewnetrznie jest to MediaServerApi.videoRoomList[streamId]
        await this.client.provideSession();
        return this.serverChannel.call<StreamsApi.StreamRoomGetRequest, Types.StreamRoomInfo>({kind: "streams.streamRoomGet", data: {
            streamRoomId
        }});
    }

    public async streamRoomDelete(streamRoomId: Types.StreamRoomId): Promise<void> {
        // wewnetrznie jest to MediaServerApi.videoRoomDestroy
        await this.client.provideSession();
        return this.serverChannel.call<StreamsApi.StreamRoomDeleteRequest, void>({kind: "streams.streamRoomDelete", data: {
            streamRoomId
        }});
    }

    public async streamCreate(streamRoomId: Types.StreamRoomId, meta: Types.StreamCreateMeta): Promise<Types.StreamId> {
        // await this.client.provideSession();

        // return this.serverChannel.call<StreamsApi.CreateChannelGroupRequest, Types.ChannelGroupId>({kind: "streams.createChannelGroup", data: {
        //     streamId, meta: {mid: mid, description: description}
        // }});
        const streamId = Utils.generateNumericId() as StreamId;
        const key = streamId.toString();
        this.streams.set(key, {streamId, streamRoomId, createStreamMeta: meta, remote: false});
        return streamId;
    }

    public async streamUpdate(streamId: Types.StreamId, meta: Types.StreamCreateMeta): Promise<void> {
        await this.client.provideSession();
        return this.serverChannel.call<StreamsApi.StreamUpdateRequest, void>({kind: "streams.streamUpdate", data: {
            streamId, meta
        }});
    }

    public async streamList(streamRoomId: Types.StreamRoomId, query: Types.ListQuery = {skip: 0, limit: 100, order: "asc"}): Promise<Types.StreamList> {
        // todo: powinno zwracac zarowno strumienie zdalne jak i lokalne nasze
        const localStreams = Array.from(this.streams.values());
        await this.client.provideSession();
        const remoteStreams = await this.serverChannel.call<StreamsApi.StreamListRequest, Types.Stream[]>({kind: "streams.streamList", data: {
            streamRoomId, query
        }});
        return {list: [...localStreams, ...remoteStreams]};
    }

    public async streamGet(streamRoomId: Types.StreamRoomId, streamId: Types.StreamId): Promise<Types.Stream> {
        console.log("streamGet", streamRoomId,"|", streamId, " ]");
        await this.client.provideSession();
        const remoteStream = await this.serverChannel.call<StreamsApi.StreamGetRequest, Types.Stream>({kind: "streams.streamGet", data: {
            streamRoomId, streamId
        }});

        return remoteStream;
    }


    public async streamDelete(streamId: Types.StreamId): Promise<void> {
        const streamKey = streamId.toString();
        const streamEntry = this.streams.get(streamKey);
        if (! streamEntry) {
            throw new Error("There is no stream with given id");
        }
        return this.serverChannel.call<StreamsApi.StreamDeleteRequest, void>({kind: "streams.streamDelete", data: {
            streamId: streamId, streamRoomId: streamEntry?.streamRoomId
        }});
    }

    public async streamTrackAdd(streamId: Types.StreamId, meta: Types.StreamTrackMeta): Promise<Types.StreamTrackId> {
        const key = streamId.toString();
        if (! this.streams.has(key)) {
            console.log("LOG: ", this.streams);
            throw new Error("[addStreamTrack]: there is no Stream with given Id: "+key);
        }
        for (const [key, streamTrack] of this.streamTracks.entries()) {
            if (streamTrack.track && streamTrack.track?.id === meta.track?.id) {
                throw new Error("[addStreamTrack] StreamTrack with given browser's track already added.");
            }
        }
        const stream = this.streams.get(key);
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

        if (streamTrack.dataChannelMeta) {
            await this.client.provideSession();
            const request: StreamDataTrackAddRequest = {
                kind: "streams.streamDataTrackAdd",
                data: {
                    streamRoomId: stream.streamRoomId,
                    streamId: streamTrack.streamId,
                    streamTrackId: streamTrack.id,
                    meta: streamTrack.dataChannelMeta
                }
            };
            await this.serverChannel.call<StreamsApi.StreamDataTrackAddRequest, void>(request);
        }

        return streamTrackId;
    }

    public async streamTrackRemove(streamTrackId: Types.StreamTrackId): Promise<void> {
        await this.client.provideSession();
        const track = Array.from(this.streamTracks.values()).find(x => x.id === streamTrackId);
        if (!track) {
            throw new Error("There is no track with given id");
        }
        const streamKey = track?.streamId.toString();
        const streamEntry = this.streams.get(streamKey);
        if (! streamEntry) {
            throw new Error("Cannot get local stream by given id");
        }

        await this.client.provideSession();
        return this.serverChannel.call<StreamsApi.StreamTrackRemoveRequest, void>({kind: "streams.streamTrackRemove", data: {
            streamTrackId, streamRoomId: streamEntry.streamRoomId, streamId: streamEntry.streamId
        }});
    }

    public async streamTrackList(streamRoomId: Types.StreamRoomId, streamId: Types.StreamId): Promise<Types.StreamTrackList> {
        await this.client.provideSession();
        return this.serverChannel.call<StreamsApi.StreamTrackListRequest, Types.StreamTrackList>({kind: "streams.streamTrackList", data: {
            streamRoomId, streamId
        }});
    }

    public async streamTrackSendData(streamTrackId: Types.StreamTrackId, data: Buffer): Promise<void> {
        if (! this.dataChannels.has(streamTrackId)) {
            throw new Error("No data channel with given id");
        }
        const channel = this.dataChannels.get(streamTrackId);
        if (!channel) {
            throw new Error("Cannot access data channel..");
        }
        channel.send(data);
    }

    public async streamTrackRecvData(streamTrackId: Types.StreamTrackId, onData: (data: Buffer) => void): Promise<void> {
        if (! this.dataChannels.has(streamTrackId)) {
            throw new Error("No data channel with given id");
        }
        const channel = this.dataChannels.get(streamTrackId);
        if (!channel) {
            throw new Error("Cannot access data channel..");
        }
        channel.addEventListener("message", evt => {
            onData(evt.data);
        })
    }

    public async streamPublish(streamId: Types.StreamId): Promise<void> {
        // configure client
        const mediaTracks: MediaStreamTrack[] = [];
        for (const value of this.streamTracks.values()) {
            if (value.streamId === streamId && value.track) {
                mediaTracks.push(value.track);
            }
        }
        const key = streamId.toString();
        const _stream = this.streams.get(key);
        if (!_stream) {
            throw new Error("No stream defined to publish");
        }
        
        const mediaStream = new MediaStream(mediaTracks);
        
        // prepare peerConnection
        const peerConnection = await this.client.createPeerConnectionWithLocalStream(mediaStream);

        // natywna obsluga datachanneli
        let dataChannelId = -1;
        for (const value of this.streamTracks.values()) {
            if (value.streamId === streamId && value.dataChannelMeta) {
                const channel = peerConnection.createDataChannel(value.dataChannelMeta.name, {id: (++dataChannelId)});
                console.log("CREATING AND SETTING UP data channel", value, channel);
                this.dataChannels.set(value.id, channel);
            }
        }

        // get offer created and set during negotiation
        console.warn("streamPublish: generate new offer on publish, but has to be implemented in conjunction with negotiationneeded event");
        // const offer = peerConnection.currentLocalDescription?.toJSON();
        const offer = await peerConnection.createOffer();
        peerConnection.setLocalDescription(offer);

        await this.client.provideSession();
        console.log("-----> call streamPublish with new offer", offer);
        const joinResult = await this.serverChannel.call<StreamsApi.StreamPublishRequest, JoinedEvent>({kind: "streams.streamPublish", data: {
            streamRoomId: _stream.streamRoomId,
            streamId: streamId,
            peerConnectionOffer: offer
        }});
        // update local streams info
        const streamUpdate = this.streams.get(key);
        if (streamUpdate) {
            streamUpdate.remoteStreamInfo = {
                id: joinResult.id as unknown as StreamId
            }
            this.streams.set(key, streamUpdate);    
        }
    }

    public async streamUnpublish(streamId: Types.StreamId): Promise<void> {
        const key = streamId.toString();
        const _stream = this.streams.get(key);
        if (!_stream) {
            throw new Error ("No local stream with given id to unpublish");
        }

        await this.client.provideSession();
        const streamIdToUnpublish = _stream.remoteStreamInfo?.id;

        // clean local stream info
        _stream.remoteStreamInfo = undefined;
        this.streams.set(_stream.streamId.toString(), _stream);

        if (!streamIdToUnpublish) {
            throw new Error("Cannot find remote stream id to unpublish");
        }


        await this.serverChannel.call<StreamsApi.StreamUnpublishRequest, void>({kind: "streams.streamUnpublish", data: {
            streamRoomId: _stream.streamRoomId,
            streamId: streamIdToUnpublish
        }});

    }

    public async streamJoin(streamRoomId: Types.StreamRoomId, streamToJoin: Types.StreamAndTracksSelector): Promise<void> {
        await this.client.provideSession();
        return this.serverChannel.call<StreamsApi.StreamJoinRequest, void>({kind: "streams.streamJoin", data: {
            streamRoomId: streamRoomId,
            streamToJoin: streamToJoin
        }});
    }

    public async streamLeave(streamId: Types.StreamId): Promise<void> {
        const _stream = this.streams.get(streamId.toString());
        if (!_stream) {
            throw new Error ("No stream with given id to leave");
        }

        await this.client.provideSession();

        return this.serverChannel.call<StreamsApi.StreamLeaveRequest, void>({kind: "streams.streamLeave", data: {
            streamToLeave: {
                streamId: streamId,
                streamRoomId: _stream.streamRoomId
            }
        }});
    }

    public async addRemoteStreamListener(listener: RemoteStreamListener) {
        this.client.addRemoteStreamListener(listener);
    }

    public async testSetStreamEncKey(key: EncKey) {
        console.log("setting key: ", key)
        this.client.setEncKey(key.key, key.iv);
    }
}
