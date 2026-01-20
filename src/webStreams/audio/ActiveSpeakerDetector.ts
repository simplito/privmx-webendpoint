export interface AudioFrameMeta {
  participantId: string;
  timestamp: number;   // monotonic (ms)
  rmsDb: number;       // dBFS (np. -60..0)
}

export class ActiveSpeakerDetector {
  private readonly THRESHOLD_DB = -45;
  private readonly STRONG_DB = -35;

  private readonly MIN_ACTIVE_MS = 300;
  private readonly HANGOVER_MS = 500;

  private currentSpeaker?: string;
  private candidate?: {
    id: string;
    since: number;
  };

  private lastAboveThreshold = new Map<string, number>();

  onFrame(meta: AudioFrameMeta): string | null {
    const now = meta.timestamp;

    if (meta.rmsDb > this.THRESHOLD_DB) {
      this.lastAboveThreshold.set(meta.participantId, now);
    }

    const active = this.pickLoudest(now);
    if (!active) return null;

    if (this.currentSpeaker === active) {
      return null;
    }

    if (!this.candidate || this.candidate.id !== active) {
      this.candidate = { id: active, since: now };
      return null;
    }

    if (now - this.candidate.since >= this.MIN_ACTIVE_MS) {
      this.currentSpeaker = active;
      this.candidate = undefined;
      return active;
    }

    return null;
  }

  private pickLoudest(now: number): string | null {
    let loudest: string | null = null;
    let maxTime = 0;

    for (const [id, ts] of this.lastAboveThreshold.entries()) {
      if (now - ts > this.HANGOVER_MS) continue;
      if (ts > maxTime) {
        maxTime = ts;
        loudest = id;
      }
    }
    return loudest;
  }
}
