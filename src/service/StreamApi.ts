import {
    AudioLevelsStats,
    ActiveSpeakerDetectorConfig,
    WebRtcClient,
} from "../webStreams/WebRtcClient.js";
import {
    Stream,
    StreamCreateMeta,
    StreamHandle,
    StreamRoomId,
    StreamTrack,
    StreamTrackId,
    StreamTrackInit,
    SubscriberStreamHandle,
} from "../webStreams/types/ApiTypes.js";
import { BaseApi } from "./BaseApi.js";
import {
    ContainerPolicy,
    PagingList,
    PagingQuery,
    StreamInfo,
    StreamEventSelectorType,
    StreamEventType,
    StreamRoom,
    UserWithPubKey,
    StreamSubscription,
    StreamSubscriber,
    StreamPublishResult,
    RemoteStreamListener,
} from "../Types.js";
import { StreamApiNative } from "../native/StreamApiNative.js";

/**
 * Real-time WebRTC streaming API: manages Stream Rooms (audio/video/data
 * containers shared by a fixed set of users within a Context) and the
 * end-to-end encrypted media and data channels inside them. A Stream Room is
 * an encrypted container like a Thread or Store - a 256-bit room key is
 * generated client-side and distributed to members encrypted with their public
 * keys (ECIES), so the Bridge server only ever stores ciphertext (plus the
 * deliberately public `publicMeta`).
 *
 * Media flows over WebRTC peer connections negotiated via the Bridge through a
 * Janus media server (TURN credentials are fetched per publish/subscribe);
 * every media frame is encrypted and decrypted with AES-256-GCM inside a
 * dedicated E2EE Web Worker wired into the `RTCRtpSender`/`RTCRtpReceiver`
 * pipelines, and the unencrypted frame header is used as additional
 * authenticated data. Data-channel messages are likewise AES-256-GCM encrypted
 * into a sequenced wire frame. Stream keys (AES-256-GCM, 32 bytes) are
 * distributed over the encrypted Event channel and synchronized between the
 * main-thread key store and the worker.
 *
 * Obtain an instance via {@link EndpointFactory.createStreamApi}; do not
 * construct it directly.
 *
 * ## Workflows
 * Publish: {@link createStreamRoom} (or an existing room) →
 * {@link joinStreamRoom} → {@link createStream} → {@link addStreamTrack}
 * (per track) → {@link publishStream} → {@link updateStream} (after staging
 * more track changes) → {@link unpublishStream} → {@link leaveStreamRoom}.
 *
 * Receive: {@link joinStreamRoom} → {@link createSubscriberStream} →
 * {@link addRemoteStreamListener} (remote tracks arrive via the callback) →
 * {@link updateSubscriberStream} / {@link removeSubscriberStream}.
 *
 * Data channel: {@link addStreamTrack} (with a data channel) →
 * {@link publishStream} → {@link sendData}.
 *
 * Events: {@link buildSubscriptionQuery} → {@link subscribeFor} → consume via
 * `EndpointFactory.getEventQueue()` → {@link unsubscribeFrom}.
 *
 * All methods reject with `NativeError` on server/crypto errors and throw
 * `Error` when the underlying connection has been closed.
 */
export class StreamApi extends BaseApi {
    /**
     * Created by {@link EndpointFactory.createStreamApi} - never
     * constructed by SDK users.
     * @internal
     */
    constructor(
        private native: StreamApiNative,
        ptr: number,
        private client: WebRtcClient,
    ) {
        super(ptr);
    }

    private streams: Map<StreamHandle, Stream> = new Map();
    private streamTracks: Map<StreamTrackId, StreamTrack> = new Map();
    private subscriberStreams: Map<SubscriberStreamHandle, StreamRoomId> = new Map();

    public override destroyRefs(): void {
        this.client.destroy();
        super.destroyRefs();
    }

