# RoFormer in Safari: research checkpoint

23 November 2026. This folder preserves the local lead/backing-vocal separation experiment. It does **not** enable RoFormer in the app, change production dependencies, or select a paid feature's model.

The working path keeps the original model's weights and full audio context. It uses CPU/WASM for the front stage and WebGPU for grouped transformer blocks and a fused mask stage. Input audio and inferred stems stay on the computer.

## Results

Test machine: M3 MacBook Air, 16 GB, native Safari 27.2. Runtime: ONNX Runtime Web 1.31.1. Input: the same saved SCNet vocal stem from *Linger*, 01:45–02:09. These are additional lead/backing split times; initial SCNet extraction, internet downloads and initial runtime bootstrap are excluded. Stage preparation, initialization, inference and reconstruction are included.

| Full 24-second excerpt | Time |
| --- | ---: |
| Earlier staged CPU path | 11:13 |
| Earlier GPU-assisted path, CPU mask | 3:55 |
| Masked padding + grouped batches + fused GPU mask | **3:12** |

The last run took 192.3045 seconds, 18.1% less than the earlier GPU-assisted run. Full-excerpt runs used different desktop conditions. Memory pressure, thermal state and normal desktop use were not controlled; this is not a controlled hardware benchmark.

Sequential eight-second probes help distinguish the changes:

| Path | First pass | Repeat, sessions retained |
| --- | ---: | ---: |
| Unpadded GPU control, CPU mask | 79.3s | 62.5s |
| Masked padding, CPU mask | 83.0s | 48.9s |
| Padding + grouped batches, CPU mask | 88.3s | 40.3s |
| Padding + grouped batches + GPU mask | 73.8s | 26.9s |

These probes also ran under normal desktop conditions. Grouping increased initialization work; repeat-pass gains do not establish the latency of a fresh full-song upload. The full 24-second optimized run additionally fused the mask graph to avoid downloading and uploading a 147,640,320-byte intermediate per chunk.

### Quality and context

- Verified **436/436 original initializer tensors byte-for-byte unchanged** across the optimized graph parts. Added constants describe slices and padding, not learned weights.
- All **801 real frames** remain. Internal attention matrices are padded to 832. Added keys receive negative infinity before softmax; added query outputs are discarded. The original eight-second window, 50% overlap and Hamming blending remain.
- Independent time-attention batches contain four frequency bands. Independent frequency-attention batches contain 89 time positions. This does not shorten the sequence attended to by a real query.
- Stored weights and activation boundaries retain float16. Matrix accumulation uses the runtime's float32 option. There is no additional weight quantization, EQ or denoising.
- Grouping alone produced sample-identical WAVs to the ungrouped padded probe. Moving the mask to GPU retained 57.4 dB lead / 52.5 dB backing agreement against that probe.
- Full optimized output versus the earlier Safari GPU-assisted output: **51.0 dB lead / 47.0 dB backing agreement**. Overall RMS changes were +0.00004 dB / −0.00311 dB. Against the original Chromium GPU reference, agreement was 46.6 / 42.6 dB.
- Output WAVs passed finite-sample, stereo, 44.1 kHz and exact 24-second duration checks.

These are numerical fidelity measurements, **not isolation-accuracy scores against original singers**. The output is not bit-identical across all GPU/CPU paths. Listening remains necessary to judge separation quality. The model produces lead and combined backing vocals, not an individual stem for every harmony singer.

The [checkpoint measurements](results/checkpoint.json) and [successful traces](results/traces) preserve the evidence. Test audio, model binaries and local listening files are excluded from Git. The original listening artifacts remain local to the research session.

## Reproduce locally

Requirements: Git, Node.js compatible with Vite 8, and Python compatible with the pinned packages. The experiment used Python 3.9. Keep this environment separate from the Nx application's dependencies.

