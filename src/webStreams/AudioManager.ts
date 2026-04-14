import { ActiveSpeakerDetector, DEFAULTS, SpeakerState } from "./audio/ActiveSpeakerDetector";
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
        private readonly onRmsForWorker: (rms: number) => void,
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
        this.activeSpeakerDetector.onFrame({
            id: 0,
            rms: this.lastMeasuredLocalRMS,
            timestamp: Date.now(),
        });
        const speakers = this.activeSpeakerDetector.onFrame({
            id: publisherId,
            rms,
            timestamp: Date.now(),
        });
        this.audioLevelCallback({ levels: speakers });
    }

    async ensureLocalAudioLevelMeter(track: MediaStreamTrack): Promise<void> {
        if (this.localAudioLevelMeters.has(track.id)) {
            return;
        }
        const meter = new LocalAudioLevelMeter(track, (onRms) => {
            const rmsToReport = track.enabled
                ? onRms
                : LocalAudioLevelMeter.RMS_VALUE_OF_SILENCE;
            this.onRmsForWorker(rmsToReport);
            this.lastMeasuredLocalRMS = onRms;
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
}
