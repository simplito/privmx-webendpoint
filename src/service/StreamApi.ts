import { Types } from "../ServerTypes";
import * as EndpointTypes from "../Types";
import { Utils } from "../webStreams/Utils";
import { AudioLevelsStats, WebRtcClient } from "../webStreams/WebRtcClient";
import {
    DataChannelMeta,
    StreamCreateMeta,
    StreamId,
    StreamTrackId,
} from "../webStreams/types/ApiTypes";
import { BaseApi } from "./BaseApi";
// import { StreamApiNative } from "../api/StreamApiNative";
import {
    ContainerPolicy,
    PagingList,
    PagingQuery,
    StreamInfo,
    StreamEventSelectorType,
    StreamEventType,
    StreamRoom,
    UserWithPubKey,
    StreamHandle,
    StreamSubscription,
    StreamPublishResult,
    RemoteStreamListener,
} from "../Types";
import { StreamApiNative } from "../api/StreamApiNative";
import { Buffer } from "buffer";

export interface StreamTrack {
    id: Types.StreamTrackId;
    streamId?: Types.StreamId;
    streamHandle: StreamHandle;
    track?: MediaStreamTrack;
    dataChannelMeta?: DataChannelMeta;
    published: Boolean;
    markedToRemove?: boolean;
}

/**
 * `StreamApi` is a class representing Endpoint's API for Stream Rooms.
 */
export class StreamApi extends BaseApi {
    constructor(
        private native: StreamApiNative,
        ptr: number,
        private client: WebRtcClient,
    ) {
        super(ptr);
    }

    // local data
    private streams: Map<StreamHandle, Types.Stream> = new Map();
    private streamTracks: Map<string, StreamTrack> = new Map();

    /**
     * Creates a new Stream Room in given Context.
     *
     * @param {string} contextId ID of the Context to create the Stream Room in
     * @param {UserWithPubKey[]} users array of UserWithPubKey structs which indicates who will have access to the created Stream Room
     * @param {UserWithPubKey[]} managers array of UserWithPubKey structs which indicates who will have access (and management rights) to the created Stream Room
     * @param {Uint8Array} publicMeta public (unencrypted) metadata
     * @param {Uint8Array} privateMeta private (encrypted) metadata
     * @param {ContainerPolicy} policies Stream Room's policies (pass `undefined` to use defaults)
     * @returns {string} ID of the created Stream Room
     */
    public async createStreamRoom(
        contextId: string,
        users: UserWithPubKey[],
        managers: UserWithPubKey[],
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        policies?: ContainerPolicy,
    ): Promise<Types.StreamRoomId> {
        const res = await this.native.createStreamRoom(this.servicePtr, [
            contextId,
            users,
            managers,
            publicMeta,
            privateMeta,
            policies,
        ]);
        return res as Types.StreamRoomId;
    }

    /**
     * Updates an existing Stream Room.
     *
     * @param {string} streamRoomId ID of the Stream Room to update
     * @param {UserWithPubKey[]} users array of UserWithPubKey structs which indicates who will have access to the Stream Room
     * @param {UserWithPubKey[]} managers array of UserWithPubKey structs which indicates who will have access (and management rights) to the Stream Room
     * @param {Uint8Array} publicMeta public (unencrypted) metadata
     * @param {Uint8Array} privateMeta private (encrypted) metadata
     * @param {number} version current version of the updated Stream Room
     * @param {boolean} force force update (without checking version)
     * @param {boolean} forceGenerateNewKey force to regenerate a key for the Stream Room
     * @param {ContainerPolicy} policies Stream Room's policies (pass `undefined` to keep current/defaults)
     */
    public async updateStreamRoom(
        streamRoomId: Types.StreamRoomId,
        users: UserWithPubKey[],
        managers: UserWithPubKey[],
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        version: number,
        force: boolean,
        forceGenerateNewKey: boolean,
        policies?: ContainerPolicy,
    ): Promise<void> {
        return this.native.updateStreamRoom(this.servicePtr, [
            streamRoomId,
            users,
            managers,
            publicMeta,
            privateMeta,
            version,
            force,
            forceGenerateNewKey,
            policies,
        ]);
    }

