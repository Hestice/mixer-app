"""Prepare an isolated copy of the pinned reference pipeline and local model assets."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

HERE = Path(__file__).resolve().parent
UPSTREAM = "https://github.com/PolysheepCodes/Splitwave.git"
UPSTREAM_COMMIT = "ff1ae5ea34d8e82c97445cf8f216dfa399503942"
MODEL_NAME = "mel_roformer_karaoke_fp16.onnx"
MODEL_SHA256 = "3246267f38659149f8fc3a6ee33b6533c66ddf5236ced3b0a732630f5222da36"


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--model", required=True, type=Path, help="Original, unmodified fp16 ONNX model")
    p.add_argument("--vocals", required=True, type=Path, help="Local 44.1 kHz mono/stereo vocal WAV")
    p.add_argument("--start", type=float, default=0, help="Excerpt start in seconds")
    p.add_argument("--duration", type=int, choices=[8, 24], default=24)
    p.add_argument("--work-dir", type=Path, default=HERE / ".cache")
    p.add_argument("--upstream", default=UPSTREAM, help="Git URL or local reference checkout to clone")
    p.add_argument("--skip-export", action="store_true", help="Reuse already generated model assets")
    args = p.parse_args()
    if args.start < 0:
        p.error("--start must be nonnegative")
    model = args.model.resolve(strict=True)
    vocals = args.vocals.resolve(strict=True)
    if sha256(model) != MODEL_SHA256:
        p.error("Model checksum differs from the measured checkpoint; refusing to export it")
    import numpy as np
    import soundfile as sf

    info = sf.info(vocals)
    if info.samplerate != 44100 or info.channels not in [1, 2]:
        p.error("Provide a mono/stereo vocal WAV at 44.1 kHz")
    offset, count = round(args.start * 44100), args.duration * 44100
    if offset + count > info.frames:
        p.error("The selected excerpt extends beyond the supplied audio")
    samples, rate = sf.read(vocals, start=offset, frames=count, always_2d=True, dtype="float32")
    if not np.isfinite(samples).all():
        p.error("Input contains non-finite audio samples")
    if samples.shape[1] == 1:
        samples = np.repeat(samples, 2, axis=1)
    work = args.work_dir.resolve()
    # All private inputs, generated weights and benchmark recordings stay in an ignored cache.
    if work == HERE or HERE in work.parents and HERE / ".cache" not in [work, *work.parents]:
        p.error("Use .cache or a work directory outside the tracked research folder")
    work.mkdir(parents=True, exist_ok=True)
    checkout = work / "splitwave"
    if not checkout.exists():
        subprocess.run(["git", "clone", "--no-hardlinks", args.upstream, str(checkout)], check=True)
        subprocess.run(["git", "-C", str(checkout), "checkout", "--detach", UPSTREAM_COMMIT], check=True)
    actual = subprocess.check_output(["git", "-C", str(checkout), "rev-parse", "HEAD"], text=True).strip()
    if actual != UPSTREAM_COMMIT:
        p.error("Reference checkout is not at the pinned commit; use a fresh work directory")
    if subprocess.run(["git", "-C", str(checkout), "diff", "--quiet", UPSTREAM_COMMIT, "--", "web/src"]).returncode:
        p.error("Reference DSP source has local edits; use a fresh work directory")
    models = checkout / "models"
    models.mkdir(exist_ok=True)
    target = models / MODEL_NAME
    if target.resolve() != model:
        shutil.copy2(model, target)
    env = dict(os.environ, ROFORMER_RESEARCH_ROOT=str(work))
    if not args.skip_export:
        steps = [
            ("split_attention.py", []),
            ("stage_model.py", []),
            ("stage_model.py", ["--fine"]),
            ("microbatch_wide.py", []),
            ("pad_attention.py", []),
            ("group_microbatches.py", ["mel-micro-padded", "mel-grouped-padded"]),
            ("gpu_mask_head.py", []),
            ("fuse_gpu_mask.py", []),
        ]
        for name, extra in steps:
            subprocess.run([sys.executable, str(HERE / "exporters" / name), *extra], env=env, check=True)
    subprocess.run([sys.executable, str(HERE / "verify.py"), "--work-dir", str(work)], check=True)
    web = checkout / "web"
    compare = web / "compare"
    compare.mkdir(exist_ok=True)
    for source in (HERE / "harness").iterdir():
        shutil.copy2(source, web / source.name if source.name == "vite.config.ts" else compare / source.name)
    for source, target_name in [("runtime-package.json", "package.json"), ("runtime-package-lock.json", "package-lock.json")]:
        shutil.copy2(HERE / source, web / target_name)
    fixture = web / "public/fixtures/vocals.wav"
    fixture.parent.mkdir(parents=True, exist_ok=True)
    if offset == 0 and info.frames == count and info.channels == 2 and info.subtype == "PCM_16":
        shutil.copy2(vocals, fixture)
    else:
        sf.write(fixture, samples, rate, subtype="PCM_16")
    (work / "input.json").write_text(json.dumps({
        "referenceCommit": actual,
        "modelSha256": MODEL_SHA256,
        "fixtureSha256": sha256(fixture),
        "sampleRate": 44100,
        "frames": count,
        "startSeconds": args.start,
    }, indent=2) + "\n")
    print(f"Prepared {web}. Run npm ci, then npm run typecheck:checkpoint and npm run dev there.")
    print("Open http://127.0.0.1:5189/compare/index.html in native Safari.")


if __name__ == "__main__":
    main()
