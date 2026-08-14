import { TrackRmsAnalyser } from "../audio/TrackRmsAnalyser.js";

// ---- Web Audio stubs (vitest runs in the "node" environment) ----
// The fake AnalyserNode fills the buffer with a constant `amplitude`, so its
// RMS is exactly |amplitude| - handy for driving a specific dB reading.

class FakeAnalyserNode {
    fftSize = 2048;
    amplitude = 0;
    connect() {}
    disconnect() {}
    getFloatTimeDomainData(buffer: Float32Array) {
        buffer.fill(this.amplitude);
    }
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
    static instances: FakeAudioContext[] = [];
    static resumeShouldReject = false;
    destination = { _isDestination: true };
    resumeCalls = 0;
    closeCalls = 0;
    lastSource?: FakeMediaStreamAudioSourceNode;
    lastAnalyser?: FakeAnalyserNode;
    lastGain?: FakeGainNode;

    resume(): Promise<void> {
        this.resumeCalls++;
        return FakeAudioContext.resumeShouldReject
            ? Promise.reject(new Error("NotAllowedError"))
            : Promise.resolve();
    }
    close() {
        this.closeCalls++;
    }
    createMediaStreamSource() {
        this.lastSource = new FakeMediaStreamAudioSourceNode();
        return this.lastSource;
    }
    createAnalyser() {
        this.lastAnalyser = new FakeAnalyserNode();
        return this.lastAnalyser;
    }
    createGain() {
        this.lastGain = new FakeGainNode();
        return this.lastGain;
    }
    register(): void {
        FakeAudioContext.instances.push(this);
    }
}

class FakeMediaStream {
    constructor(_tracks?: MediaStreamTrack[]) {}
}

const g = global as unknown as {
    AudioContext: unknown;
    MediaStream: typeof FakeMediaStream;
};
g.AudioContext = class extends FakeAudioContext {
    constructor() {
        super();
        this.register();
    }
};
g.MediaStream = FakeMediaStream;

/** The AudioContext created by the most recent init(). */
function lastCtx(): FakeAudioContext {
    return FakeAudioContext.instances[FakeAudioContext.instances.length - 1];
}

function makeTrack(): MediaStreamTrack {
    return { id: "t1", kind: "audio", enabled: true } as unknown as MediaStreamTrack;
}

/** Linear amplitude that maps (via 20*log10) to `db`. */
function amplitudeForDb(db: number): number {
    return 10 ** (db / 20);
}

describe("TrackRmsAnalyser", () => {
    beforeEach(() => {
        FakeAudioContext.instances = [];
        FakeAudioContext.resumeShouldReject = false;
    });

    it("reports the silence floor before init()", () => {
        const a = new TrackRmsAnalyser(makeTrack());
        expect(a.readRmsDb()).toBe(TrackRmsAnalyser.RMS_VALUE_OF_SILENCE);
    });

    it("wires source -> analyser -> gain(0) -> destination on init()", () => {
        const a = new TrackRmsAnalyser(makeTrack());
        a.init();
        expect(lastCtx().lastGain!.gain.value).toBe(0);
        expect(lastCtx().resumeCalls).toBe(1);
    });

    it("does not throw when resume() is blocked (autoplay policy)", () => {
        FakeAudioContext.resumeShouldReject = true;
        const a = new TrackRmsAnalyser(makeTrack());
        expect(() => a.init()).not.toThrow();
    });

    it("converts a full-scale constant signal to ~0 dB", () => {
        const a = new TrackRmsAnalyser(makeTrack());
        a.init();
        lastCtx().lastAnalyser!.amplitude = 1;
        expect(a.readRmsDb()).toBeCloseTo(0, 5);
    });

    it("converts a -20 dBFS signal correctly", () => {
        const a = new TrackRmsAnalyser(makeTrack());
        a.init();
        lastCtx().lastAnalyser!.amplitude = amplitudeForDb(-20);
        expect(a.readRmsDb()).toBeCloseTo(-20, 5);
    });

    it("floors true silence at RMS_VALUE_OF_SILENCE", () => {
        const a = new TrackRmsAnalyser(makeTrack());
        a.init();
        lastCtx().lastAnalyser!.amplitude = 0;
        expect(a.readRmsDb()).toBe(TrackRmsAnalyser.RMS_VALUE_OF_SILENCE);
    });

    it("reads a fresh sample on every call", () => {
        const a = new TrackRmsAnalyser(makeTrack());
        a.init();
        lastCtx().lastAnalyser!.amplitude = 1;
        expect(a.readRmsDb()).toBeCloseTo(0, 5);
        lastCtx().lastAnalyser!.amplitude = amplitudeForDb(-20);
        expect(a.readRmsDb()).toBeCloseTo(-20, 5);
    });

    it("closes the context on stop() and does not throw", () => {
        const a = new TrackRmsAnalyser(makeTrack());
        a.init();
        const ctx = lastCtx();
        expect(() => a.stop()).not.toThrow();
        expect(ctx.closeCalls).toBe(1);
    });
});
