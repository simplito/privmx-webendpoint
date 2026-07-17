/**
 * Numeric WebRTC stream ID as assigned by the remote peer.
 * Matches the `publisherId` used throughout the webStreams layer
 * (derived from `Number(RTCTrackEvent.streams[0].id)`).
 * The value -1 is reserved for the local microphone.
 * @internal
 */
export type PublisherId = number;

function clamp01(value: number): number {
    return Math.min(1, Math.max(0, value));
}

/**
 * Tuning parameters for {@link ActiveSpeakerDetector}. Pass a partial object
 * to `AudioManager.configureActiveSpeakerDetector()` (exposed publicly as
 * `StreamApi.configureActiveSpeakerDetector()`) to override any subset of
 * these; omitted fields keep their current value.
 */
export interface ActiveSpeakerDetectorConfig {
    /**
     * EMA smoothing factor (0..1) applied to the raw level itself. Higher
     * reacts faster in both directions - quiet/short speech activates sooner
     * and the indicator releases sooner after speech stops - but is noisier;
     * lower is smoother but sluggish (quiet utterances can end before the EMA
     * climbs past the threshold, and loud speech lingers active). Default 0.5.
     */
    rmsEmaAlpha: number;
    /**
     * How fast the noise floor *rises* toward sustained energy (0..1). The
     * floor snaps down instantly to newly-observed quiet levels but climbs up
     * only at this rate, so steady room ambience or a mic-AGC ramp is absorbed
     * over a few seconds while a real, gappy talker - whose level keeps dipping
     * between words and snapping the floor back down - is not. Higher absorbs
     * ambient sooner but risks de-activating a long, gapless utterance; much
     * slower than `rmsEmaAlpha` on purpose. Default 0.05.
     */
    noiseEmaAlpha: number;
    /**
     * How many dB a speaker's smoothed level must sit above the current noise
     * floor to be considered "speaking". Lower is more sensitive (more false
     * positives on background noise); higher requires louder/clearer speech.
     * Default 6.
     */
    thresholdOffset: number;
    /**
     * How long (ms) a speaker stays marked active after the last frame that
     * crossed the threshold, so brief pauses between words don't flicker the
     * indicator off. Needs real slack over however often you call
     * `AudioManager.readAudioStats()`. Default 500.
     */
    holdMs: number;
    /**
     * Lower bound (dB) on both the incoming level and the adaptive noise
     * floor. A safety net: ticks with no audio are skipped entirely (the floor
     * only ever sees real levels), but should a source still report a
     * near-silence value this stops the floor sinking so low that the
     * threshold sits under all real audio. Real audio louder than this is
     * unaffected. Default -70.
     */
    noiseFloorMin: number;
}

/**
 * Default tuning parameters for {@link ActiveSpeakerDetector}.
 * @internal
 */
export const DEFAULTS: ActiveSpeakerDetectorConfig = {
    // Reasonably fast: with ~300ms polling this makes a quiet or short
    // utterance register within a frame or two, and releases within ~1s of
    // speech stopping, while still smoothing single-frame jitter.
    rmsEmaAlpha: 0.5,
    noiseEmaAlpha: 0.05, // slow upward adaptation of the noise floor (see field doc)
    thresholdOffset: 6, // dB above noise floor to consider speech
    // AudioManager.readAudioStats() is pull-based - the caller decides how
    // often to call it (a few hundred ms is typical). holdMs needs real slack
    // over that interval: if it only matched the caller's polling rate
    // exactly, any jitter (a slow getStats() call, a delayed setInterval,
    // background-tab throttling) would let activeUntil lapse between reads,
    // flickering "active" to false mid-speech.
    holdMs: 500,
    // Safety lower bound on the level/floor; no-audio ticks are skipped rather
    // than fed as silence, so this only guards against a source reporting an
    // implausibly low level. -70 dB sits below speech, above typical ambience.
    noiseFloorMin: -70,
};

/**
 * Per-frame RMS sample fed into {@link ActiveSpeakerDetector}.
 * @internal
 */
export interface FrameInput {
    id: PublisherId;
    rms: number;
    timestamp: number; // ms
}

/**
 * Immutable snapshot of a tracked speaker's smoothed audio state.
 * @internal
 */
export interface SpeakerState {
    readonly streamId: PublisherId;
    readonly emaRms: number;
    readonly noiseFloor: number;
    readonly lastAboveThresholdTs: number;
    readonly activeUntil: number;
}

interface MutableSpeakerState {
    streamId: PublisherId;
    emaRms: number;
    noiseFloor: number;
    lastAboveThresholdTs: number;
    activeUntil: number;
}

/**
 * How long after the last above-threshold frame we keep a speaker entry alive.
 * Speakers that go silent for longer than this are pruned from the map.
 */
const SPEAKER_PRUNE_AFTER_MS = 10_000;

/**
 * How fast the noise floor drops toward a newly-observed quieter level. Near
 * instant so the floor tracks the quiet baseline between words - that baseline
 * is what the speaking threshold sits above. (The upward rate is the slow,
 * configurable `noiseEmaAlpha`; see its field doc for why the two differ.)
 */
