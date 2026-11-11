"""Turns a request in the RunPod format ({"input": {...}}) into a response with a base64 JPEG.

Used by both the local server and the RunPod handler, so they behave exactly the same.
"""

from __future__ import annotations

import base64
import logging

from flux_worker.engine import FluxEngine, Job

log = logging.getLogger("worker")


def run_job(engine: FluxEngine, job_input: dict) -> dict:
    job = Job.from_input(job_input)
    if job_input.get("model_id") and job_input["model_id"] != engine.model_id:
        raise ValueError(f"this worker runs {engine.model_id}, not {job_input['model_id']}")
    result = engine.generate(job)
    log.info("image %dx%d, %d steps, %.1f s, peak VRAM %.2f GB",
             job.width, job.height, job.steps, result["seconds"], result["peak_vram_gb"])
    return {
        "image_base64": base64.b64encode(result["image"]).decode("ascii"),
        "content_type": "image/jpeg",
        "seed": job.seed,
        "width": job.width,
        "height": job.height,
        "seconds": result["seconds"],
        "peak_vram_gb": result["peak_vram_gb"],
        "memory_mode": result["memory_mode"],
    }
