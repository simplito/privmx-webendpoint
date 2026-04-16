/**
 * RMS AudioWorkletProcessor
 * - Computes RMS for each audio frame
 * - Smooths the signal with an exponential moving average (EMA)
 * - Posts RMS in dBFS via the message port, throttled to every 4 frames
 */

class RMSProcessor extends AudioWorkletProcessor {
    smoothing = 0.3;
    prev = 0;
    frameCount = 0;

    process(inputs) {
        const input = inputs[0];
        if (!input || !input[0]) {
            return true;
        }

        const samples = input[0];
        let sum = 0;

        for (const sample of samples) {
            sum += sample * sample;
        }

        const rms = Math.sqrt(sum / samples.length);
        const smoothed = this.smoothing * rms + (1 - this.smoothing) * this.prev;
        this.prev = smoothed;

        this.frameCount++;
        if (this.frameCount < 4) {
            return true;
        }
        this.frameCount = 0;

        // Convert to dBFS; floor at -99 dB (matches LocalAudioLevelMeter.RMS_VALUE_OF_SILENCE)
        let db = 20 * Math.log10(Math.max(smoothed, 1e-8));
        if (db < -99) {
            db = -99;
        }

        this.port.postMessage({ rmsDb: db });

        return true;
    }
}

try {
    registerProcessor("rms-processor", RMSProcessor);
} catch {
    // Already registered — happens when the same AudioContext loads the module twice
}