The harness uses the DSP, overlap-add and level handling from [Splitwave](https://github.com/PolysheepCodes/Splitwave), pinned to `ff1ae5ea34d8e82c97445cf8f216dfa399503942`. Its source is cloned into the ignored cache rather than vendored. The overlay pins its own runtime dependencies and lockfile. It does not alter `apps/web`.

1. Create a Python environment from the repository root:

   ```bash
   python3 -m venv research/roformer-safari/.venv
   research/roformer-safari/.venv/bin/pip install -r research/roformer-safari/requirements.txt
   ```

2. Supply the original `mel_roformer_karaoke_fp16.onnx` from the [reference model collection](https://huggingface.co/TheDailyOWO/splitwave-models/tree/main). Preparation refuses any checksum other than:

   ```text
   3246267f38659149f8fc3a6ee33b6533c66ddf5236ced3b0a732630f5222da36
   ```

   Supply your own mono/stereo **44.1 kHz vocal WAV**, already isolated from the instrumental. To repeat the measured input, use the same SCNet vocal excerpt; substituting the original mix changes the experiment. No audio is bundled in this PR.

3. Prepare the reference source, model graphs and local excerpt:

   ```bash
   research/roformer-safari/.venv/bin/python research/roformer-safari/prepare.py \
     --model /absolute/path/mel_roformer_karaoke_fp16.onnx \
     --vocals /absolute/path/vocals.wav \
     --start 0 --duration 24
   ```

   This clones only the pinned reference repository, verifies the source model, runs the exporters, verifies the derived graphs and copies the selected audio into the ignored cache. Setup may download source and packages; inference has no external service. Use `--upstream /path/to/reference/checkout` to clone an existing local source instead. Use `--skip-export` only with an already prepared cache; verification still runs.

4. Install and start the isolated harness:

   ```bash
   cd research/roformer-safari/.cache/splitwave/web
   npm ci
   npm run typecheck:checkpoint
   npm run dev
   ```

5. Open **native Safari** at <http://127.0.0.1:5189/compare/index.html>. Choose a path, 8 or 24 seconds, and one or two passes, then press Run. Cancel terminates the worker and leaves prior saved files intact. Do not edit harness files while a benchmark is running.

   An optional one-shot URL is:

   ```text
   http://127.0.0.1:5189/compare/index.html?variant=gpu-mask-fused&length=24&passes=1&tag=optimized-24&autorun=1
   ```

   Automatic runs are opt-in and guarded against repeating after a development reload. After inference, the page provides both audio players. WAVs and JSONL traces are written to `.cache/results/`; a `saved` event follows successful WAV writes. First/repeat timings stop before WAV encoding and saving.

To rerun the structural and weight checks separately:

```bash
research/roformer-safari/.venv/bin/python research/roformer-safari/verify.py \
  --work-dir research/roformer-safari/.cache
```

## What is preserved here

The exporter stages and successful worker implementations are retained as research code. They deliberately remain outside the application rather than becoming a new production backend. The harness page and localhost server were made portable for this checkpoint; they use a supplied local fixture instead of a machine-specific path. Vite binds to loopback, sends isolation headers for multithreaded WASM, and restricts result writes to bounded `.jsonl`/`.wav` payloads from the local origin.

The CPU reference releases each stage between invocations, matching the earlier staged fallback. The GPU paths retain sessions during a run and release them when finished. This difference contributes to the recorded performance and should be considered when comparing paths.

## Remaining limits and next work

Three minutes for a 24-second vocal split is still slow for the intended experience. One optimized 24-second pass and short repeated probes do not establish full-song, mobile Safari or long-running reliability. There is no automatic browser fallback or model-selection policy in the app yet.

Original monolithic GPU execution showed device loss; alternate runtime and shader experiments did not produce a stable full-model path. A later attempt to request GPU-resident outputs failed with a runtime allocator error. The working grouped path therefore uses ordinary CPU outputs between stages. The exact browser/driver cause of the original failures remains unresolved.

Next, measure peak memory and initialization separately, repeat paired full-excerpt runs, and compare additional songs and Safari devices before integrating a backend. Any integration should preserve local saving, existing instrument splitting, cancellation and the user's original audio.
