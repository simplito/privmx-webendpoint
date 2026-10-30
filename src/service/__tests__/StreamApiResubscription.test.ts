/**
 * A Stream keeps its id when it is published again, and the media server stops
 * feeding the subscriptions made against the earlier publication. The SDK
 * refuses to add such a Stream unless the same call also removes it - mirroring
 * `StreamRequiresResubscriptionException` in the C++ core.
 */
import type { Mock } from "vitest";
import { StreamApi } from "../StreamApi.js";
import { NativeError } from "../../native/NativeError.js";
import { StreamRoomErrorCode } from "../../native/NativeErrorCodes.js";
import type { StreamApiNative } from "../../native/StreamApiNative.js";
import type { WebRtcClient } from "../../webStreams/WebRtcClient.js";
import type { StreamRoomId } from "../../webStreams/types/ApiTypes.js";
import { SubscriberManager } from "../../webStreams/SubscriberManager.js";
import type { PeerConnectionManager } from "../../webStreams/PeerConnectionManager.js";
import type { E2eeTransformManager } from "../../webStreams/E2eeTransformManager.js";
import type { RemoteStreamListenerRegistry } from "../../webStreams/RemoteStreamListenerRegistry.js";
import type { AudioManager } from "../../webStreams/AudioManager.js";

const PTR = 42;
const ROOM = "room-1";
const SUB_HANDLE = 7;

function setup() {
    const staleStreams = new Map<string, Set<number>>();

    const native = {
        getTurnCredentials: vi.fn().mockResolvedValue([]),
        createSubscriberStream: vi.fn().mockResolvedValue(SUB_HANDLE),
        updateSubscriberStream: vi.fn().mockResolvedValue(undefined),
        removeSubscriberStream: vi.fn().mockResolvedValue(undefined),
    } as unknown as StreamApiNative;

    const client = {
        setTurnCredentials: vi.fn().mockResolvedValue(undefined),
        initializeSubscriberConnection: vi.fn(),
        setSubscriberStateListener: vi.fn(),
        clearSubscriberStateListener: vi.fn(),
        getStaleStreams: (room: StreamRoomId) => staleStreams.get(room) ?? new Set<number>(),
        forgetStaleStream: (room: StreamRoomId, streamId: number) =>
            staleStreams.get(room)?.delete(streamId),
        expectStreamRemoval: vi.fn(),
        forgetExpectedRemoval: vi.fn(),
        clearStaleStreams: (room: StreamRoomId) => staleStreams.delete(room),
    } as unknown as WebRtcClient;

    return {
        api: new StreamApi(native, PTR, client),
        native: native as unknown as Record<string, Mock>,
        client: client as unknown as Record<string, Mock>,
        staleOf: (room = ROOM) => [...(staleStreams.get(room) ?? [])],
        // What the WebRTC layer records when the media server takes a
        // subscribed Stream's track away.
        markStale: (streamId: number, room = ROOM) => {
            const set = staleStreams.get(room) ?? new Set<number>();
            set.add(streamId);
            staleStreams.set(room, set);
        },
    };
}

const sub = (streamId: number) => ({ streamId, streamTrackId: "0" });

/** Registers the handle→room mapping the way the receive workflow does. */
async function subscribe(api: StreamApi, streamId = 1) {
    return api.createSubscriberStream(ROOM, [sub(streamId)]);
}

describe("StreamApi republished-stream guard", () => {
    it("refuses to add a republished stream on its own", async () => {
        const { api, native, markStale } = setup();
        const handle = await subscribe(api);
        markStale(1);

        await expect(api.updateSubscriberStream(handle, [sub(1)], [])).rejects.toBeInstanceOf(
            NativeError,
        );
        expect(native.updateSubscriberStream).not.toHaveBeenCalled();
    });

    it("reports the core's code, so applications branch the same way everywhere", async () => {
        const { api, markStale } = setup();
        const handle = await subscribe(api);
        markStale(1);

        await expect(api.updateSubscriberStream(handle, [sub(1)], [])).rejects.toMatchObject({
            code: StreamRoomErrorCode.STREAM_REQUIRES_RESUBSCRIPTION,
            name: "StreamRequiresResubscriptionException",
        });
    });

    it("accepts the same stream when the call also removes it, and stops warning about it", async () => {
        const { api, native, staleOf, markStale } = setup();
        const handle = await subscribe(api);
        markStale(1);

        await api.updateSubscriberStream(handle, [sub(1)], [sub(1)]);

        expect(native.updateSubscriberStream).toHaveBeenCalledWith(PTR, [
            handle,
            [sub(1)],
            [sub(1)],
        ]);
        expect(staleOf()).toEqual([]);
        await expect(api.updateSubscriberStream(handle, [sub(1)], [])).resolves.toBeUndefined();
    });

    it("announces its own removals, so unsubscribing is not taken for a republish", async () => {
        const { api, client } = setup();
        const handle = await subscribe(api);

        await api.updateSubscriberStream(handle, [], [sub(1)]);

        expect(client.expectStreamRemoval).toHaveBeenCalledWith(ROOM, 1);
    });

    it("allows dropping a republished stream outright", async () => {
        const { api, staleOf, markStale } = setup();
        const handle = await subscribe(api);
        markStale(1);

        await expect(api.updateSubscriberStream(handle, [], [sub(1)])).resolves.toBeUndefined();
        expect(staleOf()).toEqual([]);
    });

    it("leaves streams that were not republished alone", async () => {
        const { api, native, markStale } = setup();
        const handle = await subscribe(api);
        markStale(1);

        await api.updateSubscriberStream(handle, [sub(2)], []);

        expect(native.updateSubscriberStream).toHaveBeenCalled();
    });

    it("starts from a clean slate on a new subscriber stream", async () => {
        const { api, staleOf, markStale } = setup();
        markStale(1);

        const handle = await subscribe(api);
        expect(staleOf()).toEqual([]);
        await expect(api.updateSubscriberStream(handle, [sub(1)], [])).resolves.toBeUndefined();
    });
});

