export class LocalAudioLevelMeter {
    private ctx!: AudioContext;
    private node!: AudioWorkletNode;

    constructor(
        private track: MediaStreamTrack,
        private onLevel: (rmsDb: number) => void,
    ) {}

    async init(workletUrl: string) {
        this.ctx = new AudioContext({ sampleRate: 48000 });

        await this.ctx.audioWorklet.addModule(workletUrl);

        const source = this.ctx.createMediaStreamSource(new MediaStream([this.track]));

        this.node = new AudioWorkletNode(this.ctx, "rms-processor");
        this.node.port.onmessage = (e) => this.onLevel(e.data.rmsDb);

        source.connect(this.node);
    }

    stop() {
        this.ctx?.close();
    }
}
