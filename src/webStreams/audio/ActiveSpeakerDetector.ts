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
     * EMA smoothing factor (0..1) applied to the adaptive background
     * noise-floor estimate. Should be much slower than `rmsEmaAlpha` so it
     * tracks ambient noise rather than speech. Default 0.02.
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
     * Lower bound (dB) applied to every incoming level *and* to the adaptive
     * noise floor - levels below this are treated as silence. Two purposes:
     * (1) the noise floor can't sink toward the digital-silence value reported
     * for tracks with no audio (DTX gaps, an SFU that drops the level), which
     * would otherwise pin the threshold near -93 and mark every track active
     * on the faintest sound; (2) bounding the input keeps the level EMA from
     * diving to -99 between words, so the next quiet utterance activates
     * promptly instead of having to climb ~80 dB first. Real audio louder than
     * this is unaffected. Default -70.
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
    noiseEmaAlpha: 0.02, // slow background adaptation
    thresholdOffset: 6, // dB above noise floor to consider speech
    // AudioManager.readAudioStats() is pull-based - the caller decides how
    // often to call it (a few hundred ms is typical). holdMs needs real slack
    // over that interval: if it only matched the caller's polling rate
    // exactly, any jitter (a slow getStats() call, a delayed setInterval,
    // background-tab throttling) would let activeUntil lapse between reads,
    // flickering "active" to false mid-speech.
    holdMs: 500,
    // Lower bound on both the input level and the adaptive noise floor. Keeps
    // the floor off the -99 digital-silence value we report for tracks with no
    // native level (DTX gaps) - which would otherwise leave the threshold at
    // ~-93 and mark every track active on the faintest sound - and keeps the
    // level EMA from diving to -99 between words so quiet speech re-activates
    // promptly. -70 dB sits above typical comfort noise and below speech.
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

    onFrame({ id, rms, timestamp }: FrameInput): SpeakerState[] {
        // Treat anything below the floor as silence: bounding the input keeps
        // the level EMA from diving to the -99 no-audio value between words,
        // which would otherwise force the next (quiet) utterance to climb ~80 dB
        // before it could cross the threshold.
        const level = Math.max(rms, this.opts.noiseFloorMin);
        const state = this.getOrCreateState(id, level);

        state.emaRms = this.opts.rmsEmaAlpha * level + (1 - this.opts.rmsEmaAlpha) * state.emaRms;

        if (state.emaRms < state.noiseFloor + this.opts.thresholdOffset) {
            state.noiseFloor = Math.max(
                this.opts.noiseFloorMin,
                this.opts.noiseEmaAlpha * state.emaRms +
                    (1 - this.opts.noiseEmaAlpha) * state.noiseFloor,
            );
        }

        const adaptiveThreshold = state.noiseFloor + this.opts.thresholdOffset;

        if (state.emaRms >= adaptiveThreshold) {
            state.lastAboveThresholdTs = timestamp;
            state.activeUntil = timestamp + this.opts.holdMs;
        }

        return this.selectActiveSpeakers(timestamp);
    }

    removeSpeaker(id: PublisherId): void {
        this.speakers.delete(id);
    }

    private selectActiveSpeakers(now: number): SpeakerState[] {
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
