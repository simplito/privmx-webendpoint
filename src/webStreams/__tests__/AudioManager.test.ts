import { AudioManager } from "../AudioManager.js";
import {
    ActiveSpeakerDetector,
    LOCAL_PUBLISHER_ID,
    SpeakerState,
} from "../audio/ActiveSpeakerDetector.js";
import { TrackRmsAnalyser } from "../audio/TrackRmsAnalyser.js";

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

/** A minimal sender carrying `track` (local level comes from the analyser, not getStats). */
function makeSender(track: MediaStreamTrack): RTCRtpSender {
    return { track } as unknown as RTCRtpSender;
}

/**
 * Stubs every `TrackRmsAnalyser` so `init()` is a no-op (no real Web Audio) and
 * `readRmsDb()` returns `dbByTrackId(track.id)` - `undefined` maps to silence.
 */
function stubLocalAnalyser(dbByTrackId: (trackId: string) => number | undefined): void {
    vi.spyOn(TrackRmsAnalyser.prototype, "init").mockReturnValue(undefined);
    vi.spyOn(TrackRmsAnalyser.prototype, "readRmsDb").mockImplementation(
        function (this: TrackRmsAnalyser) {
            const trackId = (this as unknown as { track: MediaStreamTrack }).track.id;
            return dbByTrackId(trackId) ?? TrackRmsAnalyser.RMS_VALUE_OF_SILENCE;
        },
    );
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
        vi.restoreAllMocks();
    });

    describe("readAudioStats", () => {
        it("does not read a local track until its sender is watched", async () => {
            const initSpy = vi.spyOn(TrackRmsAnalyser.prototype, "init");

            const stats = await manager.readAudioStats();

            expect(initSpy).not.toHaveBeenCalled();
            expect(findSpeaker(stats, LOCAL_PUBLISHER_ID)).toBeUndefined();
        });

        it("reads fresh on every call - there is no internal timer", async () => {
            stubLocalAnalyser(() => -30);
            const readSpy = vi.spyOn(TrackRmsAnalyser.prototype, "readRmsDb");
            manager.watchLocalSender(makeSender(makeTrack("t1")));

            await manager.readAudioStats();
            await manager.readAudioStats();
            await manager.readAudioStats();

            expect(readSpy).toHaveBeenCalledTimes(3);
        });

        it("stops reading after destroy()", async () => {
            stubLocalAnalyser(() => -30);
            const readSpy = vi.spyOn(TrackRmsAnalyser.prototype, "readRmsDb");
            manager.watchLocalSender(makeSender(makeTrack("t1")));
            manager.destroy();

            const stats = await manager.readAudioStats();

            expect(readSpy).not.toHaveBeenCalled();
            expect(findSpeaker(stats, LOCAL_PUBLISHER_ID)).toBeUndefined();
        });
    });

    describe("local level - AnalyserNode (always used for local)", () => {
        it("reports the analyser's dB level under LOCAL_PUBLISHER_ID", async () => {
            stubLocalAnalyser(() => -30);
            manager.watchLocalSender(makeSender(makeTrack("t1")));

            const stats = await manager.readAudioStats();

            const local = findSpeaker(stats, LOCAL_PUBLISHER_ID);
            expect(local).toBeDefined();
            expect(local!.emaRms).toBeCloseTo(-30, 5);
        });

        it("combines multiple local tracks by taking the loudest", async () => {
            stubLocalAnalyser((id) => (id === "loud" ? 0 : -60));
            manager.watchLocalSender(makeSender(makeTrack("quiet")));
            manager.watchLocalSender(makeSender(makeTrack("loud")));

            const stats = await manager.readAudioStats();

            expect(findSpeaker(stats, LOCAL_PUBLISHER_ID)!.emaRms).toBeCloseTo(0, 5);
        });

        it("emits no local entry when the track reads silence", async () => {
            stubLocalAnalyser(() => TrackRmsAnalyser.RMS_VALUE_OF_SILENCE);
            manager.watchLocalSender(makeSender(makeTrack("t1")));

            const stats = await manager.readAudioStats();

            // Silent this tick -> the source is skipped, so no local entry appears.
            expect(findSpeaker(stats, LOCAL_PUBLISHER_ID)).toBeUndefined();
        });

        it("creates one analyser per track, lazily", async () => {
            const initSpy = vi.spyOn(TrackRmsAnalyser.prototype, "init").mockReturnValue(undefined);
            vi.spyOn(TrackRmsAnalyser.prototype, "readRmsDb").mockReturnValue(-30);
            manager.watchLocalSender(makeSender(makeTrack("t1")));

            expect(initSpy).not.toHaveBeenCalled(); // not until first read

            await manager.readAudioStats();
            await manager.readAudioStats();

            expect(initSpy).toHaveBeenCalledTimes(1); // reused on the second read
        });

        it("stops the analyser on unwatchLocalSender", async () => {
            stubLocalAnalyser(() => -30);
            const stopSpy = vi.spyOn(TrackRmsAnalyser.prototype, "stop").mockReturnValue(undefined);
            const track = makeTrack("t1");
            manager.watchLocalSender(makeSender(track));
            await manager.readAudioStats(); // creates the analyser

            manager.unwatchLocalSender(track);

            expect(stopSpy).toHaveBeenCalledTimes(1);
        });

        it("stops analysers on destroy()", async () => {
            stubLocalAnalyser(() => -30);
            const stopSpy = vi.spyOn(TrackRmsAnalyser.prototype, "stop").mockReturnValue(undefined);
            manager.watchLocalSender(makeSender(makeTrack("t1")));
            await manager.readAudioStats();

            manager.destroy();

            expect(stopSpy).toHaveBeenCalledTimes(1);
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

        it("emits no entry when getSynchronizationSources() has no level (no fallback)", async () => {
            manager.watchRemoteReceiver(3, makeReceiverWithoutLevel(makeTrack("r1")));

            const stats = await manager.readAudioStats();

            // DTX silence / no level -> the receiver is skipped, so no entry appears.
            expect(findSpeaker(stats, 3)).toBeUndefined();
        });
    });

    describe("configureActiveSpeakerDetector", () => {
        it("delegates to the active speaker detector", () => {
            const configureSpy = vi.spyOn(ActiveSpeakerDetector.prototype, "configure");
            const config = { holdMs: 1000 };

            manager.configureActiveSpeakerDetector(config);

            expect(configureSpy).toHaveBeenCalledWith(config);
        });
    });
});
