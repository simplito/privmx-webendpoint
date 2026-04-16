/**
 * Numeric WebRTC stream ID as assigned by the remote peer.
 * Matches the `publisherId` used throughout the webStreams layer
 * (derived from `Number(RTCTrackEvent.streams[0].id)`).
 * The value -1 is reserved for the local microphone.
 */
export type PublisherId = number;

export const DEFAULTS = {
    rmsEmaAlpha: 0.2,    // fast reaction to speech
    noiseEmaAlpha: 0.02, // slow background adaptation
    thresholdOffset: 6,  // dB above noise floor to consider speech
    activityWindowMs: 400,
    holdMs: 200,
};

export interface FrameInput {
    id: PublisherId;
    rms: number;
    timestamp: number; // ms
}

export interface SpeakerState {
    readonly streamId: PublisherId;
    readonly emaRms: number;
    readonly noiseFloor: number;
    readonly lastAboveThresholdTs: number;
    readonly activeSince: number;
    readonly active: boolean;
}

interface ActiveSpeakerDetectorOptions {
    rmsEmaAlpha: number;
    noiseEmaAlpha: number;
    thresholdOffset: number;
    activityWindowMs: number;
    holdMs: number;
}

// Internal mutable version — not exposed to callers
interface MutableSpeakerState {
    streamId: PublisherId;
    emaRms: number;
    noiseFloor: number;
    lastAboveThresholdTs: number;
    activeSince: number;
    active: boolean;
}

/**
 * How long after the last above-threshold frame we keep a speaker entry alive.
 * Speakers that go silent for longer than this are pruned from the map.
 */
const SPEAKER_PRUNE_AFTER_MS = 10_000;

/** Reserved ID for the local microphone — cannot collide with remote stream IDs (which are >= 0). */
export const LOCAL_PUBLISHER_ID: PublisherId = -1;

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
            if (!isFinite(state.activeSince)) {
                // Record the start of this continuous active window
                state.activeSince = timestamp;
            }
        }
        else {
            state.activeSince = -Infinity;
        }

        return this.selectActiveSpeakers(timestamp);
    }

    removeSpeaker(id: PublisherId): void {
        this.speakers.delete(id);
    }

    private selectActiveSpeakers(now: number): SpeakerState[] {
        for (const [id, state] of this.speakers.entries()) {
            const withinWindow = now - state.lastAboveThresholdTs <= this.opts.activityWindowMs;
            const withinHold = isFinite(state.activeSince) && now - state.activeSince < this.opts.holdMs;
            state.active = withinWindow && withinHold;

            // Only prune entries that have had at least one real above-threshold frame.
            // Entries still at -Infinity were just created and should not be evicted yet.
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
                activeSince: -Infinity,
                active: false,
            };
            this.speakers.set(id, state);
        }
        return state;
    }
}
