/* Only the microphone connects to this input. Outputs remain silent. */
class MicrophoneRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.startFrame = Infinity;
    this.recording = false;
    this.chunk = new Float32Array(4096);
    this.used = 0;
    this.levelFrames = 0;
    this.levelPeak = 0;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'start') {
        this.startFrame = data.frame;
        this.recording = true;
        this.used = 0;
      } else if (data.type === 'stop') {
        this.recording = false;
        this.flush();
        this.port.postMessage({ type: 'done' });
      } else if (data.type === 'cancel') {
        this.recording = false;
        this.used = 0;
      }
    };
  }
  flush() {
    if (!this.used) return;
    const samples = this.chunk.slice(0, this.used);
    this.port.postMessage({ type: 'samples', samples }, [samples.buffer]);
    this.used = 0;
  }
  process(inputs, outputs) {
    const channels = inputs[0];
    const length = outputs[0]?.[0]?.length ?? channels?.[0]?.length ?? 128;
    for (const output of outputs) for (const channel of output) channel.fill(0);
    for (let i = 0; i < length; i++) {
      let sample = 0;
      if (channels?.length) {
        for (const channel of channels) sample += channel[i] ?? 0;
        sample /= channels.length;
      }
      this.levelPeak = Math.max(this.levelPeak, Math.abs(sample));
      if (this.recording && currentFrame + i >= this.startFrame) {
        this.chunk[this.used++] = sample;
        if (this.used === this.chunk.length) this.flush();
      }
    }
    this.levelFrames += length;
    if (this.levelFrames >= sampleRate / 20) {
      this.port.postMessage({ type: 'level', value: this.levelPeak });
      this.levelFrames = 0;
      this.levelPeak = 0;
    }
    return true;
  }
}
registerProcessor('microphone-recorder', MicrophoneRecorder);
