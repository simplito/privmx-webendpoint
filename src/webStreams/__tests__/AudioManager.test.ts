import { AudioManager } from "../AudioManager.js";
import {
    ActiveSpeakerDetector,
    LOCAL_PUBLISHER_ID,
    SpeakerState,
} from "../audio/ActiveSpeakerDetector.js";

function makeTrack(id: string, kind: "audio" | "video" = "audio"): MediaStreamTrack {
    return {
        id,
        kind,
        enabled: true,
        getSettings: () => ({}),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
    } as unknown as MediaStreamTrack;
}

/** A sender whose getStats() resolves with a single "media-source" report. */
function makeSenderWithLevel(track: MediaStreamTrack, audioLevel: number): RTCRtpSender {
    return {
        track,
        getStats: vi.fn().mockResolvedValue({
            forEach(cb: (stat: unknown) => void) {
                cb({ type: "media-source", kind: "audio", audioLevel });
            },
        }),
    } as unknown as RTCRtpSender;
}

/** A sender whose getStats() resolves with no usable "media-source" report. */
function makeSenderWithoutLevel(track: MediaStreamTrack): RTCRtpSender {
    return {
        track,
        getStats: vi.fn().mockResolvedValue({
            forEach() {},
        }),
    } as unknown as RTCRtpSender;
}

/** A receiver whose getSynchronizationSources() reports a single audioLevel. */
function makeReceiverWithLevel(track: MediaStreamTrack, audioLevel: number): RTCRtpReceiver {
    return {
        track,
        getSynchronizationSources: vi.fn().mockReturnValue([{ audioLevel }]),
    } as unknown as RTCRtpReceiver;
}

/** A receiver whose getSynchronizationSources() reports no usable audioLevel. */
function makeReceiverWithoutLevel(track: MediaStreamTrack): RTCRtpReceiver {
    return {
        track,
        getSynchronizationSources: vi.fn().mockReturnValue([{}]),
    } as unknown as RTCRtpReceiver;
}

function findSpeaker(
    stats: { levels: SpeakerState[] },
    streamId: number,
): SpeakerState | undefined {
    return stats.levels.find((s) => s.streamId === streamId);
}

describe("AudioManager", () => {
    let manager: AudioManager;

    beforeEach(() => {
        manager = new AudioManager();
    });

    afterEach(() => {
        manager.destroy();
    });

    describe("readAudioStats", () => {
        it("does not read from a sender until it is watched", async () => {
            const sender = makeSenderWithLevel(makeTrack("t1"), 1);

            await manager.readAudioStats();

            expect(sender.getStats).not.toHaveBeenCalled();
        });

        it("reads fresh on every call - there is no internal timer", async () => {
            const sender = makeSenderWithLevel(makeTrack("t1"), 1);
            manager.watchLocalSender(sender);

            await manager.readAudioStats();
            await manager.readAudioStats();
            await manager.readAudioStats();

            expect(sender.getStats).toHaveBeenCalledTimes(3);
        });

        it("stops reading from a sender/receiver after destroy()", async () => {
            const sender = makeSenderWithLevel(makeTrack("t1"), 1);
            manager.watchLocalSender(sender);
            manager.destroy();

            await manager.readAudioStats();

            expect(sender.getStats).not.toHaveBeenCalled();
        });
    });

    describe("local level - native getStats() path", () => {
        it("feeds the sender's media-source audioLevel into the detector under LOCAL_PUBLISHER_ID", async () => {
            manager.watchLocalSender(makeSenderWithLevel(makeTrack("t1"), 1)); // 1 -> 0 dB

            const stats = await manager.readAudioStats();

            const local = findSpeaker(stats, LOCAL_PUBLISHER_ID);
            expect(local).toBeDefined();
            expect(local!.emaRms).toBeCloseTo(0, 5);
        });

        it("converts a quieter linear level to a proportionally lower dB value", async () => {
            manager.watchLocalSender(makeSenderWithLevel(makeTrack("t1"), 0.1)); // -> -20 dB

            const stats = await manager.readAudioStats();

            expect(findSpeaker(stats, LOCAL_PUBLISHER_ID)!.emaRms).toBeCloseTo(-20, 5);
        });

        it("combines multiple local senders by taking the loudest", async () => {
            manager.watchLocalSender(makeSenderWithLevel(makeTrack("quiet"), 0.001));
            manager.watchLocalSender(makeSenderWithLevel(makeTrack("loud"), 1));

            const stats = await manager.readAudioStats();

            expect(findSpeaker(stats, LOCAL_PUBLISHER_ID)!.emaRms).toBeCloseTo(0, 5);
        });

        it("stops sampling a sender after unwatchLocalSender", async () => {
            const track = makeTrack("t1");
            const sender = makeSenderWithLevel(track, 1);
            manager.watchLocalSender(sender);
            manager.unwatchLocalSender(track);

            await manager.readAudioStats();

            expect(sender.getStats).not.toHaveBeenCalled();
        });

        it("stays inactive when getStats() has no media-source level (no fallback)", async () => {
            manager.watchLocalSender(makeSenderWithoutLevel(makeTrack("t1")));

            const stats = await manager.readAudioStats();

            // No native level -> treated as silence -> never crosses the threshold.
            expect(findSpeaker(stats, LOCAL_PUBLISHER_ID)!.activeUntil).toBe(-Infinity);
        });
    });

    describe("remote level - native getSynchronizationSources() path", () => {
        it("feeds a receiver's audioLevel into the detector under its publisherId", async () => {
            manager.watchRemoteReceiver(7, makeReceiverWithLevel(makeTrack("r1"), 1));

            const stats = await manager.readAudioStats();

            expect(findSpeaker(stats, 7)!.emaRms).toBeCloseTo(0, 5);
        });

        it("tracks multiple remote publishers independently", async () => {
            manager.watchRemoteReceiver(10, makeReceiverWithLevel(makeTrack("r1"), 1));
            manager.watchRemoteReceiver(20, makeReceiverWithLevel(makeTrack("r2"), 0.1));

            const stats = await manager.readAudioStats();

            expect(findSpeaker(stats, 10)!.emaRms).toBeCloseTo(0, 5);
            expect(findSpeaker(stats, 20)!.emaRms).toBeCloseTo(-20, 5);
        });

        it("removes the publisher from the detector on unwatchRemoteReceiver", async () => {
            manager.watchRemoteReceiver(7, makeReceiverWithLevel(makeTrack("r1"), 1));
            await manager.readAudioStats();

            manager.unwatchRemoteReceiver(7);
            const stats = await manager.readAudioStats();

            expect(findSpeaker(stats, 7)).toBeUndefined();
        });

        it("stays inactive when getSynchronizationSources() has no level (no fallback)", async () => {
            manager.watchRemoteReceiver(3, makeReceiverWithoutLevel(makeTrack("r1")));

            const stats = await manager.readAudioStats();

            // No native level -> treated as silence -> never crosses the threshold.
            expect(findSpeaker(stats, 3)!.activeUntil).toBe(-Infinity);
        });
    });

    describe("configureActiveSpeakerDetector", () => {
        it("delegates to the active speaker detector", () => {
            const configureSpy = vi.spyOn(ActiveSpeakerDetector.prototype, "configure");
            const config = { holdMs: 1000 };

            manager.configureActiveSpeakerDetector(config);

            expect(configureSpy).toHaveBeenCalledWith(config);
            configureSpy.mockRestore();
        });
    });
});
