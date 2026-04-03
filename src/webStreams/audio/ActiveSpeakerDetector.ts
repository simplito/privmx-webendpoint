export const DEFAULTS = {
    rmsEmaAlpha: 0.2, // szybka reakcja na mowę
    noiseEmaAlpha: 0.02, // wolna adaptacja tła
    thresholdOffset: 6, // dB (jeśli RMS w dB)
    activityWindowMs: 400,
    holdMs: 200,
};

type SpeakerId = number;

interface FrameInput {
    id: SpeakerId;
    rms: number;
    timestamp: number; // ms
}

export interface SpeakerState {
    streamId: number;
    emaRms: number;
    noiseFloor: number;
    lastAboveThresholdTs: number;
    activeSince: number;
    active: boolean;
}

interface ActiveSpeakerDetectorOptions {
    // EMA
    rmsEmaAlpha: number; // np. 0.2
    noiseEmaAlpha: number; // np. 0.02 (wolniejsze)

    // progi
    thresholdOffset: number; // ile powyżej noise floor uznajemy mowę

    // czas
    activityWindowMs: number;
    holdMs: number;
}

export class ActiveSpeakerDetector {
    private speakers = new Map<SpeakerId, SpeakerState>();
    private activeSpeaker: SpeakerId | null = null;

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
            state.activeSince = timestamp;
            state.active = true;
        } else {
            state.active = false;
            state.activeSince = 0;
        }

        return this.selectActiveSpeakers(timestamp);
    }

    private selectActiveSpeakers(now: number): SpeakerState[] {
        let bestId: SpeakerId | null = null;
        let bestRms = -Infinity;

        for (const [id, state] of this.speakers.entries()) {
            state.active =
                now - state.lastAboveThresholdTs <= this.opts.activityWindowMs &&
                now - state.activeSince < this.opts.holdMs;
        }

        return Array.from(this.speakers.values());
    }

    private getOrCreateState(id: SpeakerId, rms: number): SpeakerState {
        let state = this.speakers.get(id);
        if (!state) {
            state = {
                streamId: id,
                emaRms: rms,
                noiseFloor: rms,
                lastAboveThresholdTs: -Infinity,
                active: false,
                activeSince: 0,
            };
            this.speakers.set(id, state);
        }
        return state;
    }
}