    /**
     * Gets a list of Stream Rooms in given Context.
     *
     * @param {string} contextId ID of the Context to get the Stream Rooms from
     * @param {PagingQuery} query struct with list query parameters
     * @returns {PagingList<StreamRoom>} list of Stream Rooms
     */
    public async listStreamRooms(
        contextId: string,
        query: PagingQuery,
    ): Promise<PagingList<StreamRoom>> {
        return this.native.listStreamRooms(this.servicePtr, [contextId, query]);
    }

    /**
     * Joins a Stream Room.
     *
     * This is required before calling `createStream`/`publishStream` and before subscribing to remote streams
     * in the room.
     *
     * @param {string} streamRoomId ID of the Stream Room to join
     */
    public async joinStreamRoom(streamRoomId: Types.StreamRoomId): Promise<void> {
        return this.native.joinStreamRoom(this.servicePtr, [streamRoomId]);
    }

    /**
     * Leaves a Stream Room.
     *
     * @param {string} streamRoomId ID of the Stream Room to leave
     */
    public async leaveStreamRoom(streamRoomId: Types.StreamRoomId): Promise<void> {
        return this.native.leaveStreamRoom(this.servicePtr, [streamRoomId]);
    }

    /**
     * Enables server-side recording for the Stream Room.
     *
     * @param {string} streamRoomId ID of the Stream Room
     */
    public async enableStreamRoomRecording(streamRoomId: Types.StreamRoomId): Promise<void> {
        return this.native.enableStreamRoomRecording(this.servicePtr, [streamRoomId]);
    }

    /**
     * Gets encryption keys used for Stream Room recordings.
     *
     * @param {string} streamRoomId ID of the Stream Room
     * @returns {EndpointTypes.RecordingEncKey[]} list of recording encryption keys
     */
    public async getStreamRoomRecordingKeys(
        streamRoomId: Types.StreamRoomId,
    ): Promise<EndpointTypes.RecordingEncKey[]> {
        return this.native.getStreamRoomRecordingKeys(this.servicePtr, [streamRoomId]);
    }

    /**
     * Gets a single Stream Room by given Stream Room ID.
     *
     * @param {string} streamRoomId ID of the Stream Room to get
     * @returns {StreamRoom} information about the Stream Room
     */
    public async getStreamRoom(streamRoomId: Types.StreamRoomId): Promise<StreamRoom> {
        return this.native.getStreamRoom(this.servicePtr, [streamRoomId]);
    }

    /**
     * Deletes a Stream Room by given Stream Room ID.
     *
     * @param {string} streamRoomId ID of the Stream Room to delete
     */
    public async deleteStreamRoom(streamRoomId: Types.StreamRoomId): Promise<void> {
        return this.native.deleteStreamRoom(this.servicePtr, [streamRoomId]);
    }

    /**
     * Creates a local Stream handle for publishing media in given Stream Room.
     *
     * Call `addStreamTrack`/`removeStreamTrack` to stage tracks and `publishStream`/`updateStream` to send
     * changes to the server.
     *
     * @param {string} streamRoomId ID of the Stream Room to create the stream in
     * @returns {StreamHandle} handle to a local Stream instance
     */
    public async createStream(streamRoomId: Types.StreamRoomId): Promise<StreamHandle> {
        const meta: StreamCreateMeta = {};
        // tutaj uzupelniajac opcjonalne pola obiektu meta mozemy ustawiac w Janusie dodatkowe rzeczy

        const handle = await this.native.createStream(this.servicePtr, [streamRoomId]);
        this.streams.set(handle, { handle, streamRoomId, createStreamMeta: meta, remote: false });
        return handle;
    }

    /**
     * Gets a list of currently published streams in given Stream Room.
     *
     * @param {string} streamRoomId ID of the Stream Room to list streams from
     * @returns {StreamInfo[]} list of StreamInfo structs describing currently published streams
     */
    public async listStreams(streamRoomId: Types.StreamRoomId): Promise<StreamInfo[]> {
        const remoteStreams = await this.native.listStreams(this.servicePtr, [streamRoomId]);
        return remoteStreams;
    }

