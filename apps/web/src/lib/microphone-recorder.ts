const modules = new WeakMap<AudioContext, Promise<void>>();
type Capture = { samples: Float32Array; firstFrame: number | null };

export class MicrophoneRecorder {
  private source: MediaStreamAudioSourceNode;
  private node: AudioWorkletNode;
  private chunks: Float32Array[] = [];
  private finish: ((capture: Capture) => void) | null = null;
  private fail: ((reason: Error) => void) | null = null;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private capturing = false;
  private takeId = 0;

  static async open(context: AudioContext, stream: MediaStream, onLevel: (value: number) => void, onError: (error: Error) => void) {
    if (!context.audioWorklet) throw new Error('Recording needs a browser with AudioWorklet support. Try a current Safari, Chrome, Edge or Firefox.');
    let loaded = modules.get(context);
    if (!loaded) {
      loaded = context.audioWorklet.addModule('/microphone-recorder.js?v=3').catch((error) => { modules.delete(context); throw error; });
      modules.set(context, loaded);
    }
    await loaded;
    return new MicrophoneRecorder(context, stream, onLevel, onError);
  }

  private constructor(readonly context: AudioContext, private stream: MediaStream, onLevel: (value: number) => void, onError: (error: Error) => void) {
    this.source = context.createMediaStreamSource(stream);
    this.node = new AudioWorkletNode(context, 'microphone-recorder', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
    this.source.connect(this.node);
    // The processor outputs silence. Neither song playback nor clicks feed its input.
    this.node.connect(context.destination);
    this.node.port.onmessage = ({ data }) => {
      if (data.type === 'level') { onLevel(data.value); return; }
      if (data.takeId !== this.takeId) return;
      if (data.type === 'samples' && this.capturing) this.chunks.push(data.samples);
      else if (data.type === 'done' && this.finish) {
        clearTimeout(this.timeout);
        const samples = new Float32Array(this.chunks.reduce((count, chunk) => count + chunk.length, 0));
        let offset = 0;
        for (const chunk of this.chunks) { samples.set(chunk, offset); offset += chunk.length; }
        const finish = this.finish;
        this.finish = this.fail = null;
        this.chunks = []; this.capturing = false;
        finish({ samples, firstFrame: data.firstFrame ?? null });
      }
    };
    this.node.onprocessorerror = () => onError(new Error('Microphone processing stopped. Your kept layers are still here.'));
    stream.getAudioTracks().forEach((track) => { track.onended = () => onError(new Error('The microphone disconnected. Reconnect it to try again.')); });
  }

  get isCapturing() { return this.capturing; }
  get device() {
    const track = this.stream.getAudioTracks()[0];
    return { deviceId: track?.getSettings().deviceId, label: track?.label || 'Microphone' };
  }
  get inputLatency() { return (this.stream.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number })?.latency; }
  get sampleRate() { return this.context.sampleRate; }
  start(when: number, until?: number) {
    this.chunks = []; this.capturing = true;
    this.node.port.postMessage({
      type: 'start', takeId: ++this.takeId, frame: Math.round(when * this.context.sampleRate),
      endFrame: until === undefined ? undefined : Math.round(until * this.context.sampleRate),
    });
  }
  capture(when: number, until: number): Promise<Capture> {
    this.start(when, until);
    return this.waitForCapture(Math.max(0, until - this.context.currentTime) * 1000 + 3000);
  }
  async stop(): Promise<Float32Array> {
    const result = this.waitForCapture(3000);
    this.node.port.postMessage({ type: 'stop' });
    return (await result).samples;
  }
  private waitForCapture(timeout: number): Promise<Capture> {
    return new Promise((resolve, reject) => {
      this.finish = resolve; this.fail = reject;
      this.timeout = setTimeout(() => this.cancel(new Error('The microphone stopped responding. Your kept layers are still here.')), timeout);
    });
  }
  cancel(reason = new Error('Recording canceled.')) {
    clearTimeout(this.timeout);
    this.node.port.postMessage({ type: 'cancel' });
    this.capturing = false; this.chunks = [];
    this.fail?.(reason);
    this.finish = this.fail = null;
  }
  dispose() {
    this.cancel();
    this.source.disconnect(); this.node.disconnect(); this.node.port.close();
    this.stream.getTracks().forEach((track) => { track.onended = null; track.stop(); });
  }
}
