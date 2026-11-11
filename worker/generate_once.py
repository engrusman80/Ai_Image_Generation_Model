"""Quick test: generate one image straight from the command line, without the web app.

    .venv\\Scripts\\python generate_once.py "a red fox in fresh snow at sunrise" --seed 1
"""

from __future__ import annotations

import argparse
import base64
import json
import logging
from pathlib import Path

from flux_worker import settings
from flux_worker.engine import FluxEngine
from flux_worker.jobs import run_job

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

parser = argparse.ArgumentParser()
parser.add_argument("prompt")
parser.add_argument("--width", type=int, default=1024)
parser.add_argument("--height", type=int, default=1024)
parser.add_argument("--steps", type=int, default=4)
parser.add_argument("--guidance", type=float, default=1.0)
parser.add_argument("--seed", type=int, default=0)
parser.add_argument("--memory", default=settings.MEMORY_MODE)
parser.add_argument("--out", type=Path, default=Path("outputs/test.png"))
args = parser.parse_args()

engine = FluxEngine(settings.MODEL_ID, settings.MODEL_REVISION, args.memory)
engine.load()
out = run_job(engine, vars(args) | {"out": None, "memory": None})
args.out.parent.mkdir(parents=True, exist_ok=True)
args.out.write_bytes(base64.b64decode(out.pop("image_base64")))
print(json.dumps(out | {"file": str(args.out.resolve()), "load_seconds": round(engine.load_seconds, 1)}, indent=2))
