/**
 * Track bookkeeping around publishStream/updateStream: the native and WebRTC
 * layers are mocked, so what is asserted is which tracks each call hands to
 * `updatePeerConnectionWithLocalStream` - the browser throws `InvalidAccessError`
 * when a track is added to a peer connection twice.
 */
import type { Mock } from "vitest";
import { StreamApi } from "../StreamApi.js";
import type { StreamApiNative } from "../../native/StreamApiNative.js";
import type { WebRtcClient } from "../../webStreams/WebRtcClient.js";

const PTR = 42;

function makeTrack(id: string, kind: "audio" | "video" = "video"): MediaStreamTrack {
    return { id, kind } as unknown as MediaStreamTrack;
}

function setup() {
    const native = {
        createStream: vi.fn().mockResolvedValue(1),
        getTurnCredentials: vi.fn().mockResolvedValue([]),
        publishStream: vi.fn().mockResolvedValue({ published: true }),
        updateStream: vi.fn().mockResolvedValue({ published: true }),
    } as unknown as StreamApiNative;

    const client = {
        setTurnCredentials: vi.fn().mockResolvedValue(undefined),
        createPeerConnectionWithLocalStream: vi.fn().mockResolvedValue(undefined),
        updatePeerConnectionWithLocalStream: vi.fn().mockResolvedValue(undefined),
        getStreamStateChangeDispatcher: () => ({
            addOnStateChangeListener: vi.fn(),
            removeOnStateChangeListener: vi.fn(),
        }),
    } as unknown as WebRtcClient;

    const api = new StreamApi(native, PTR, client);
    return {
        api,
        native: native as unknown as Record<string, Mock>,
        client: client as unknown as Record<string, Mock>,
        addedTracks: (call: number) =>
            (client as unknown as Record<string, Mock>).updatePeerConnectionWithLocalStream.mock
                .calls[call][2],
        removedTracks: (call: number) =>
            (client as unknown as Record<string, Mock>).updatePeerConnectionWithLocalStream.mock
                .calls[call][3],
    };
}

// MediaStream is not implemented in the test environment; publishStream builds one.
beforeAll(() => {
    (globalThis as { MediaStream?: unknown }).MediaStream = class {
        constructor(public tracks: MediaStreamTrack[] = []) {}
        getTracks() {
            return this.tracks;
        }
        getAudioTracks() {
            return this.tracks.filter((t) => t.kind === "audio");
        }
    };
});

describe("StreamApi track bookkeeping", () => {
    it("adds each track to the peer connection only once across updates", async () => {
        const { api, addedTracks } = setup();
        const [a, b, c] = [makeTrack("a"), makeTrack("b"), makeTrack("c")];

        const handle = await api.createStream("room");
        await api.addStreamTrack(handle, { track: a });
        await api.publishStream(handle);

        await api.addStreamTrack(handle, { track: b });
        await api.updateStream(handle);

        await api.addStreamTrack(handle, { track: c });
        await api.updateStream(handle);

        expect(addedTracks(0)).toEqual([b]);
        // Without committing `published`, `b` would be handed over a second
        // time here and the browser would throw InvalidAccessError.
        expect(addedTracks(1)).toEqual([c]);
    });

    it("stops offering a removed track once the update went through", async () => {
        const { api, addedTracks, removedTracks } = setup();
        const [a, b] = [makeTrack("a"), makeTrack("b")];

        const handle = await api.createStream("room");
        await api.addStreamTrack(handle, { track: a });
        await api.publishStream(handle);

        await api.removeStreamTrack(handle, { track: a });
        await api.updateStream(handle);

        await api.addStreamTrack(handle, { track: b });
        await api.updateStream(handle);

        expect(removedTracks(0)).toEqual([a]);
        expect(removedTracks(1)).toEqual([]);
        expect(addedTracks(1)).toEqual([b]);
    });

    it("un-stages a track whose update failed, and takes its sender back off", async () => {
        const { api, native, addedTracks, removedTracks } = setup();
        const [a, screen, camera] = [makeTrack("a"), makeTrack("screen"), makeTrack("camera")];

        const handle = await api.createStream("room");
        await api.addStreamTrack(handle, { track: a });
        await api.publishStream(handle);

        native.updateStream.mockRejectedValueOnce(new Error("server said no"));
        await api.addStreamTrack(handle, { track: screen });
        await expect(api.updateStream(handle)).rejects.toThrow("server said no");

        // Rollback: the sender added moments earlier is removed again.
        expect(removedTracks(1)).toEqual([screen]);

        // The failed track is gone, so an unrelated update does not publish it
        // behind the application's back...
        await api.addStreamTrack(handle, { track: camera });
        await api.updateStream(handle);
        expect(addedTracks(2)).toEqual([camera]);

        // ...and the same browser track can simply be staged again.
        await expect(api.addStreamTrack(handle, { track: screen })).resolves.toBeTruthy();
    });

    it("keeps the error of a failed update even when the rollback fails too", async () => {
        const { api, native, client } = setup();
        const handle = await api.createStream("room");
        await api.addStreamTrack(handle, { track: makeTrack("a") });
        await api.publishStream(handle);

        await api.addStreamTrack(handle, { track: makeTrack("b") });
        native.updateStream.mockRejectedValueOnce(new Error("server said no"));
        client.updatePeerConnectionWithLocalStream
            .mockResolvedValueOnce(undefined) // the update itself
            .mockRejectedValueOnce(new Error("pc gone")); // the rollback

        await expect(api.updateStream(handle)).rejects.toThrow("server said no");
    });
});
