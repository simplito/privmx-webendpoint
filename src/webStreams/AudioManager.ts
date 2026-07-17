import {
    ActiveSpeakerDetector,
    ActiveSpeakerDetectorConfig,
    DEFAULTS,
    LOCAL_PUBLISHER_ID,
    PublisherId,
    SpeakerState,
} from "./audio/ActiveSpeakerDetector.js";
import { TrackRmsAnalyser } from "./audio/TrackRmsAnalyser.js";

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
 * Sources, no worker involved:
 * - **Local mic**: always a `TrackRmsAnalyser` (a plain `AnalyserNode` on the
 *   raw local track we own) - one consistent cross-browser reading. We do not
 *   use `RTCRtpSender.getStats()`: its media-source `audioLevel` is absent in
 *   some browsers (Firefox) and differently scaled across the rest, which made
 *   "local" behave differently per browser.
 * - **Remote tracks**: the synchronous `RTCRtpReceiver.getSynchronizationSources()`
 *   per-SSRC `audioLevel` (RFC 6464 RTP header extension) - we don't own remote
 *   tracks, so this is the only option.
 *
 * A source that reports no level for a tick is skipped, not fed as silence -
 * so its detector state simply stops updating and lapses to inactive, and its
 * noise floor settles at its own true ambient (the detector never sees a
 * synthetic silence value). This keeps the local (analyser) and remote (RFC
 * 6464) scales comparable: only level *relative to each stream's own ambient*
 * matters.
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
    // Per-local-track level analysers, keyed by track id. Lazily created the
    // first time a watched local track is read.
    private readonly localAnalysers = new Map<string, TrackRmsAnalyser>();

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
        this.stopLocalAnalyser(track.id);
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
     * now, feeds the ones that report a level into the active-speaker detector,
     * and returns the result. No internal timer - call this as often as you
     * need. Sources with no level this tick are skipped (not fed as silence),
     * so a stream simply stops updating and lapses to inactive.
     */
    async readAudioStats(): Promise<AudioLevelsStats> {
        const now = Date.now();

        const localRms = this.readLocalRms();
        if (localRms !== undefined) {
            this.activeSpeakerDetector.observe({
                id: LOCAL_PUBLISHER_ID,
                rms: localRms,
                timestamp: now,
            });
        }

        for (const [publisherId, receiver] of this.remoteReceivers) {
            const rms = this.readRemoteRms(receiver);
            if (rms !== undefined) {
                this.activeSpeakerDetector.observe({ id: publisherId, rms, timestamp: now });
            }
        }

        return { levels: this.activeSpeakerDetector.snapshot(now) };
    }

    destroy(): void {
        for (const analyser of this.localAnalysers.values()) {
            analyser.stop();
        }
        this.localAnalysers.clear();
        this.localSenders.clear();
        this.remoteReceivers.clear();
    }

    /** dB level of the loudest watched local track, or `undefined` if none reported a level. */
    private readLocalRms(): number | undefined {
        let best: number | undefined;
        for (const sender of this.localSenders.values()) {
            const track = sender.track;
            if (!track) continue;
            const rms = this.readLocalTrackRms(track);
            if (rms !== undefined && (best === undefined || rms > best)) best = rms;
        }
        return best;
    }

    /**
     * Measures `track`'s level via a per-track `AnalyserNode` (lazily created).
     * Local is always metered this way - a consistent cross-browser reading -
     * rather than via `RTCRtpSender.getStats()`, whose media-source `audioLevel`
     * is missing in some browsers and differently scaled across the rest.
     * Returns `undefined` (no signal this tick) if Web Audio is unavailable or
     * the track reads silence.
     */
    private readLocalTrackRms(track: MediaStreamTrack): number | undefined {
        let analyser = this.localAnalysers.get(track.id);
        if (!analyser) {
            analyser = new TrackRmsAnalyser(track);
            try {
                analyser.init();
            } catch {
                return undefined;
            }
            this.localAnalysers.set(track.id, analyser);
        }
        const db = analyser.readRmsDb();
        return db <= TrackRmsAnalyser.RMS_VALUE_OF_SILENCE ? undefined : db;
    }

    private stopLocalAnalyser(trackId: string): void {
        const analyser = this.localAnalysers.get(trackId);
        if (!analyser) return;
        this.localAnalysers.delete(trackId);
        analyser.stop();
    }

    /** dB level of `receiver`, or `undefined` if it reported no level this tick. */
    private readRemoteRms(receiver: RTCRtpReceiver): number | undefined {
        const native = this.readNativeReceiverLevel(receiver);
        return native !== undefined ? this.levelToDb(native) : undefined;
    }

    /**
     * Linear (0..1) remote level from the RFC 6464 header extension, or
     * `undefined` if absent or zero. Absent is the normal DTX-silence case -
     * the stream simply isn't fed this tick.
     */
    private readNativeReceiverLevel(receiver: RTCRtpReceiver): number | undefined {
        if (typeof receiver.getSynchronizationSources !== "function") return undefined;
        for (const source of receiver.getSynchronizationSources()) {
            if (typeof source.audioLevel === "number" && source.audioLevel > 0) {
                return source.audioLevel;
            }
        }
        return undefined;
    }

    private levelToDb(level: number): number {
        if (level <= 0) return RMS_VALUE_OF_SILENCE;
        return Math.max(20 * Math.log10(level), RMS_VALUE_OF_SILENCE);
    }
}
