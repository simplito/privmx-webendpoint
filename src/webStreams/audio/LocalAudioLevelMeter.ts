export class LocalAudioLevelMeter {
    public static readonly RMS_VALUE_OF_SILENCE = -99;
    private ctx!: AudioContext;
    private node!: AudioWorkletNode;
    private source!: MediaStreamAudioSourceNode;
    private keepAliveGain!: GainNode;
    private stopped = false;

    constructor(
        private track: MediaStreamTrack,
        protected onLevel: (rmsDb: number) => void,
    ) {}

    async init(workletUrl: string) {
        const candidateSampleRates: Array<number | undefined> = [];
        try {
            const settings = this.track.getSettings?.();
            if (typeof (settings as any)?.sampleRate === "number") {
                candidateSampleRates.push((settings as any).sampleRate);
            }
        } catch {
            // ignore
        }
        candidateSampleRates.push(undefined);

        let lastErr: unknown;
        for (const sampleRate of candidateSampleRates) {
            if (this.stopped) {
                throw new Error("LocalAudioLevelMeter stopped during init");
            }
            try {
                this.ctx = sampleRate ? new AudioContext({ sampleRate }) : new AudioContext();

                await this.ctx.audioWorklet.addModule(workletUrl);
                try {
                    await this.ctx.resume();
                } catch {
                    // ignore (can be blocked until user gesture)
                }

                this.source = this.ctx.createMediaStreamSource(new MediaStream([this.track]));

                this.node = new AudioWorkletNode(this.ctx, "rms-processor");
                this.node.port.onmessage = (e) => this.onLevel(e.data.rmsDb);

                this.keepAliveGain = this.ctx.createGain();
                this.keepAliveGain.gain.value = 0;

                this.source.connect(this.node);
                this.node.connect(this.keepAliveGain);
                this.keepAliveGain.connect(this.ctx.destination);

                lastErr = undefined;
                break;
            } catch (e) {
                lastErr = e;
                try {
                    this.ctx?.close();
                } catch {
                    // ignore
                }
            }
        }

        if (lastErr) {
            throw lastErr;
        }
    }

    stop() {
        this.stopped = true;
        try {
            this.node?.port?.close();
        } catch {
            // ignore
        }
        try {
            this.source?.disconnect();
        } catch {
            // ignore
        }
        try {
            this.node?.disconnect();
        } catch {
            // ignore
        }
        try {
            this.keepAliveGain?.disconnect();
        } catch {
            // ignore
        }
        try {
            this.ctx?.close();
        } catch {
            // ignore
        }
    }
}