    /**
     * Creates a new Stream Room in the given Context and returns the new Stream
     * Room's ID.
     *
     * A random 256-bit room key is generated client-side and encrypted
     * separately for each listed user with ECIES using their public key - the
     * server stores only the encrypted per-user key entries and cannot read the
     * key. `privateMeta` is encrypted client-side with the room key;
     * `publicMeta` is stored unencrypted on the server.
     *
     * Entry point of the publish/receive workflows: follow with
     * {@link joinStreamRoom} before creating or subscribing to streams. Adjust
     * members or metadata later with {@link updateStreamRoom}.
     *
     * @param {string} contextId ID of the Context to create the Stream Room in,
     *   from `Context.contextId` via `Connection.listContexts`
     * @param {UserWithPubKey[]} users members allowed to access the Stream
     *   Room; build the entries from `Connection.listContextUsers`
     * @param {UserWithPubKey[]} managers members who can additionally update or
     *   delete the Stream Room; build the entries from
     *   `Connection.listContextUsers`
     * @param {Uint8Array} publicMeta metadata stored unencrypted on the server
     *   - readable by the Bridge, so never place secrets here
     * @param {Uint8Array} privateMeta metadata encrypted client-side with the
     *   room key; only Stream Room members can decrypt it
     * @param {ContainerPolicy} policies fine-grained access rules overriding the
     *   Context defaults; pass `undefined` to use the defaults
     * @param {number} emptyRoomTtl grace period (ms) the room stays open after
     *   the last participant leaves before being closed; `0` closes it
     *   immediately, and `undefined` uses the server default
     * @returns {string} ID of the new Stream Room - pass to
     *   {@link joinStreamRoom}, {@link getStreamRoom} or {@link updateStreamRoom}
     */
    public async createStreamRoom(
        contextId: string,
        users: UserWithPubKey[],
        managers: UserWithPubKey[],
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        policies?: ContainerPolicy,
    ): Promise<string> {
        return this.native.createStreamRoom(this.servicePtr, [
            contextId,
            users,
            managers,
            publicMeta,
            privateMeta,
            policies,
            emptyRoomTtl,
        ]);
    }

