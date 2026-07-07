import {
    ActiveSpeakerDetector,
    ActiveSpeakerDetectorConfig,
    DEFAULTS,
    LOCAL_PUBLISHER_ID,
    PublisherId,
    SpeakerState,
} from "./audio/ActiveSpeakerDetector.js";

export type { ActiveSpeakerDetectorConfig };

export interface AudioLevelsStats {
    levels: SpeakerState[];
}

/** Reported when no native audio level is available for a watched track. */
const RMS_VALUE_OF_SILENCE = -99;

/**
 * Reads per-track audio levels on demand and feeds them into
 * `ActiveSpeakerDetector`. Pull-based, not polling: `readAudioStats()` does
 * one fresh read of every watched sender/receiver each time it's called - the
 * caller decides how often that is.
 *
 * Sourced entirely from native browser APIs, no worker or dedicated audio
 * graph involved: `RTCRtpSender.getStats()` ("media-source" report) for the
 * local mic, and the synchronous `RTCRtpReceiver.getSynchronizationSources()`
 * (RFC 6464 RTP header extension) for remote tracks. If a browser or SFU
 * doesn't surface a native level for a given track, that track reports
 * silence - there is no local-analysis fallback.
 *
 * `ActiveSpeakerDetector`'s EMA smoothing and `holdMs` hold-time are tuned
 * for roughly one call every few hundred ms; calling much less often than
 * that will still work, but "active" will only ever reflect whatever was
 * true at the instant of each call, not what happened between calls.
 * @internal
 */
export class AudioManager {
    private readonly activeSpeakerDetector = new ActiveSpeakerDetector(DEFAULTS);

    private readonly localSenders = new Map<string, RTCRtpSender>();
    private readonly remoteReceivers = new Map<PublisherId, RTCRtpReceiver>();

    /**
     * Starts sampling the local microphone's audio level from `sender`.
     * Multiple simultaneous local audio senders are combined by taking the
     * loudest one.
     */
    watchLocalSender(sender: RTCRtpSender): void {
        if (!sender.track) return;
        this.localSenders.set(sender.track.id, sender);
    }

    /**
     * Stops sampling the local microphone level previously started for `track`.
     */
    unwatchLocalSender(track: MediaStreamTrack): void {
        this.localSenders.delete(track.id);
    }

    /**
     * Starts sampling the remote audio level for `publisherId` from `receiver`.
     */
    watchRemoteReceiver(publisherId: PublisherId, receiver: RTCRtpReceiver): void {
        this.remoteReceivers.set(publisherId, receiver);
    }

    /**
     * Stops sampling the remote audio level for `publisherId` and removes it
     * from the active speaker detector immediately, rather than waiting for
     * the stale-speaker prune window.
     */
    unwatchRemoteReceiver(publisherId: PublisherId): void {
        this.remoteReceivers.delete(publisherId);
        this.activeSpeakerDetector.removeSpeaker(publisherId);
    }

    /**
     * Overrides any subset of the active-speaker detector's tuning
     * parameters (EMA smoothing, threshold, hold time); omitted fields keep
     * their current value.
     */
    configureActiveSpeakerDetector(config: Partial<ActiveSpeakerDetectorConfig>): void {
        this.activeSpeakerDetector.configure(config);
    }

    /**
     * Reads the current audio level for every watched sender/receiver right
     * now, feeds the samples into the active-speaker detector, and returns
     * the result. No internal timer - call this as often as you need.
     */
    async readAudioStats(): Promise<AudioLevelsStats> {
        const now = Date.now();
        const localRms = await this.readLocalRms();
        let states: SpeakerState[] = this.activeSpeakerDetector.onFrame({
            id: LOCAL_PUBLISHER_ID,
            rms: localRms,
            timestamp: now,
        });

        for (const [publisherId, receiver] of this.remoteReceivers) {
            const rms = this.readRemoteRms(receiver);
            states = this.activeSpeakerDetector.onFrame({ id: publisherId, rms, timestamp: now });
        }

        return { levels: states };
    }

    destroy(): void {
        this.localSenders.clear();
        this.remoteReceivers.clear();
    }

    private async readLocalRms(): Promise<number> {
        let best = RMS_VALUE_OF_SILENCE;
        for (const sender of this.localSenders.values()) {
            const native = await this.readNativeSenderLevel(sender);
            const rms = native !== undefined ? this.levelToDb(native) : RMS_VALUE_OF_SILENCE;
            if (rms > best) best = rms;
        }
        return best;
    }

    private readRemoteRms(receiver: RTCRtpReceiver): number {
        const native = this.readNativeReceiverLevel(receiver);
        return native !== undefined ? this.levelToDb(native) : RMS_VALUE_OF_SILENCE;
    }

    /** Linear (0..1) local mic level from the sender's "media-source" stats report. */
    private async readNativeSenderLevel(sender: RTCRtpSender): Promise<number | undefined> {
        if (typeof sender.getStats !== "function") return undefined;
        try {
            const report = await sender.getStats();
            let level: number | undefined;
            report.forEach((stat: { type: string; kind?: string; audioLevel?: number }) => {
                if (
                    stat.type === "media-source" &&
                    stat.kind === "audio" &&
                    typeof stat.audioLevel === "number"
                ) {
                    level = stat.audioLevel;
                }
            });
            return level;
        } catch {
            return undefined;
        }
    }

    /** Linear (0..1) remote level from the RFC 6464 header extension, if present. */
    private readNativeReceiverLevel(receiver: RTCRtpReceiver): number | undefined {
        if (typeof receiver.getSynchronizationSources !== "function") return undefined;
        for (const source of receiver.getSynchronizationSources()) {
            if (typeof source.audioLevel === "number") return source.audioLevel;
        }
        return undefined;
    }

    private levelToDb(level: number): number {
        if (level <= 0) return RMS_VALUE_OF_SILENCE;
        return Math.max(20 * Math.log10(level), RMS_VALUE_OF_SILENCE);
    }
}
