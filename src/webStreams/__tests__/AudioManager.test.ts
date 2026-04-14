import { AudioManager } from "../AudioManager";
import { LocalAudioLevelMeter } from "../audio/LocalAudioLevelMeter";

// ---- minimal browser-API stubs needed by AudioManager ----

class FakeAudioWorkletNode {
    port = { onmessage: null as ((ev: MessageEvent) => void) | null };
    connect() {}
    disconnect() {}
}

class FakeGainNode {
    gain = { value: 1 };
    connect() {}
    disconnect() {}
}

class FakeMediaStreamAudioSourceNode {
    connect() {}
    disconnect() {}
}

class FakeAudioContext {
    destination = {};
    audioWorklet = {
        addModule: jest.fn().mockResolvedValue(undefined),
    };
    resume = jest.fn().mockResolvedValue(undefined);
    close = jest.fn();
    createGain() {
        return new FakeGainNode();
    }
    createMediaStreamSource() {
        return new FakeMediaStreamAudioSourceNode();
    }
}

interface BrowserGlobals {
    AudioContext: typeof FakeAudioContext;
    AudioWorkletNode: typeof FakeAudioWorkletNode;
}

const g = global as unknown as BrowserGlobals;
g.AudioContext = FakeAudioContext;
g.AudioWorkletNode = FakeAudioWorkletNode;

function makeTrack(id: string, kind: "audio" | "video" = "audio"): MediaStreamTrack {
    return {
        id,
        kind,
        enabled: true,
        getSettings: () => ({}),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
    } as unknown as MediaStreamTrack;
}

describe("AudioManager", () => {
    let onRmsForWorker: jest.Mock;
    let manager: AudioManager;

    beforeEach(() => {
        onRmsForWorker = jest.fn();
        manager = new AudioManager("/assets", onRmsForWorker);
    });

    describe("setAudioLevelCallback", () => {
        it("registers the callback so onRemoteFrameRms fires it", () => {
            const cb = jest.fn();
            manager.setAudioLevelCallback(cb);
            manager.onRemoteFrameRms(42, 0.5);
            expect(cb).toHaveBeenCalledTimes(1);
            expect(cb.mock.calls[0][0]).toHaveProperty("levels");
        });

        it("does not fire the callback before it is registered", () => {
            const cb = jest.fn();
            manager.onRemoteFrameRms(1, 0.9); // no callback yet
            manager.setAudioLevelCallback(cb);
            expect(cb).not.toHaveBeenCalled();
        });
    });

    describe("onRemoteFrameRms", () => {
        it("passes RMS and publisherId to the active speaker detector", () => {
            const cb = jest.fn();
            manager.setAudioLevelCallback(cb);

            manager.onRemoteFrameRms(7, 0.8);
            const result = cb.mock.calls[0][0];
            expect(result.levels.some((s: { streamId: number }) => s.streamId === 7)).toBe(true);
        });

        it("always feeds streamId=0 (local) into the detector before the remote frame", () => {
            const cb = jest.fn();
            manager.setAudioLevelCallback(cb);
            manager.onRemoteFrameRms(5, 0.1);
            const result = cb.mock.calls[0][0];
            expect(result.levels.some((s: { streamId: number }) => s.streamId === 0)).toBe(true);
        });
    });

    describe("stopLocalAudioLevelMeter", () => {
        it("is a no-op when no meter exists for the track", () => {
            const track = makeTrack("no-such-meter");
            expect(() => manager.stopLocalAudioLevelMeter(track)).not.toThrow();
        });
    });

    describe("ensureLocalAudioLevelMeter", () => {
        it("does not add a second meter for the same track", async () => {
            const initSpy = jest
                .spyOn(LocalAudioLevelMeter.prototype, "init")
                .mockResolvedValue(undefined);

            const track = makeTrack("track-1");
            await manager.ensureLocalAudioLevelMeter(track);
            await manager.ensureLocalAudioLevelMeter(track); // second call — same track

            expect(initSpy).toHaveBeenCalledTimes(1);
            initSpy.mockRestore();
        });

        it("removes the meter if init throws and allows retry", async () => {
            const initSpy = jest
                .spyOn(LocalAudioLevelMeter.prototype, "init")
                .mockRejectedValue(new Error("worklet load failed"));
            const stopSpy = jest
                .spyOn(LocalAudioLevelMeter.prototype, "stop")
                .mockReturnValue(undefined);

            const track = makeTrack("track-err");
            await expect(manager.ensureLocalAudioLevelMeter(track)).rejects.toThrow(
                "worklet load failed",
            );

            initSpy.mockResolvedValue(undefined);
            await expect(manager.ensureLocalAudioLevelMeter(track)).resolves.not.toThrow();
            expect(initSpy).toHaveBeenCalledTimes(2);

            initSpy.mockRestore();
            stopSpy.mockRestore();
        });

        it("forwards enabled-track RMS to onRmsForWorker", async () => {
            let capturedOnLevel: ((rms: number) => void) | undefined;

            const initSpy = jest
                .spyOn(LocalAudioLevelMeter.prototype, "init")
                .mockImplementation(async function (this: LocalAudioLevelMeter) {
                    capturedOnLevel = this.onLevel;
                });

            const track = makeTrack("track-rms");
            await manager.ensureLocalAudioLevelMeter(track);

            capturedOnLevel!(0.75);
            expect(onRmsForWorker).toHaveBeenCalledWith(0.75);
            initSpy.mockRestore();
        });

        it("reports silence to worker when track is disabled", async () => {
            let capturedOnLevel: ((rms: number) => void) | undefined;

            const initSpy = jest
                .spyOn(LocalAudioLevelMeter.prototype, "init")
                .mockImplementation(async function (this: LocalAudioLevelMeter) {
                    capturedOnLevel = this.onLevel;
                });

            const track = makeTrack("track-muted");
            Object.defineProperty(track, "enabled", { value: false, writable: false });
            await manager.ensureLocalAudioLevelMeter(track);

            capturedOnLevel!(0.9);
            expect(onRmsForWorker).toHaveBeenCalledWith(LocalAudioLevelMeter.RMS_VALUE_OF_SILENCE);
            initSpy.mockRestore();
        });
    });

    describe("stopLocalAudioLevelMeter (after adding)", () => {
        it("calls stop() on the meter and allows re-adding the same track", async () => {
            const stopSpy = jest
                .spyOn(LocalAudioLevelMeter.prototype, "stop")
                .mockReturnValue(undefined);
            jest.spyOn(LocalAudioLevelMeter.prototype, "init").mockResolvedValue(undefined);

            const track = makeTrack("track-stop");
            await manager.ensureLocalAudioLevelMeter(track);
            manager.stopLocalAudioLevelMeter(track);
            expect(stopSpy).toHaveBeenCalledTimes(1);

            await manager.ensureLocalAudioLevelMeter(track);
            expect(stopSpy).toHaveBeenCalledTimes(1); // stop not called again on re-add

            stopSpy.mockRestore();
        });
    });
});
