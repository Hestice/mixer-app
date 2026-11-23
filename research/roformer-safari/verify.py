"""Verify graph structure, masked context and exact preservation of original initializers."""
import argparse
import hashlib
import json
from pathlib import Path

import numpy as np
import onnx
from onnx import numpy_helper

MODEL_SHA256 = "3246267f38659149f8fc3a6ee33b6533c66ddf5236ced3b0a732630f5222da36"


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--work-dir", type=Path, required=True)
    args = p.parse_args()
    root = args.work_dir.resolve() / "splitwave/models"
    source = root / "mel_roformer_karaoke_fp16.onnx"
    h = hashlib.sha256()
    with source.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    if h.hexdigest() != MODEL_SHA256:
        raise SystemExit("Original model checksum mismatch")
    original = {t.name: t.SerializeToString() for t in onnx.load(source).graph.initializer}
    seen = set()
    files = [root / "mel-staged-fine/stage-0.onnx", *sorted((root / "mel-grouped-padded").glob("*.onnx")), root / "mel-gpu-mask-fused/mask.onnx"]
    if len(files) != 14:
        raise SystemExit("Expected front, twelve transformer blocks and fused mask")
    for path in files:
        model = onnx.load(path)
        onnx.checker.check_model(model)
        for tensor in model.graph.initializer:
            if tensor.name in original:
                if tensor.SerializeToString() != original[tensor.name]:
                    raise SystemExit(f"Original tensor changed: {tensor.name}")
                seen.add(tensor.name)
    if seen != set(original) or len(seen) != 436:
        raise SystemExit(f"Original initializer coverage differs: {len(seen)}/436")
    manifest = json.loads((root / "mel-micro-padded/manifest.json").read_text())
    for entry in manifest:
        if entry["axis"] != "time":
            continue
        model = onnx.load(root / "mel-micro-padded" / entry["file"])
        tensors = {t.name: numpy_helper.to_array(t) for t in model.graph.initializer}
        mask = tensors["__aligned_attention_mask"]
        if mask.shape != (1, 1, 1, 832) or not np.all(mask[..., :801] == 0) or not np.isneginf(mask[..., 801:]).all():
            raise SystemExit("Padding mask must keep 801 real keys and exclude all added keys")
    print("Verified ONNX graphs, 801 real attention positions and 436/436 unchanged initializers.")


if __name__ == "__main__":
    main()
