"""Local image worker for WORKER_MODE=local. Mimics RunPod's /runsync API on this laptop.

Run (from the worker folder):
    .venv\\Scripts\\python local_server.py

It only listens on 127.0.0.1, so other computers can't use your GPU.
"""

from __future__ import annotations

import asyncio
import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool

from flux_worker import settings
from flux_worker.engine import FluxEngine
from flux_worker.jobs import run_job

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("worker")

engine = FluxEngine(settings.MODEL_ID, settings.MODEL_REVISION, settings.MEMORY_MODE)
gpu_lock = asyncio.Lock()  # one image at a time on the GPU


@asynccontextmanager
async def lifespan(app: FastAPI):
    await run_in_threadpool(engine.load)  # load once at start, so the first image isn't slower
    yield


app = FastAPI(title="Local FLUX worker", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"ready": engine.pipe is not None, "model": engine.model_id, "memory_mode": engine.memory}


@app.post("/runsync")
async def runsync(body: dict):
    job_input = body.get("input") or {}
    async with gpu_lock:
        try:
            output = await run_in_threadpool(run_job, engine, job_input)
        except ValueError as exc:
            return {"status": "FAILED", "error": f"invalid job: {exc}"}
        except Exception as exc:  # e.g. CUDA out of memory: report it, keep the server alive
            log.exception("generation failed")
            return {"status": "FAILED", "error": f"{type(exc).__name__}: {exc}"}
    return {"status": "COMPLETED", "output": output}


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ.get("WORKER_PORT", "8001")))
