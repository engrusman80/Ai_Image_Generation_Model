"""Worker settings from environment variables (or worker/.env). See worker/.env.example."""

from __future__ import annotations

import os
from pathlib import Path

WORKER_DIR = Path(__file__).resolve().parents[1]


def load_env_file(path: Path = WORKER_DIR / ".env") -> None:
    """Read KEY=VALUE lines into os.environ without overriding variables that are already set."""
    if not path.is_file():
        return
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            if value.strip():
                os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


load_env_file()

DEFAULT_MODEL_ID = "black-forest-labs/FLUX.2-klein-4B"
# Exact Hugging Face commits we tested, so a repo update can't silently change the model.
PINNED_REVISIONS = {
    "black-forest-labs/FLUX.2-klein-4B": "e7b7dc27f91deacad38e78976d1f2b499d76a294",
}

MODEL_ID = os.environ.get("MODEL_ID", DEFAULT_MODEL_ID)
MODEL_REVISION = os.environ.get("MODEL_REVISION") or PINNED_REVISIONS.get(MODEL_ID)
# auto | gpu | offload | stream | nf4  (see engine.py)
MEMORY_MODE = os.environ.get("WORKER_MEMORY", "auto")
