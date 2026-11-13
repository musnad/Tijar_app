#!/usr/bin/env python3
"""Download licensed OPUS-MT (ha↔en) and Apache-2.0 Qwen 0.5B into ./models."""

from __future__ import annotations

import os
from pathlib import Path

from huggingface_hub import snapshot_download

ROOT = Path(__file__).resolve().parent
MODELS = ROOT / "models"

# Dedicated Hausa↔English MT (CC-BY-4.0). Not NLLB.
OPUS = (
    "Helsinki-NLP/opus-mt-en-ha",
    "Helsinki-NLP/opus-mt-ha-en",
)

# Smallest Apache-2.0 Qwen Instruct. 7B does not fit this 8 GB Intel Mac.
QWEN = "Qwen/Qwen2.5-0.5B-Instruct"


def pull(repo_id: str) -> Path:
    dest = MODELS / repo_id.replace("/", "--")
    dest.mkdir(parents=True, exist_ok=True)
    print(f"Downloading {repo_id} → {dest}")
    snapshot_download(repo_id=repo_id, local_dir=str(dest))
    return dest


def main() -> None:
    os.environ.setdefault("HF_HUB_DISABLE_TELEMETRY", "1")
    MODELS.mkdir(parents=True, exist_ok=True)
    for repo in OPUS:
        pull(repo)
    skip_qwen = os.environ.get("TIJAR_SKIP_QWEN", "").strip() in ("1", "true", "yes")
    if skip_qwen:
        print("Skipping Qwen (TIJAR_SKIP_QWEN=1).")
        return
    pull(QWEN)
    print("Done. OPUS-MT is used by server.py. Qwen weights are stored, not loaded on this Mac.")


if __name__ == "__main__":
    main()
