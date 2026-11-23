import { decodeSong, wav16 } from '../src/ui/audio.ts';

const $ = (id: string) => document.getElementById(id)!;
const params = new URLSearchParams(location.search);
const workerUrls = {
  'gpu-mask-fused': new URL('./hybrid-fused.worker.ts', import.meta.url),
  'wide-half': new URL('./hybrid-wide.worker.ts', import.meta.url),
  padded: new URL('./hybrid-padded.worker.ts', import.meta.url),
  'grouped-padded': new URL('./hybrid-grouped.worker.ts', import.meta.url),
  'staged-cpu': new URL('./staged.worker.ts', import.meta.url),
};
const env = { userAgent: navigator.userAgent, crossOriginIsolated, hardwareConcurrency: navigator.hardwareConcurrency };
$('env').textContent = JSON.stringify(env);
const select = (id: string) => $(id) as HTMLSelectElement;
for (const id of ['variant', 'length', 'passes']) {
  const value = params.get(id);
  if (value && [...select(id).options].some(option => option.value === value)) select(id).value = value;
}
let worker: Worker | undefined;
let generation = 0;
let busy = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const objectUrls: string[] = [];
function controls(value: boolean) {
  busy = value;
  document.querySelectorAll('select').forEach(el => el.disabled = value);
  ($('run') as HTMLButtonElement).disabled = value;
  ($('cancel') as HTMLButtonElement).disabled = !value;
}
function say(text: string) {
  $('status').textContent = text;
  $('log').textContent += text + '\n';
}
async function write(name: string, body: BodyInit) {
  const response = await fetch('/result?name=' + encodeURIComponent(name), { method: 'POST', body });
  if (!response.ok) throw new Error(`Could not save ${name}: HTTP ${response.status}`);
}
function finish() {
  clearTimeout(timer);
  worker?.terminate();
  worker = undefined;
  controls(false);
}
$('cancel').onclick = () => { generation++; finish(); say('Cancelled. Previously saved results remain on disk.'); };
$('run').onclick = async () => {
  if (busy) return;
  const id = ++generation;
  const variant = select('variant').value as keyof typeof workerUrls;
  const length = Number(select('length').value);
  const passes = Number(select('passes').value);
  const tag = params.get('tag') || 'run-' + Date.now();
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,80}$/.test(tag)) { say('Use an alphanumeric tag of at most 81 characters.'); return; }
  const record = (event: object) => write(tag + '.jsonl', JSON.stringify({ at: new Date().toISOString(), variant, length, ...event }) + '\n');
  controls(true);
  $('log').textContent = '';
  $('audio').replaceChildren();
  objectUrls.splice(0).forEach(url => URL.revokeObjectURL(url));
  document.title = `RoFormer checkpoint · ${variant} · ${length}s`;
  try {
    await record({ event: 'environment', ...env });
    const response = await fetch('/fixtures/vocals.wav');
    if (!response.ok) throw new Error('Prepare the local vocal fixture first');
    const audio = await decodeSong(await response.blob());
    if (audio[0].length < 44100 * length) throw new Error('The prepared fixture is shorter than the selected excerpt');
    if (id !== generation) return;
    await record({ event: 'start', passes });
    worker = new Worker(workerUrls[variant], { type: 'module' });
    timer = setTimeout(() => { if (id === generation) { generation++; finish(); say('Stopped after 30 minutes. Check the saved trace.'); } }, 30 * 60 * 1000);
    worker.onerror = event => { if (id === generation) { finish(); say('Worker error: ' + event.message); void record({ event: 'worker-error', message: event.message }); } };
    let queue = Promise.resolve();
    worker.onmessage = ({ data }) => {
      queue = queue.then(async () => {
        if (id !== generation) return;
        const { stems, ...event } = data;
        await record({ ...event, stems: stems ? Object.keys(stems) : undefined });
        if (id !== generation) return;
        if (data.event === 'done') {
          // Inference timings stop in the worker, before WAV encoding or disk writes.
          for (const [stem, channels] of Object.entries(stems)) {
            if (id !== generation) return;
            const blob = wav16(channels as [Float32Array, Float32Array]);
            await write(`${tag}-${variant}-${length}-${stem}.wav`, blob);
            const heading = document.createElement('h2'); heading.textContent = stem;
            const player = document.createElement('audio'); player.controls = true;
            const url = URL.createObjectURL(blob); objectUrls.push(url); player.src = url;
            $('audio').append(heading, player);
          }
          await record({ event: 'saved' });
          finish(); say('Completed ' + JSON.stringify(data.timings));
        } else if (data.event === 'error' || data.event === 'gpu-device-lost' && data.reason !== 'destroyed') {
          finish(); say('Failed: ' + (data.message || data.reason));
        } else if (data.event === 'status') say(data.text);
        else say(data.event + ': ' + JSON.stringify(event).slice(0, 1000));
      }).catch(error => { if (id === generation) { finish(); say(String(error)); } });
    };
    worker.postMessage({ variant, length, passes, audio });
  } catch (error) { if (id === generation) { finish(); say(String(error)); } }
};
// Opt-in only, and never automatically repeat after a development reload.
const autorunKey = 'checkpoint-started-' + location.search;
if (params.get('autorun') === '1' && !sessionStorage.getItem(autorunKey)) {
  sessionStorage.setItem(autorunKey, '1');
  ($('run') as HTMLButtonElement).click();
}
