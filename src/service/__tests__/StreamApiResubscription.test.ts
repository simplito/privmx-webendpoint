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