    /**
     * Adds a local media track or a data channel definition to a Stream handle.
     *
     * The track is staged locally and becomes visible to others after `publishStream`/`updateStream`.
     *
     * @param {StreamHandle} streamHandle handle returned by `createStream`
     * @param {Types.StreamTrackMeta} meta track/data channel metadata (track: `MediaStreamTrack`, dataChannel: `DataChannelMeta`)
     * @returns {string} StreamTrackId assigned locally for this track
     * @throws {Error} when the given `streamHandle` does not exist or the same browser track is already staged
     */
    public async addStreamTrack(
        streamHandle: StreamHandle,
        meta: Types.StreamTrackMeta,
    ): Promise<Types.StreamTrackId> {
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

        if (!this.streams.has(streamHandle)) {
            throw new Error("[addStreamTrack]: there is no Stream with given Id: " + streamHandle);
        }

        let alreadyAddedId = "";

        const tracksByHandle = Array.from(this.streamTracks.values()).filter(
            (x) => x.streamHandle === streamHandle,
        );

        for (const streamTrack of tracksByHandle) {
            if (streamTrack.track && streamTrack.track?.id === meta.track?.id) {
                if (streamTrack.markedToRemove === true) {
                    streamTrack.markedToRemove === undefined;
                    alreadyAddedId = streamTrack.id;
                    break;
                } else {
                    throw new Error(
                        "[addStreamTrack] StreamTrack with given browser's track already added.",
                    );
                }
            }
        }
        if (alreadyAddedId.length > 0) {
            return alreadyAddedId as StreamTrackId;
        }
        const stream = this.streams.get(streamHandle);
        if (!stream) {
            throw new Error("Cannot find stream by id");
        }

        const streamTrackId = Utils.getRandomString(16) as Types.StreamTrackId;
        const streamTrack: StreamTrack = {
            id: streamTrackId,
            streamHandle: streamHandle,
            track: meta.track,
            dataChannelMeta: meta.dataChannel,
            published: false,
        };
        this.streamTracks.set(streamTrackId, streamTrack);
        return streamTrackId;
    }

    /**
     * Removes a previously added media track from a Stream handle.
     *
     * For already published streams the removal is applied on `updateStream`.
     *
     * @param {StreamHandle} streamHandle handle returned by `createStream`
     * @param {Types.StreamTrackMeta} meta media track metadata previously passed to `addStreamTrack`
     * @throws {Error} when the given `streamHandle` does not exist
     */
    public async removeStreamTrack(
        streamHandle: StreamHandle,
        meta: Types.StreamTrackMeta,
    ): Promise<void> {
        if (!this.streams.has(streamHandle)) {
            throw new Error(
                "[removeStreamTrack]: there is no Stream with given Id: " + streamHandle,
            );
        }
        for (const [key, streamTrack] of this.streamTracks.entries()) {
            if (
                streamTrack.track &&
                streamTrack.track?.id === meta.track?.id &&
                streamTrack.streamHandle === streamHandle
            ) {
                streamTrack.markedToRemove = true;
            }
        }
    }

    /**
     * Sends a data message over a stream data track.
     *
     * @param {string} _streamTrackId StreamTrackId returned by `addStreamTrack`
     * @param {Buffer} _data data to send
     * @throws {Error} not implemented
     */
    public async streamTrackSendData(
        _streamTrackId: Types.StreamTrackId,
        _data: Buffer,
    ): Promise<void> {
        throw new Error("not implemented");
    }

    /**
     * Registers a data receive callback for a stream data track.
     *
     * @param {string} _streamTrackId StreamTrackId returned by `addStreamTrack`
     * @param {(data: Buffer) => void} _onData callback invoked when data is received
     * @throws {Error} not implemented
     */
    public async streamTrackRecvData(
        _streamTrackId: Types.StreamTrackId,
        _onData: (data: Buffer) => void,
    ): Promise<void> {
        throw new Error("not implemented");
    }

