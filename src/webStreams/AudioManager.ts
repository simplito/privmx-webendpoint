import {
    ActiveSpeakerDetector,
    DEFAULTS,
    LOCAL_PUBLISHER_ID,
    SpeakerState,
} from "./audio/ActiveSpeakerDetector";
import { LocalAudioLevelMeter } from "./audio/LocalAudioLevelMeter";

export interface AudioLevelsStats {
    levels: SpeakerState[];
}

export type AudioLevelFuncCallback = (changes: AudioLevelsStats) => void;

export class AudioManager {
    private readonly activeSpeakerDetector: ActiveSpeakerDetector;
    private readonly localAudioLevelMeters: Map<string, LocalAudioLevelMeter> = new Map();
    private lastMeasuredLocalRMS: number = LocalAudioLevelMeter.RMS_VALUE_OF_SILENCE;
    private audioLevelCallback: AudioLevelFuncCallback | undefined;

    constructor(
        private readonly assetsDir: string,
        private readonly sendRmsToWorker: (rms: number) => void,
    ) {
        this.activeSpeakerDetector = new ActiveSpeakerDetector(DEFAULTS);
    }

    setAudioLevelCallback(func: AudioLevelFuncCallback): void {
        this.audioLevelCallback = func;
    }

    onRemoteFrameRms(publisherId: number, rms: number): void {
        if (!this.audioLevelCallback) {
            return;
        }

        // Use a single timestamp for both frames so the detector sees them as simultaneous.
        const now = Date.now();

        this.activeSpeakerDetector.onFrame({
            id: LOCAL_PUBLISHER_ID,
            rms: this.lastMeasuredLocalRMS,
            timestamp: now,
        });
        const speakers = this.activeSpeakerDetector.onFrame({
            id: publisherId,
            rms,
            timestamp: now,
        });
        this.audioLevelCallback({ levels: speakers });
    }

    async ensureLocalAudioLevelMeter(track: MediaStreamTrack): Promise<void> {
        if (this.localAudioLevelMeters.has(track.id)) {
            return;
        }
        const meter = new LocalAudioLevelMeter(track, (rmsDb) => {
            // Always send the actual RMS to the worker so the encrypted frame trailer reflects
            // real mic activity. When the track is muted the worker receives silence instead,
            // but lastMeasuredLocalRMS stores the real value so the local speaker entry in the
            // detector still shows the user their own microphone level while muted.
            const rmsForWorker = track.enabled ? rmsDb : LocalAudioLevelMeter.RMS_VALUE_OF_SILENCE;
            this.sendRmsToWorker(rmsForWorker);
            this.lastMeasuredLocalRMS = rmsDb;
        });
        this.localAudioLevelMeters.set(track.id, meter);
        try {
            await meter.init(this.assetsDir + "/rms-processor.js");
        } catch (e) {
            this.localAudioLevelMeters.delete(track.id);
            meter.stop();
            throw e;
        }
    }

    stopLocalAudioLevelMeter(track: MediaStreamTrack): void {
        const meter = this.localAudioLevelMeters.get(track.id);
        if (!meter) {
            return;
        }
        this.localAudioLevelMeters.delete(track.id);
        meter.stop();
    }

    destroy(): void {
        for (const meter of this.localAudioLevelMeters.values()) {
            meter.stop();
        }
        this.localAudioLevelMeters.clear();
        this.audioLevelCallback = undefined;
    }
}
