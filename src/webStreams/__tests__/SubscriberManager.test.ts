/**
 * The media server stops feeding a subscribed Stream by taking its track away,
 * and so does our own unsubscribe. Telling the two apart is what keeps the
 * republished-stream guard in `StreamApi.updateSubscriberStream` honest: miss
 * the server's removal and the application resubscribes to a Stream which
 * delivers nothing; take our own for the server's and an ordinary resubscribe
 * is refused.
 */
import { SubscriberManager } from "../SubscriberManager.js";
import type { PeerConnectionManager } from "../PeerConnectionManager.js";
import type { E2eeTransformManager } from "../E2eeTransformManager.js";
import type { RemoteStreamListenerRegistry } from "../RemoteStreamListenerRegistry.js";
import type { AudioManager } from "../AudioManager.js";
import type { StreamRoomId } from "../types/ApiTypes.js";

const ROOM = "room-1" as StreamRoomId;
const STREAM_ID = 42;

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

type FakeStream = ReturnType<typeof fakeTarget> & { id: string };

/** The remote `MediaStream` of one publisher, identified by its Stream ID. */
function remoteStream(streamId = STREAM_ID): FakeStream {
    return { id: String(streamId), ...fakeTarget() };
}

function setup() {
    const pcm = {
        getOrCreateConnection: () => ({
            pc: { iceConnectionState: "connected", connectionState: "connected" },
        }),
    } as unknown as PeerConnectionManager;
    const e2ee = {
        setupReceiverTransform: vi.fn().mockResolvedValue(undefined),
        teardownReceiver: vi.fn().mockResolvedValue(undefined),
    } as unknown as E2eeTransformManager;
    const registry = { dispatchTrack: vi.fn() } as unknown as RemoteStreamListenerRegistry;
    const audio = {
        watchRemoteReceiver: vi.fn(),
        unwatchRemoteReceiver: vi.fn(),
    } as unknown as AudioManager;

    const manager = new SubscriberManager(pcm, e2ee, registry, audio);
    /** One remote track arriving, the way the inbound peer connection delivers it. */
    const deliver = async (stream: FakeStream, kind: "audio" | "video" = "video") =>
        manager.onRemoteTrack(ROOM, {
            receiver: {},
            streams: [stream],
            track: { kind, ...fakeTarget() },
        } as unknown as RTCTrackEvent);

    return { manager, deliver, stale: () => [...manager.getStaleStreams(ROOM)] };
}

describe("SubscriberManager remote track removal", () => {
    it("watches a remote stream once, however many of its tracks arrive", async () => {
        const { deliver } = setup();
        const stream = remoteStream();

        await deliver(stream, "audio");
        await deliver(stream, "video");
        await deliver(stream, "video");

        // Audio and video of one publisher share a MediaStream, and every
        // listener on it sees every `removetrack`.
        expect(stream.handlers["removetrack"]?.length).toBe(1);
    });

    it("marks a stream whose track the media server took away", async () => {
        const { deliver, stale } = setup();
        const stream = remoteStream();

        await deliver(stream);
        stream.fire("removetrack");

        expect(stale()).toEqual([STREAM_ID]);
    });

    it("does not take our own unsubscribe for a republish", async () => {
        const { manager, deliver, stale } = setup();
        const stream = remoteStream();

        await deliver(stream, "audio");
        await deliver(stream, "video");
        manager.expectStreamRemoval(ROOM, STREAM_ID);

        // One event per track taken away, each reaching every listener.
        stream.fire("removetrack");
        stream.fire("removetrack");

        expect(stale()).toEqual([]);
    });

    it("holds the announcement however late the events arrive", async () => {
        const { manager, deliver, stale } = setup();
        const stream = remoteStream();

        await deliver(stream);
        manager.expectStreamRemoval(ROOM, STREAM_ID);
        // Well after the call which asked for the removal returned.
        await new Promise((r) => setTimeout(r, 0));
        stream.fire("removetrack");

        expect(stale()).toEqual([]);
    });

    it("ends the announcement once a track of that stream arrives again", async () => {
        const { manager, deliver, stale } = setup();
        const stream = remoteStream();

        await deliver(stream);
        manager.expectStreamRemoval(ROOM, STREAM_ID);
        stream.fire("removetrack");

        // Subscribed anew: from here a removal is the media server's doing.
        await deliver(stream);
        stream.fire("removetrack");

        expect(stale()).toEqual([STREAM_ID]);
    });

    it("clears a stale mark when the stream starts delivering again", async () => {
        const { deliver, stale } = setup();
        const stream = remoteStream();

        await deliver(stream);
        stream.fire("removetrack");
        expect(stale()).toEqual([STREAM_ID]);

        await deliver(stream);

        expect(stale()).toEqual([]);
    });

    it("puts a stream back under watch when its removal is taken back", async () => {
        const { manager, deliver, stale } = setup();
        const stream = remoteStream();

        await deliver(stream);
        manager.expectStreamRemoval(ROOM, STREAM_ID);
        manager.forgetExpectedRemoval(ROOM, STREAM_ID);
        stream.fire("removetrack");

        expect(stale()).toEqual([STREAM_ID]);
    });

    it("keeps the rooms apart", async () => {
        const { manager, deliver, stale } = setup();
        const stream = remoteStream();

        await deliver(stream);
        manager.expectStreamRemoval("room-2" as StreamRoomId, STREAM_ID);
        stream.fire("removetrack");

        expect(stale()).toEqual([STREAM_ID]);
    });
});