    /**
     * Publishes the Stream (with currently staged tracks) to the server.
     *
     * @param {StreamHandle} streamHandle handle returned by `createStream`
     * @param {(state: RTCPeerConnectionState) => void} onStreamState optional callback invoked on RTCPeerConnection state changes
     * @returns {StreamPublishResult} result of the publish operation
     * @throws {Error} when the given `streamHandle` does not exist
     */
    public async publishStream(
        streamHandle: StreamHandle,
        onStreamState?: (state: RTCPeerConnectionState) => void,
    ): Promise<StreamPublishResult> {
        const mediaTracks: MediaStreamTrack[] = [];
        for (const value of this.streamTracks.values()) {
            if (
                value.streamHandle === streamHandle &&
                value.track &&
                !value.markedToRemove &&
                value.published === false
            ) {
                mediaTracks.push(value.track);
                value.published = true;
            }
        }
        const _stream = this.streams.get(streamHandle);
        if (!_stream) {
            throw new Error("No stream defined to publish");
        }

        const mediaStream = new MediaStream(mediaTracks);
        _stream.localMediaStream = mediaStream;
        const turnCredentials = await this.native.getTurnCredentials(this.servicePtr, []);
        await this.client.setTurnCredentials(turnCredentials);
        await this.client.createPeerConnectionWithLocalStream(
            streamHandle,
            _stream.streamRoomId,
            mediaStream,
        );

        if (onStreamState && typeof onStreamState === "function") {
            this.client
                .getStreamStateChangeDispatcher()
                .addOnStateChangeListener({ streamHandle: streamHandle }, (event) =>
                    onStreamState(event.state),
                );
        }

        const res = await this.native.publishStream(this.servicePtr, [streamHandle]);
        return res;
    }

    /**
     * Updates a published Stream after adding/removing tracks.
     *
     * @param {StreamHandle} streamHandle handle returned by `createStream`
     * @returns {StreamPublishResult} result of the update operation
     * @throws {Error} when the given `streamHandle` does not exist
     */
    public async updateStream(streamHandle: StreamHandle): Promise<StreamPublishResult> {
        // configure client
        const tracksToAdd: MediaStreamTrack[] = [];
        const tracksToRemove: MediaStreamTrack[] = [];
        for (const value of this.streamTracks.values()) {
            if (value.streamHandle === streamHandle && value.track) {
                if (!value.published && !value.markedToRemove) {
                    tracksToAdd.push(value.track);
                }
                if (value.markedToRemove) {
                    tracksToRemove.push(value.track);
                }
            }
        }
        const _stream = this.streams.get(streamHandle);
        if (!_stream) {
            throw new Error("No stream defined to publish");
        }

        const turnCredentials = await this.native.getTurnCredentials(this.servicePtr, []);
        await this.client.setTurnCredentials(turnCredentials);
        await this.client.updatePeerConnectionWithLocalStream(
            _stream.streamRoomId,
            _stream.localMediaStream,
            tracksToAdd,
            tracksToRemove,
        );
        const res = await this.native.updateStream(this.servicePtr, [streamHandle]);
        return res;
    }

    private filterMapByValue<K, V>(
        map: Map<K, V>,
        predicate: (value: V, key: K) => boolean,
    ): Map<K, V> {
        const result = new Map<K, V>();

        for (const [key, value] of map) {
            if (predicate(value, key)) {
                result.set(key, value);
            }
        }

        return result;
    }

    /**
     * Stops publishing the Stream.
     *
     * @param {StreamHandle} streamHandle handle returned by `createStream`
     * @throws {Error} when the given `streamHandle` does not exist
     */
    public async unpublishStream(streamHandle: StreamHandle): Promise<void> {
        if (!this.streams.has(streamHandle)) {
            throw new Error("No local stream with given id to unpublish");
        }
        const _stream = this.streams.get(streamHandle);

        const filteredTracks = this.filterMapByValue(
            this.streamTracks,
            (x) => x.streamHandle !== streamHandle,
        );
        this.streamTracks = filteredTracks;

        await this.native.unpublishStream(this.servicePtr, [streamHandle]);
        this.client.removeSenderPeerConnectionOnUnpublish(
            _stream.streamRoomId,
            _stream.localMediaStream,
        );
        this.streams.delete(streamHandle);
        this.client.getStreamStateChangeDispatcher().removeOnStateChangeListener({ streamHandle });
    }

