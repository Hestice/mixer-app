"""Regenerate the synthesized After hours stems and waveform data.

Four 4/4 bars at 84 BPM: Dmaj7, Bm7, Gmaj7, Aadd9.
guitar-live.wav is the mastered recording. The synthesized guitar is retained for saved songs.
"""
from pathlib import Path
from array import array
import math
import json
import random
import wave

RATE = 22050
BEAT = 60 / 84
LENGTH = int(round(16 * BEAT * RATE))
ROOT = Path(__file__).resolve().parents[1] / 'apps/web/public/audio'
ROOT.mkdir(parents=True, exist_ok=True)
rng = random.Random(84)

with wave.open(str(ROOT / 'guitar-live.wav'), 'rb') as guitar_file:
    if (guitar_file.getnchannels(), guitar_file.getsampwidth(), guitar_file.getframerate(), guitar_file.getnframes()) != (1, 2, RATE, LENGTH):
        raise ValueError('The recorded guitar must be mono PCM16 at 22.05 kHz and match the After hours loop length.')
    guitar_pcm = array('h', guitar_file.readframes(LENGTH))

def hz(midi):
    return 440 * 2 ** ((midi - 69) / 12)

def tone(data, start, midi, duration, gain, kind='pluck'):
    offset = int(start * RATE)
    frequency = hz(midi)
    for n in range(int(duration * RATE)):
        t = n / RATE
        if kind == 'pluck':
            envelope = (1 - math.exp(-t * 180)) * math.exp(-t * 3.2)
            value = sum(math.sin(2 * math.pi * frequency * h * t) * math.exp(-t * h * 1.2) / h ** 1.4 for h in range(1, 6))
        else:
            envelope = min(1, t / .04) * min(1, max(0, (duration - t) / .25)) * math.exp(-t * 1.1)
            value = math.sin(2 * math.pi * frequency * t) + .22 * math.sin(2 * math.pi * frequency * 2 * t)
        data[(offset + n) % LENGTH] += gain * envelope * value

stems = {name: [0.0] * LENGTH for name in ['guitar', 'keys', 'rhythm', 'harmony']}
chords = [[50,57,61,66], [47,54,57,62], [43,50,54,59], [45,52,59,61]]
for bar, chord in enumerate(chords):
    start = bar * 4 * BEAT
    for step, note_index in enumerate([0,2,1,3,1,2,3,2]):
        tone(stems['guitar'], start + step * BEAT / 2, chord[note_index] + 12, 1.7, .16)
    for beat in [0, 2.5]:
        for i, note in enumerate(chord):
            tone(stems['keys'], start + beat * BEAT + i * .009, note, 1.7, .065, 'keys')
    for step, note in enumerate([chord[2] + 12, chord[3] + 12, chord[1] + 24]):
        tone(stems['harmony'], start + [0.5, 2, 3][step] * BEAT, note, .9, .11, 'keys')
    for beat in range(4):
        offset = int((start + beat * BEAT) * RATE)
        for n in range(int(.16 * RATE)):
            t = n / RATE
            kick = math.sin(2 * math.pi * (49 * t + 4 * (1 - math.exp(-t * 35)))) * math.exp(-t * 28) * (.3 if beat % 2 == 0 else .08)
            brush = (rng.random() * 2 - 1) * math.exp(-t * 40) * (.14 if beat % 2 else .025)
            stems['rhythm'][(offset + n) % LENGTH] += kick + brush
    for half in range(8):
        offset = int((start + (half + .5) * BEAT / 2) * RATE)
        for n in range(int(.04 * RATE)):
            stems['rhythm'][(offset + n) % LENGTH] += (rng.random() * 2 - 1) * math.exp(-n / RATE * 100) * .035

for name, data in stems.items():
    samples = array('h', (int(max(-.95, min(.95, sample)) * 32767) for sample in data))
    with wave.open(str(ROOT / f'{name}.wav'), 'wb') as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(RATE)
        output.writeframes(samples.tobytes())
    print(f'{name}: {LENGTH} samples, {LENGTH / RATE:.4f}s')

peaks = {}
stems['guitar-live'] = [sample / 32768 for sample in guitar_pcm]
for name, data in stems.items():
    values = []
    for bucket in range(64):
        start = bucket * LENGTH // 64
        stop = (bucket + 1) * LENGTH // 64
        values.append(math.sqrt(sum(value * value for value in data[start:stop]) / (stop - start)))
    maximum = max(values) or 1
    peaks[name] = [round(value / maximum, 3) for value in values]
(ROOT.parents[1] / 'src/lib/demo-peaks.json').write_text(json.dumps(peaks))