const NOISE_FLOOR_FALL_ALPHA = 0.5;

/**
 * Reserved ID for the local microphone -- cannot collide with remote stream IDs (which are >= 0).
 * @internal
 */
export const LOCAL_PUBLISHER_ID: PublisherId = -1;

/**
 * Detects active speakers from per-frame RMS levels using EMA smoothing and
 * an adaptive noise floor. Used by AudioManager; not part of the public API.
 * @internal
 */
export class ActiveSpeakerDetector {
    private speakers = new Map<PublisherId, MutableSpeakerState>();

    constructor(private opts: ActiveSpeakerDetectorConfig) {}

    /**
     * Overrides any subset of the tuning parameters; omitted fields keep
     * their current value. Takes effect from the next `onFrame()` call -
     * already-tracked speakers' `emaRms`/`noiseFloor` are left as-is, only
     * how future frames update them changes.
     */
    configure(config: Partial<ActiveSpeakerDetectorConfig>): void {
        if (config.rmsEmaAlpha !== undefined) {
            this.opts.rmsEmaAlpha = clamp01(config.rmsEmaAlpha);
        }
        if (config.noiseEmaAlpha !== undefined) {
            this.opts.noiseEmaAlpha = clamp01(config.noiseEmaAlpha);
        }
        if (config.thresholdOffset !== undefined) {
            this.opts.thresholdOffset = config.thresholdOffset;
        }
        if (config.holdMs !== undefined) {
            this.opts.holdMs = Math.max(0, config.holdMs);
        }
        if (config.noiseFloorMin !== undefined) {
            this.opts.noiseFloorMin = config.noiseFloorMin;
        }
    }

    /**
     * Convenience for callers that always have a level: folds in the sample
     * and returns the current snapshot. `AudioManager` instead calls
     * {@link observe} only for sources that reported a level this tick and
     * {@link snapshot} once at the end, so silent sources are skipped rather
     * than fed synthetic silence.
     */
    onFrame(input: FrameInput): SpeakerState[] {
        this.observe(input);
        return this.snapshot(input.timestamp);
    }

    /**
     * Folds one real level sample into `id`'s tracked state. Only ever called
     * with a genuine measured level - a tick where a source reports no audio is
     * skipped by the caller, not passed here as silence, so each stream's noise
     * floor settles at its own true ambient regardless of how loud or quiet a
     * given browser's levels run.
     */
    observe({ id, rms, timestamp }: FrameInput): void {
        const level = Math.max(rms, this.opts.noiseFloorMin);
        const state = this.getOrCreateState(id, level);

        state.emaRms = this.opts.rmsEmaAlpha * level + (1 - this.opts.rmsEmaAlpha) * state.emaRms;

        // Track the floor toward the signal in both directions but
        // asymmetrically - snap down fast to a new quiet baseline, creep up
        // slowly - so steady ambience/AGC ramp is absorbed while a gappy
        // talker (dipping between words) keeps it pinned near the quiet level.
        const floorAlpha =
            state.emaRms < state.noiseFloor ? NOISE_FLOOR_FALL_ALPHA : this.opts.noiseEmaAlpha;
        state.noiseFloor = Math.max(
            this.opts.noiseFloorMin,
            floorAlpha * state.emaRms + (1 - floorAlpha) * state.noiseFloor,
        );

        if (state.emaRms >= state.noiseFloor + this.opts.thresholdOffset) {
            state.lastAboveThresholdTs = timestamp;
            state.activeUntil = timestamp + this.opts.holdMs;
        }
    }

    /**
     * Prunes speakers that have been silent past the stale window and returns
     * a frozen snapshot of the rest. Pass the current time so `activeUntil`
     * comparisons and pruning use one consistent instant.
     */
    snapshot(now: number): SpeakerState[] {
        for (const [id, state] of this.speakers.entries()) {
            // Only prune entries with a real above-threshold frame; -Infinity entries are brand new.
            if (
                isFinite(state.lastAboveThresholdTs) &&
                now - state.lastAboveThresholdTs > SPEAKER_PRUNE_AFTER_MS
            ) {
                this.speakers.delete(id);
            }
        }

        // Copy + freeze: `this.speakers`' values are mutated in place on every
        // frame, so handing them out directly would let a caller observe a
        // later tick's values through a reference captured on an earlier one.
        return Array.from(this.speakers.values(), (state) => Object.freeze({ ...state }));
    }

    removeSpeaker(id: PublisherId): void {
        this.speakers.delete(id);
    }

    private getOrCreateState(id: PublisherId, rms: number): MutableSpeakerState {
        let state = this.speakers.get(id);
        if (!state) {
            state = {
                streamId: id,
                emaRms: rms,
                noiseFloor: Math.max(this.opts.noiseFloorMin, rms),
                lastAboveThresholdTs: -Infinity,
                activeUntil: -Infinity,
            };
            this.speakers.set(id, state);
        }
        return state;
    }
}