    /**
     * Subscribes to selected remote streams (and optionally specific tracks) in the Stream Room.
     *
     * @param {string} streamRoomId ID of the Stream Room
     * @param {EndpointTypes.StreamSubscription[]} subscriptions list of remote streams/tracks to subscribe to
     */
    async subscribeToRemoteStreams(
        streamRoomId: Types.StreamRoomId,
        subscriptions: EndpointTypes.StreamSubscription[],
    ): Promise<void> {
        // native part
        const peerCredentials = await this.native.getTurnCredentials(this.servicePtr, []);
        await this.client.setTurnCredentials(peerCredentials);

        // server / core part
        await this.native.subscribeToRemoteStreams(this.servicePtr, [streamRoomId, subscriptions]);
        this.client.getConnectionManager().initialize(streamRoomId, "subscriber");
    }

    /**
     * Modifies current remote streams subscriptions.
     *
     * @param {string} streamRoomId ID of the Stream Room
     * @param {EndpointTypes.StreamSubscription[]} subscriptionsToAdd list of subscriptions to add
     * @param {StreamSubscription[]} subscriptionsToRemove list of subscriptions to remove
     */
    async modifyRemoteStreamsSubscriptions(
        streamRoomId: Types.StreamRoomId,
        subscriptionsToAdd: EndpointTypes.StreamSubscription[],
        subscriptionsToRemove: StreamSubscription[],
    ): Promise<void> {
        await this.native.modifyRemoteStreamsSubscriptions(this.servicePtr, [
            streamRoomId,
            subscriptionsToAdd,
            subscriptionsToRemove,
        ]);
    }

    /**
     * Unsubscribes from selected remote streams (and optionally specific tracks) in the Stream Room.
     *
     * @param {string} streamRoomId ID of the Stream Room
     * @param {StreamSubscription[]} subscriptions list of subscriptions to remove
     */
    async unsubscribeFromRemoteStreams(
        streamRoomId: Types.StreamRoomId,
        subscriptions: StreamSubscription[],
    ): Promise<void> {
        await this.native.unsubscribeFromRemoteStreams(this.servicePtr, [
            streamRoomId,
            subscriptions,
        ]);
    }

    /**
     * Registers a listener for remote tracks in the Stream Room.
     *
     * @param {RemoteStreamListener} listener listener configuration
     * @param {string} listener.streamRoomId ID of the Stream Room
     * @param {number} [listener.streamId] optional remote Stream ID to filter events (omit for all streams)
     * @param {(event: RTCTrackEvent) => void} listener.onRemoteStreamTrack callback invoked for incoming remote tracks
     */
    addRemoteStreamListener(listener: RemoteStreamListener) {
        this.client.addRemoteStreamListener(listener);
    }

    /**
     * Subscribe for the Stream Room events on the given subscription query.
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
     * Generate subscription Query for the Stream Room events.
     * @param {EventType} eventType type of event which you listen for
     * @param {EventSelectorType} selectorType scope on which you listen for events
     * @param {string} selectorId ID of the selector
     */
    async buildSubscriptionQuery(
        eventType: StreamEventType,
        selectorType: StreamEventSelectorType,
        selectorId: string,
    ): Promise<string> {
        return this.native.buildSubscriptionQuery(this.servicePtr, [
            eventType,
            selectorType,
            selectorId,
        ]);
    }

    /**
     * Registers a callback for audio level statistics produced by the WebRTC client.
     *
     * @param {(stats: AudioLevelsStats) => void} onStats callback invoked with current audio levels stats
     */
    async addAudioLevelStatsListener(onStats: (stats: AudioLevelsStats) => void) {
        if (onStats && typeof onStats === "function") {
            this.client.setAudioLevelCallback(onStats);
        }
    }
}
