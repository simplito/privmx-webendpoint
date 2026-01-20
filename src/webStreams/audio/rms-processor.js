/* 
 * RMS AudioWorkletProcessor
 * - liczy RMS z każdej ramki audio
 * - wygładza sygnał (EMA)
 * - wysyła RMS w dBFS przez port
 */

class RMSProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.smoothing = 0.3;
    this.prev = 0;
  }
  
  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) {
      return true;
    }
    
    const samples = input[0];
    let sum = 0;
    
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      sum += s * s;
    }
    
    const rms = Math.sqrt(sum / samples.length);
    
    // Exponential moving average
    const smoothed =
      this.smoothing * rms + (1 - this.smoothing) * this.prev;
    
    this.prev = smoothed;
    
    // RMS -> dBFS
    let db = 20 * Math.log10(smoothed || 1e-8);
    if (db < -100) db = -100;
    
    this.port.postMessage({ rmsDb: db });
    
    return true;
  }
}

registerProcessor("rms-processor", RMSProcessor);
