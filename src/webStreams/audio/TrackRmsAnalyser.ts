/**
 * AnalyserNode-based RMS reader for a single **local** audio track (the user's
 * own microphone). `AudioManager` meters every local track this way - one
 * consistent cross-browser reading - rather than via `RTCRtpSender.getStats()`,
 * whose media-source `audioLevel` is absent in some browsers (Firefox) and
 * differently scaled across the rest. Not used for remote tracks (we don't own
 * those) and not part of the public API.
 *
 * We own the raw local `MediaStreamTrack`, so a plain `AnalyserNode` reads its
 * level directly - no worker, no encoded-frame access, no SFU dependency.
 * `readRmsDb()` pulls the current level synchronously whenever
 * `AudioManager`'s poll needs it.
 * @internal
 */
/**
 * AnalyserNode time-domain window read on each poll. Sized so a single read is
 * a representative RMS of the ongoing signal - comparable to the continuous
 * level the native `getStats()`/RFC 6464 paths report - rather than a ~10ms
 * slice that would swing far more than the remote side; still short enough to
 * stay responsive at a few-hundred-millisecond poll cadence. (~85ms at 48kHz.)
 */
const ANALYSER_FFT_SIZE = 4096;

export class TrackRmsAnalyser {
    public static readonly RMS_VALUE_OF_SILENCE = -99;

    private ctx: AudioContext | undefined;
    private analyser: AnalyserNode | undefined;
    private source: MediaStreamAudioSourceNode | undefined;
    private keepAliveGain: GainNode | undefined;
    private buffer: Float32Array | undefined;

    constructor(private readonly track: MediaStreamTrack) {}

    /**
     * Builds the audio graph for `track`. Synchronous - an AnalyserNode needs
     * no async module loading. Throws if Web Audio is unavailable; the caller
     * is expected to treat that as "no level" and fall back to silence.
     */
    init(): void {
        this.ctx = new AudioContext();
        this.ctx.resume().catch(() => {
            // ignore - may be blocked until a user gesture; in a live call the
            // user has already interacted, so this normally resolves.
        });

        this.source = this.ctx.createMediaStreamSource(new MediaStream([this.track]));
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = ANALYSER_FFT_SIZE;
        this.buffer = new Float32Array(this.analyser.fftSize);

        // Keep the analyser fed: it only receives data while connected through
        // to an output, so route it to the destination via a silent tap.
        this.keepAliveGain = this.ctx.createGain();
        this.keepAliveGain.gain.value = 0;

        this.source.connect(this.analyser);
        this.analyser.connect(this.keepAliveGain);
        this.keepAliveGain.connect(this.ctx.destination);
    }

    /** Current RMS level of the track in dBFS, floored at `RMS_VALUE_OF_SILENCE`. */
    readRmsDb(): number {
        if (!this.analyser || !this.buffer) {
            return TrackRmsAnalyser.RMS_VALUE_OF_SILENCE;
        }
        this.analyser.getFloatTimeDomainData(this.buffer);

        let sumOfSquares = 0;
        for (const sample of this.buffer) {
            sumOfSquares += sample * sample;
        }
        const rms = Math.sqrt(sumOfSquares / this.buffer.length);
        if (rms <= 0) {
            return TrackRmsAnalyser.RMS_VALUE_OF_SILENCE;
        }
        return Math.max(20 * Math.log10(rms), TrackRmsAnalyser.RMS_VALUE_OF_SILENCE);
    }

    // Each call wrapped individually: some browsers throw on already-disconnected nodes/contexts.
    stop(): void {
        try {
            this.source?.disconnect();
        } catch {
            // ignore
        }
        try {
            this.analyser?.disconnect();
        } catch {
            // ignore
        }
        try {
            this.keepAliveGain?.disconnect();
        } catch {
            // ignore
        }
        try {
            this.ctx?.close();
        } catch {
            // ignore
        }
    }
}