/**
 * Over the real `SubscriberManager`, because what the guard rests on is a
 * remote track going away: an unsubscribe which never happened must not pass
 * for one, or the removal that follows is read as ours and the Stream looks
 * alive while it delivers nothing.
 */
describe("StreamApi republished-stream guard over a failed update", () => {
    /** Minimal stand-in for an event target: the `node` environment has no DOM. */
    function fakeTarget() {
        const handlers: Record<string, (() => void)[]> = {};
        return {
            handlers,
            addEventListener: (type: string, fn: () => void) => {
                (handlers[type] ??= []).push(fn);
            },
            fire: (type: string) => handlers[type]?.forEach((fn) => fn()),
        };
    }

    /** The remote `MediaStream` of one publisher, identified by its Stream ID. */
    function remoteStream(streamId: number) {
        return { id: String(streamId), ...fakeTarget() };
    }

    function setupOverSubscriber() {
        const manager = new SubscriberManager(
            {
                getOrCreateConnection: () => ({
                    pc: { iceConnectionState: "connected", connectionState: "connected" },
                }),
            } as unknown as PeerConnectionManager,
            {
                setupReceiverTransform: vi.fn().mockResolvedValue(undefined),
                teardownReceiver: vi.fn().mockResolvedValue(undefined),
            } as unknown as E2eeTransformManager,
            { dispatchTrack: vi.fn() } as unknown as RemoteStreamListenerRegistry,
            {
                watchRemoteReceiver: vi.fn(),
                unwatchRemoteReceiver: vi.fn(),
            } as unknown as AudioManager,
        );
        const native = {
            getTurnCredentials: vi.fn().mockResolvedValue([]),
            createSubscriberStream: vi.fn().mockResolvedValue(SUB_HANDLE),
            updateSubscriberStream: vi.fn().mockResolvedValue(undefined),
        } as unknown as StreamApiNative;
        const client = {
            setTurnCredentials: vi.fn().mockResolvedValue(undefined),
            initializeSubscriberConnection: vi.fn(),
            setSubscriberStateListener: vi.fn(),
            clearSubscriberStateListener: vi.fn(),
            getStaleStreams: (room: StreamRoomId) => manager.getStaleStreams(room),
            forgetStaleStream: (room: StreamRoomId, id: number) =>
                manager.forgetStaleStream(room, id),
            expectStreamRemoval: (room: StreamRoomId, id: number) =>
                manager.expectStreamRemoval(room, id),
            forgetExpectedRemoval: (room: StreamRoomId, id: number) =>
                manager.forgetExpectedRemoval(room, id),
            clearStaleStreams: (room: StreamRoomId) => manager.clearStaleStreams(room),
        } as unknown as WebRtcClient;

        return {
            api: new StreamApi(native, PTR, client),
            native: native as unknown as Record<string, Mock>,
            // One remote track arriving, the way the inbound connection delivers it.
            deliver: (stream: ReturnType<typeof remoteStream>) =>
                manager.onRemoteTrack(
                    ROOM as StreamRoomId,
                    {
                        receiver: {},
                        streams: [stream],
                        track: { kind: "video", ...fakeTarget() },
                    } as unknown as RTCTrackEvent,
                ),
            staleOf: () => [...manager.getStaleStreams(ROOM as StreamRoomId)],
        };
    }

    it("goes on watching a stream whose unsubscribe failed", async () => {
        const { api, native, deliver, staleOf } = setupOverSubscriber();
        const stream = remoteStream(1);
        await deliver(stream);
        const handle = await subscribe(api);

        native.updateSubscriberStream.mockRejectedValueOnce(new Error("native boom"));
        await expect(api.updateSubscriberStream(handle, [], [sub(1)])).rejects.toThrow(
            "native boom",
        );

        // Still subscribed, and now republished by its publisher - which the
        // media server carries out by taking the track away.
        stream.fire("removetrack");
        expect(staleOf()).toEqual([1]);

        await expect(api.updateSubscriberStream(handle, [sub(1)], [])).rejects.toMatchObject({
            code: StreamRoomErrorCode.STREAM_REQUIRES_RESUBSCRIPTION,
        });
    });

    it("stops watching a stream whose unsubscribe went through", async () => {
        const { api, deliver, staleOf } = setupOverSubscriber();
        const stream = remoteStream(1);
        await deliver(stream);
        const handle = await subscribe(api);

        await api.updateSubscriberStream(handle, [], [sub(1)]);
        stream.fire("removetrack");

        expect(staleOf()).toEqual([]);
    });
});
