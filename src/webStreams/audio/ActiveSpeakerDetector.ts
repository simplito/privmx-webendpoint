/**
 * Numeric WebRTC stream ID as assigned by the remote peer.
 * Matches the `publisherId` used throughout the webStreams layer
 * (derived from `Number(RTCTrackEvent.streams[0].id)`).
 * The value -1 is reserved for the local microphone.
 * @internal
 */
export type PublisherId = number;

/**
 * Default tuning parameters for {@link ActiveSpeakerDetector}.
 * @internal
 */
export const DEFAULTS = {
    rmsEmaAlpha: 0.2, // fast reaction to speech
    noiseEmaAlpha: 0.02, // slow background adaptation
    thresholdOffset: 6, // dB above noise floor to consider speech
    activityWindowMs: 400,
    holdMs: 200,
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

interface ActiveSpeakerDetectorOptions {
    rmsEmaAlpha: number;
    noiseEmaAlpha: number;
    thresholdOffset: number;
    activityWindowMs: number;
    holdMs: number;
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

    constructor(private opts: ActiveSpeakerDetectorOptions) {}

    onFrame({ id, rms, timestamp }: FrameInput): SpeakerState[] {
        const state = this.getOrCreateState(id, rms);

        state.emaRms = this.opts.rmsEmaAlpha * rms + (1 - this.opts.rmsEmaAlpha) * state.emaRms;

        if (state.emaRms < state.noiseFloor + this.opts.thresholdOffset) {
            state.noiseFloor =
                this.opts.noiseEmaAlpha * state.emaRms +
                (1 - this.opts.noiseEmaAlpha) * state.noiseFloor;
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

        return Array.from(this.speakers.values());
    }

    private getOrCreateState(id: PublisherId, rms: number): MutableSpeakerState {
        let state = this.speakers.get(id);
        if (!state) {
            state = {
                streamId: id,
                emaRms: rms,
                noiseFloor: rms,
                lastAboveThresholdTs: -Infinity,
                activeUntil: -Infinity,
            };
            this.speakers.set(id, state);
        }
        return state;
    }
}