    /**
     * Replaces the member lists, metadata and (optionally) the encryption key
     * of an existing Stream Room.
     *
     * The room key list is re-encrypted for the new user set (ECIES on each
     * user's public key). With `forceGenerateNewKey` a fresh room key is
     * generated and redistributed, so removed users cannot decrypt media or
     * data sent after the update.
     *
     * The update is a full replacement, not a diff - fetch the current state
     * with {@link getStreamRoom}, modify it, and pass the Stream Room's
     * `version` back so concurrent modifications are detected. Set
     * `forceGenerateNewKey` whenever you remove users.
     *
     * @param {string} streamRoomId ID of the Stream Room to update, returned by
     *   {@link createStreamRoom} or from `StreamRoom.streamRoomId` in
     *   {@link listStreamRooms}
     * @param {UserWithPubKey[]} users full replacement list of members allowed
     *   to access the Stream Room; users missing from this list lose access
     * @param {UserWithPubKey[]} managers full replacement list of members with
     *   management rights (update / delete the Stream Room)
     * @param {Uint8Array} publicMeta new metadata stored unencrypted on the
     *   server - never place secrets here
     * @param {Uint8Array} privateMeta new metadata encrypted client-side with
     *   the room key
     * @param {number} version current Stream Room version, from
     *   `StreamRoom.version` returned by {@link getStreamRoom} - lets the server
     *   reject stale updates
     * @param {boolean} force `true` skips the `version` check and overwrites any
     *   concurrent modification
     * @param {boolean} forceGenerateNewKey when `true`, a fresh room key is
     *   generated and redistributed, so users removed by this update cannot
     *   decrypt media or data sent afterwards - set it whenever you revoke access
     * @param {ContainerPolicy} policies new access policies; pass `undefined` to
     *   keep the current ones
     * @returns {Promise<void>} resolves when the Stream Room membership and metadata have been replaced
     */
    public async updateStreamRoom(
        streamRoomId: string,
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
     * Lists the Stream Rooms of a Context that the user is a member of, one
     * page at a time.
     *
     * Downloads the Stream Room records from the Bridge and decrypts each
     * `privateMeta` client-side with the corresponding room key.
     *
     * Typically the first StreamApi call after connecting - pick a Stream Room
     * from the result and enter it with {@link joinStreamRoom}.
     *
     * @param {string} contextId ID of the Context to enumerate, from
     *   `Context.contextId` via `Connection.listContexts`
     * @param {PagingQuery} query pagination and sorting; start with
     *   `{ skip: 0, limit: 100, sortOrder: "desc" }` and page using `skip`
     *   or `lastId`
     * @returns {PagingList<StreamRoom>} one page of Stream Rooms plus
     *   `totalAvailable`; use `StreamRoom.streamRoomId` with
     *   {@link joinStreamRoom} or {@link getStreamRoom}
     */
    public async listStreamRooms(
        contextId: string,
        query: PagingQuery,
    ): Promise<PagingList<StreamRoom>> {
        return this.native.listStreamRooms(this.servicePtr, [contextId, query]);
    }

    /**
     * Joins a Stream Room so this connection can publish or receive its
     * streams.
     *
     * Establishes the room's encrypted Event channel over the Bridge, through
     * which the room key and per-stream keys are synchronized to this client.
     *
     * Required before {@link createStream} / {@link publishStream} on the
     * publish path and before {@link createSubscriberStream} on the receive
     * path; leave the room with {@link leaveStreamRoom}.
     *
     * @param {string} streamRoomId ID of the Stream Room to join, returned by
     *   {@link createStreamRoom} or from `StreamRoom.streamRoomId` in
     *   {@link listStreamRooms}
     * @returns {Promise<void>} resolves when the encrypted Event channel for the room has been established
     */
    public async joinStreamRoom(streamRoomId: string): Promise<void> {
        return this.native.joinStreamRoom(this.servicePtr, [streamRoomId]);
    }

    /**
     * Leaves a Stream Room, tearing down this connection's membership of its
     * Event channel.
     *
     * The client stops receiving the room's key updates and events; any
     * published streams should be stopped first with {@link unpublishStream}.
     *
     * Last step of the publish workflow after {@link unpublishStream}; rejoin
     * later with {@link joinStreamRoom}.
     *
     * @param {string} streamRoomId ID of the Stream Room to leave, returned by
     *   {@link createStreamRoom} or from `StreamRoom.streamRoomId` in
     *   {@link listStreamRooms}
     * @returns {Promise<void>} resolves when the room's Event channel has been torn down
     */
    public async leaveStreamRoom(streamRoomId: string): Promise<void> {
        return this.native.leaveStreamRoom(this.servicePtr, [streamRoomId]);
    }

    /**
     * Fetches a single Stream Room with its metadata, member lists and version.
     *
     * Downloads the Stream Room record from the Bridge and decrypts
     * `privateMeta` client-side with the user's copy of the room key;
     * `publicMeta` arrives as stored, unencrypted.
     *
     * Use it to display Stream Room details or to obtain the current `version`
     * required by {@link updateStreamRoom}.
     *
     * @param {string} streamRoomId ID of the Stream Room to fetch, returned by
     *   {@link createStreamRoom} or from `StreamRoom.streamRoomId` in
     *   {@link listStreamRooms}
     * @returns {StreamRoom} decrypted Stream Room data - `version` feeds
     *   {@link updateStreamRoom}; `streamRoomId` feeds {@link joinStreamRoom}
     */
    public async getStreamRoom(streamRoomId: string): Promise<StreamRoom> {
        return this.native.getStreamRoom(this.servicePtr, [streamRoomId]);
    }

    /**
     * Permanently deletes a Stream Room together with its encrypted key
     * entries.
     *
     * The server removes the Stream Room record and its encrypted per-user key
     * entries - there is no undo.
     *
     * Requires management rights to the Stream Room (see the `managers` list of
     * {@link createStreamRoom} / {@link updateStreamRoom}). To merely revoke
     * access, keep the room and remove users with {@link updateStreamRoom}
     * instead.
     *
     * @param {string} streamRoomId ID of the Stream Room to delete, returned by
     *   {@link createStreamRoom} or from `StreamRoom.streamRoomId` in
     *   {@link listStreamRooms}
     * @returns {Promise<void>} resolves when the Stream Room has been deleted from the server
     */
    public async deleteStreamRoom(streamRoomId: string): Promise<void> {
        return this.native.deleteStreamRoom(this.servicePtr, [streamRoomId]);
    }

    /**
     * Creates a local Stream handle for publishing media or data in the given
     * Stream Room and returns the handle.
     *
     * Only a local, in-memory Stream entry is created - nothing reaches the
     * server or peers yet. Stage tracks with {@link addStreamTrack} /
     * {@link removeStreamTrack}, then push the changes with
     * {@link publishStream} / {@link updateStream}.
     *
     * Follows {@link joinStreamRoom} on the publish path; next call
     * {@link addStreamTrack} per track and finally {@link publishStream}.
     *
     * @param {string} streamRoomId ID of the Stream Room to create the stream
     *   in, returned by {@link createStreamRoom} or from
     *   `StreamRoom.streamRoomId` in {@link listStreamRooms}
     * @returns {number} local stream handle consumed by
     *   {@link addStreamTrack}, {@link publishStream} and
     *   {@link unpublishStream}
     */
    public async createStream(streamRoomId: string): Promise<number> {
        const meta: StreamCreateMeta = {};
        const handle = await this.native.createStream(this.servicePtr, [streamRoomId]);
        this.streams.set(handle, {
            handle,
            streamRoomId: streamRoomId as StreamRoomId,
            createStreamMeta: meta,
            remote: false,
        });
        return handle;
    }

    /**
     * Lists the streams currently published by all members in the given Stream
     * Room.
     *
     * Fetches the room's live stream roster from the Bridge - these are remote
     * streams produced by published peers, not the local handles created with
     * {@link createStream}.
     *
     * Use it to discover which remote streams exist before selecting some to
     * receive with {@link createSubscriberStream}.
     *
     * @param {string} streamRoomId ID of the Stream Room to enumerate, returned
     *   by {@link createStreamRoom} or from `StreamRoom.streamRoomId` in
     *   {@link listStreamRooms}
     * @returns {StreamInfo[]} descriptors of currently published streams; pick
     *   targets to subscribe to with {@link createSubscriberStream}
     */
    public async listStreams(streamRoomId: string): Promise<StreamInfo[]> {
        return this.native.listStreams(this.servicePtr, [streamRoomId]);
    }

    /**
     * Lists the participants of the given Stream Room, along with the stream
     * subscriptions each of them currently has and, if they are publishing,
     * the descriptor of their published stream.
     *
     * @param {string} streamRoomId ID of the Stream Room to enumerate,
     *   returned by {@link createStreamRoom} or from
     *   `StreamRoom.streamRoomId` in {@link listStreamRooms}
     * @returns {StreamSubscriber[]} descriptors of the room's participants
     */
    public async listStreamRoomParticipants(streamRoomId: string): Promise<StreamSubscriber[]> {
        return this.native.listStreamRoomParticipants(this.servicePtr, [streamRoomId]);
    }

    /**
     * Stages a media track (or data channel) on a local Stream handle and
     * returns its track ID.
     *
     * The track is recorded only in an in-memory map - it reaches the server
     * and peers, and starts being AES-256-GCM encrypted in the E2EE worker,
     * only after {@link publishStream} (or {@link updateStream} for an
     * already-published stream).
     *
     * Call once per track between {@link createStream} and
     * {@link publishStream}; pass `createDataChannel` to stage a data channel
     * whose ID is later used with {@link sendData}.
     *
     * @param {number} streamHandle local stream handle returned by
     *   {@link createStream}
     * @param {StreamTrackInit} meta track/data-channel definition - `track` is
     *   the browser `MediaStreamTrack` to publish and/or `createDataChannel`
     *   requests a data channel
     * @returns {string} track ID identifying this staged track - pass to
     *   {@link sendData} for data channels
     * @throws {Error} when the given `streamHandle` does not exist, or the same
     *   browser track is already staged on that handle
     */
    public async addStreamTrack(streamHandle: number, meta: StreamTrackInit): Promise<string> {
        const stream = this.streams.get(streamHandle as StreamHandle);
        if (!stream) {
            throw new Error("[addStreamTrack]: there is no Stream with given Id: " + streamHandle);
        }

        // If this browser track was previously staged and then marked for removal, un-remove it.
        for (const streamTrack of this.streamTracks.values()) {
            if (
                streamTrack.streamHandle !== streamHandle ||
                streamTrack.track?.id !== meta.track?.id
            ) {
                continue;
            }
            if (streamTrack.markedToRemove) {
                streamTrack.markedToRemove = undefined;
                return streamTrack.id;
            }
            throw new Error(
                "[addStreamTrack] StreamTrack with given browser's track already added.",
            );
        }

        const streamTrackId = crypto.randomUUID() as StreamTrackId;
        this.streamTracks.set(streamTrackId, {
            id: streamTrackId,
            streamHandle: streamHandle as StreamHandle,
            track: meta.track,
            dataChannelMeta: { created: meta.createDataChannel },
            published: false,
        });
        return streamTrackId;
    }

    /**
     * Marks a previously staged media track for removal from a Stream handle.
     *
     * The matching track is only flagged in the in-memory map; the removal
     * reaches peers when {@link updateStream} renegotiates the published
     * stream (or it is simply dropped before the first {@link publishStream}).
     *
     * Use it to drop a track from a stream; apply the change with
     * {@link updateStream} for an already-published stream.
     *
     * @param {number} streamHandle local stream handle returned by
     *   {@link createStream}
     * @param {StreamTrackInit} meta track definition whose `track` matches the
     *   browser `MediaStreamTrack` previously passed to {@link addStreamTrack}
     * @throws {Error} when the given `streamHandle` does not exist
     */
    public async removeStreamTrack(streamHandle: number, meta: StreamTrackInit): Promise<void> {
        if (!this.streams.has(streamHandle as StreamHandle)) {
            throw new Error(
                "[removeStreamTrack]: there is no Stream with given Id: " + streamHandle,
            );
        }
        for (const streamTrack of this.streamTracks.values()) {
            if (
                streamTrack.track?.id === meta.track?.id &&
                streamTrack.streamHandle === streamHandle
            ) {
                streamTrack.markedToRemove = true;
            }
        }
    }

    /**
     * Publishes the Stream with its currently staged tracks, making it visible
     * to other Stream Room members.
     *
     * Fetches per-publish TURN credentials, negotiates an outbound WebRTC peer
     * connection with the Bridge's Janus media server, and wires the E2EE
     * worker into the `RTCRtpSender` pipeline so every outgoing media frame is
     * AES-256-GCM encrypted (with the frame header as additional authenticated
     * data). Only tracks staged via {@link addStreamTrack} are sent.
     *
     * Core call of the publish workflow after {@link createStream} and
     * {@link addStreamTrack}; stage further track changes and apply them with
     * {@link updateStream}, stop publishing with {@link unpublishStream}, and
     * send data-channel bytes with {@link sendData}.
     *
     * @param {number} streamHandle local stream handle returned by
     *   {@link createStream}
     * @param {(state: RTCPeerConnectionState) => void} onStreamState optional
     *   callback invoked whenever the underlying `RTCPeerConnection` changes
     *   state (e.g. `connected`, `disconnected`, `failed`)
     * @returns {StreamPublishResult} result of the publish operation describing
     *   the now-live stream
     * @throws {Error} when the given `streamHandle` does not exist
     */
    public async publishStream(
        streamHandle: number,
        onStreamState?: (state: RTCPeerConnectionState) => void,
    ): Promise<StreamPublishResult> {
        const stream = this.streams.get(streamHandle as StreamHandle);
        if (!stream) {
            throw new Error("No stream defined to publish");
        }

        const mediaTracks: MediaStreamTrack[] = [];
        const dataTracks: StreamTrack[] = [];

        for (const track of this.streamTracks.values()) {
            if (track.streamHandle !== streamHandle || track.markedToRemove || track.published) {
                continue;
            }
            if (track.track) mediaTracks.push(track.track);
            if (track.dataChannelMeta.created) dataTracks.push(track);
            track.published = true;
        }

        stream.localMediaStream = mediaTracks.length > 0 ? new MediaStream(mediaTracks) : undefined;

        const turnCredentials = await this.native.getTurnCredentials(this.servicePtr, []);
        await this.client.setTurnCredentials(turnCredentials);
        await this.client.createPeerConnectionWithLocalStream(
            streamHandle as StreamHandle,
            stream.streamRoomId,
            stream.localMediaStream,
            dataTracks,
        );

        if (onStreamState) {
            this.client
                .getStreamStateChangeDispatcher()
                .addOnStateChangeListener({ streamHandle: streamHandle as StreamHandle }, (event) =>
                    onStreamState(event.state),
                );
        }

        return this.native.publishStream(this.servicePtr, [streamHandle]);
    }

    /**
     * Applies staged track additions and removals to an already-published
     * Stream.
     *
     * Refreshes the TURN credentials and renegotiates the existing WebRTC peer
     * connection, adding senders for newly staged tracks and removing the ones
     * flagged by {@link removeStreamTrack}; the E2EE worker keeps encrypting
     * outgoing frames with AES-256-GCM across the renegotiation.
     *
     * Call after staging more {@link addStreamTrack} / {@link removeStreamTrack}
     * changes on a stream already sent with {@link publishStream}.
     *
     * @param {number} streamHandle local stream handle returned by
     *   {@link createStream} and already published via {@link publishStream}
     * @returns {StreamPublishResult} result of the update operation describing
     *   the renegotiated stream
     * @throws {Error} when the given `streamHandle` does not exist
     */
    public async updateStream(streamHandle: number): Promise<StreamPublishResult> {
        const stream = this.streams.get(streamHandle as StreamHandle);
        if (!stream) {
            throw new Error("No stream defined to publish");
        }

        const tracksToAdd: MediaStreamTrack[] = [];
        const tracksToRemove: MediaStreamTrack[] = [];

        for (const track of this.streamTracks.values()) {
            if (track.streamHandle !== streamHandle || !track.track) continue;
            if (!track.published && !track.markedToRemove) tracksToAdd.push(track.track);
            if (track.markedToRemove) tracksToRemove.push(track.track);
        }

        const turnCredentials = await this.native.getTurnCredentials(this.servicePtr, []);
        await this.client.setTurnCredentials(turnCredentials);
        await this.client.updatePeerConnectionWithLocalStream(
            stream.streamRoomId,
            stream.localMediaStream,
            tracksToAdd,
            tracksToRemove,
        );
        return this.native.updateStream(this.servicePtr, [streamHandle]);
    }

    /**
     * Stops publishing the Stream and tears down its outbound peer connection.
     *
     * Notifies the Bridge to drop the stream, closes the sender
     * `RTCPeerConnection`, and discards the handle's staged tracks and state -
     * the stream stops being visible to other members.
     *
     * Follows {@link publishStream} when you are done streaming; leave the room
     * afterwards with {@link leaveStreamRoom}.
     *
     * @param {number} streamHandle local stream handle returned by
     *   {@link createStream} and published via {@link publishStream}
     * @throws {Error} when the given `streamHandle` does not exist
     */
    public async unpublishStream(streamHandle: number): Promise<void> {
        const stream = this.streams.get(streamHandle as StreamHandle);
        if (!stream) {
            throw new Error("No local stream with given id to unpublish");
        }

        for (const [id, track] of this.streamTracks) {
            if (track.streamHandle === streamHandle) this.streamTracks.delete(id);
        }

        await this.native.removeStream(this.servicePtr, [streamHandle]);
        this.client.removeSenderPeerConnectionOnUnpublish(
            stream.streamRoomId,
            stream.localMediaStream,
        );
        this.streams.delete(streamHandle as StreamHandle);
        this.client
            .getStreamStateChangeDispatcher()
            .removeOnStateChangeListener({ streamHandle: streamHandle as StreamHandle });
    }

    /**
     * Creates a subscriber stream that receives the selected remote streams
     * (and optionally specific tracks) in the Stream Room, and returns its
     * handle.
     *
     * Fetches TURN credentials and negotiates an inbound WebRTC peer connection
     * with the Janus media server for the chosen streams; incoming media frames
     * are decrypted with AES-256-GCM in the E2EE worker wired into the
     * `RTCRtpReceiver` pipeline. The returned {@link SubscriberStreamHandle}
     * identifies this subscriber stream for later
     * {@link updateSubscriberStream} / {@link removeSubscriberStream} calls.
     *
     * Entry point of the receive workflow after {@link joinStreamRoom}; register
     * a callback with {@link addRemoteStreamListener} to obtain the arriving
     * tracks, then adjust the set with {@link updateSubscriberStream} or tear it
     * down with {@link removeSubscriberStream}.
     *
     * @param {string} streamRoomId ID of the Stream Room to subscribe in,
     *   returned by {@link createStreamRoom} or from `StreamRoom.streamRoomId`
     *   in {@link listStreamRooms}
     * @param {StreamSubscription[]} subscriptions remote streams/tracks to
     *   subscribe to, selected from the descriptors returned by
     *   {@link listStreams}
     * @returns {number} handle identifying the new subscriber
     *   stream - pass it to {@link updateSubscriberStream} and
     *   {@link removeSubscriberStream}
     */
    async createSubscriberStream(
        streamRoomId: string,
        subscriptions: StreamSubscription[],
    ): Promise<number> {
        const peerCredentials = await this.native.getTurnCredentials(this.servicePtr, []);
        await this.client.setTurnCredentials(peerCredentials);
        const handle = await this.native.createSubscriberStream(this.servicePtr, [
            streamRoomId,
            subscriptions,
        ]);
        this.subscriberStreams.set(handle, streamRoomId as StreamRoomId);
        this.client.initializeSubscriberConnection(streamRoomId as StreamRoomId);
        return handle;
    }

    /**
     * Adds and removes subscriptions on an existing subscriber stream in one
     * call, without recreating it from scratch.
     *
     * Tells the Bridge to start delivering the added streams and stop the
     * removed ones over the subscriber stream's existing inbound peer
     * connection; the E2EE worker continues decrypting frames for the streams
     * that remain subscribed.
     *
     * Use it to adjust the set established by {@link createSubscriberStream}
     * (e.g. follow the active speaker); to tear the whole subscriber stream down
     * use {@link removeSubscriberStream}.
     *
     * @param {number} subscriberStreamHandle handle returned by
     *   {@link createSubscriberStream}
     * @param {StreamSubscription[]} subscriptionsToAdd remote streams/tracks to
     *   start receiving, selected from the descriptors returned by
     *   {@link listStreams}
     * @param {StreamSubscription[]} subscriptionsToRemove remote streams/tracks
     *   to stop receiving, from the set previously passed to
     *   {@link createSubscriberStream} or {@link updateSubscriberStream}
     * @returns {Promise<void>} resolves when the Bridge has applied the subscription changes
     */
    async updateSubscriberStream(
        subscriberStreamHandle: number,
        subscriptionsToAdd: StreamSubscription[],
        subscriptionsToRemove: StreamSubscription[],
    ): Promise<void> {
        return this.native.updateSubscriberStream(this.servicePtr, [
            subscriberStreamHandle,
            subscriptionsToAdd,
            subscriptionsToRemove,
        ]);
    }

    /**
     * Removes a subscriber stream, stopping delivery of all the remote streams
     * it received.
     *
     * Tells the Bridge to drop the subscriber stream; its inbound tracks end and
     * the E2EE worker stops decrypting their frames. The inbound peer connection
     * is torn down by the WebRTC layer when the last subscriber stream in the
     * room is removed.
     *
     * Use it to stop receiving streams created via
     * {@link createSubscriberStream}; to change rather than drop the set, prefer
     * {@link updateSubscriberStream}.
     *
     * @param {number} subscriberStreamHandle handle returned by
     *   {@link createSubscriberStream}
     * @returns {Promise<void>} resolves once the Bridge has stopped delivering the subscriber stream
     */
    async removeSubscriberStream(subscriberStreamHandle: number): Promise<void> {
        await this.native.removeSubscriberStream(this.servicePtr, [subscriberStreamHandle]);
        this.subscriberStreams.delete(subscriberStreamHandle as SubscriberStreamHandle);
    }

    /**
     * Registers a callback that fires when a subscribed remote track arrives in
     * the Stream Room.
     *
     * The listener is invoked from the inbound `RTCPeerConnection`'s `track`
     * event after the E2EE worker has been wired in to decrypt the stream's
     * frames; the delivered `MediaStreamTrack` already carries decrypted media.
     *
     * Register it on the receive path, normally right after
     * {@link createSubscriberStream}, so the tracks selected there surface
     * through `onRemoteStreamTrack`.
     *
     * @param {RemoteStreamListener} listener listener configuration object
     * @param {string} listener.streamRoomId ID of the Stream Room to listen in,
     *   returned by {@link createStreamRoom} or from `StreamRoom.streamRoomId`
     *   in {@link listStreamRooms}
     * @param {number} [listener.streamId] remote Stream ID from a descriptor
     *   returned by {@link listStreams}, to filter events to one stream; omit
     *   to receive tracks from all subscribed streams
     * @param {(event: RTCTrackEvent) => void} listener.onRemoteStreamTrack
     *   callback invoked for each incoming remote track, receiving the native
     *   `RTCTrackEvent`
     */
    addRemoteStreamListener(listener: RemoteStreamListener): void {
        this.client.addRemoteStreamListener(listener);
    }

    /**
     * Subscribes this connection to Stream Room events matching the given
     * subscription queries.
     *
     * Registers the subscriptions on the Bridge over the connection's event
     * channel; matching events are then pushed by the server and surface
     * through `EndpointFactory.getEventQueue()`.
     *
     * Required order: {@link buildSubscriptionQuery} (one query per
     * event-type/selector pair) → `subscribeFor(queries)` → consume events from
     * the event queue → {@link unsubscribeFrom} when no longer needed.
     *
     * @param {string[]} subscriptionQueries query strings produced by
     *   {@link buildSubscriptionQuery}; hand-written strings are not supported
     * @returns {string[]} subscription IDs, index-aligned with
     *   `subscriptionQueries` - keep them to {@link unsubscribeFrom} later
     */
    async subscribeFor(subscriptionQueries: string[]): Promise<string[]> {
        return this.native.subscribeFor(this.servicePtr, [subscriptionQueries]);
    }

    /**
     * Cancels Stream Room event subscriptions previously created on this
     * connection, so the server stops pushing the matching events.
     *
     * Subscriptions also end implicitly when the connection is closed; call
     * this only to stop receiving a subset of events while keeping the
     * connection alive.
     *
     * @param {string[]} subscriptionIds IDs returned by {@link subscribeFor};
     *   unknown IDs cause a `NativeError` rejection
     * @returns {Promise<void>} resolves when all listed event subscriptions have been cancelled
     */
    async unsubscribeFrom(subscriptionIds: string[]): Promise<void> {
        return this.native.unsubscribeFrom(this.servicePtr, [subscriptionIds]);
    }

    /**
     * Builds a subscription-query string describing one class of Stream Room
     * events (e.g. "all stream events in Stream Room X").
     *
     * The query is assembled locally by the WASM core in the server's expected
     * format - nothing is sent yet; pass the result to {@link subscribeFor} to
     * activate it.
     *
     * @param {StreamEventType} eventType which Stream Room event class to listen
     *   for (Stream Room create/update/delete, stream events, …)
     * @param {StreamEventSelectorType} selectorType what `selectorId` refers to
     *   (e.g. a whole Context or a single Stream Room), narrowing the event
     *   scope
     * @param {string} selectorId ID of the selected scope - a Stream Room ID
     *   returned by {@link createStreamRoom} or a Context ID from
     *   `Connection.listContexts`, depending on `selectorType`
     * @returns {string} query string consumed by {@link subscribeFor}
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
     * Reads the current audio-level statistics for the session's local and
     * remote audio. Your local mic is measured directly from its track (a
     * consistent reading in every browser); remote levels come from native
     * WebRTC statistics, so a remote stream is simply omitted when the browser
     * or SFU exposes no level for it.
     *
     * Pull-based, not a subscription: each call does one fresh read and
     * returns immediately. Poll it on whatever interval suits your UI (e.g.
     * every 200-500ms) to drive speaking indicators or volume meters; call it
     * once the session is established via {@link publishStream} or
     * {@link createSubscriberStream}.
     *
     * Each entry in `levels` is identified by `streamId`: **your own local
     * microphone is reported under `streamId === -1`**, and each remote
     * publisher under its own (non-negative) stream ID from {@link listStreams}.
     * A stream only appears once it has reported a level, and drops out after
     * prolonged silence - so the local entry is absent in a subscribe-only
     * session and may briefly disappear between utterances; treat a missing
     * entry as "not speaking." Per entry, `emaRms` is the smoothed level in
     * dBFS (roughly -70 when quiet up to ~0 when loud) and `activeUntil` is the
     * timestamp until which the stream counts as actively speaking (compare it
     * against `Date.now()`).
     *
     * @returns {Promise<AudioLevelsStats>} the current per-stream audio levels;
     *   `levels[i].streamId === -1` is the local microphone
     */
    async readAudioStats(): Promise<AudioLevelsStats> {
        return this.client.readAudioStats();
    }

    /**
     * Tunes the active-speaker detection used by {@link readAudioStats} -
     * pass any subset of the fields; omitted ones keep their current value.
     * Takes effect immediately, from the next {@link readAudioStats} call.
     *
     * @param {ActiveSpeakerDetectorConfig} config partial tuning overrides
     * @param {number} [config.rmsEmaAlpha] EMA smoothing factor (0..1) for the
     *   raw level itself - higher reacts to speech onset faster but is
     *   noisier; default 0.2
     * @param {number} [config.noiseEmaAlpha] EMA smoothing factor (0..1) for
     *   the adaptive background noise floor - should stay much slower than
     *   `rmsEmaAlpha`; default 0.02
     * @param {number} [config.thresholdOffset] dB above the noise floor a
     *   speaker must reach to count as "speaking" - lower is more sensitive;
     *   default 6
     * @param {number} [config.holdMs] how long (ms) a speaker stays marked
     *   active after the last frame that crossed the threshold - keep real
     *   slack over however often you call {@link readAudioStats}; default 600
     * @param {number} [config.noiseFloorMin] lower bound (dB) on the adaptive
     *   noise floor, so it can't sink to the silence value reported for tracks
     *   with no audio and leave everything reading "active"; raise it if quiet
     *   tracks still register, lower it if genuinely quiet speech is missed;
     *   default -70
     */
    configureActiveSpeakerDetector(config: Partial<ActiveSpeakerDetectorConfig>): void {
        this.client.configureActiveSpeakerDetector(config);
    }

    /**
     * Sends binary data to remote participants over a published Stream's
     * WebRTC data channel.
     *
     * The bytes are encrypted with AES-256-GCM into a wire frame
     * `[Version|SeqNum|IV|KeyIdLen|KeyId|Ciphertext+Tag]` (the header is used as
     * additional authenticated data) and sent over the data channel; the
     * sequence number strictly increases per stream for replay protection.
     *
     * Requires a data track staged with `createDataChannel` via
     * {@link addStreamTrack} and a stream already sent with
     * {@link publishStream}.
     *
     * @param {string} streamTrackId track ID returned by
     *   {@link addStreamTrack} for a data channel track
     * @param {Uint8Array} data raw bytes to deliver to remote participants
     * @throws {Error} when there is no data channel for the given
     *   `streamTrackId` (track not staged with a data channel, or not yet
     *   published)
     */
    async sendData(streamTrackId: string, data: Uint8Array): Promise<void> {
        const dataChannel = this.streamTracks.get(streamTrackId as StreamTrackId)?.dataChannelMeta
            .dataChannel;
        if (!dataChannel) {
            throw new Error(`There is no DataTrack with given streamTrackId: ${streamTrackId}`);
        }
        const frame = await this.client.encryptDataChannelData(data);
        dataChannel.send(new Uint8Array(frame));
    }
}
