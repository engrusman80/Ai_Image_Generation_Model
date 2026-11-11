"""Loads a FLUX model once and turns jobs into JPEG images.

Memory modes (WORKER_MEMORY):
- gpu:     everything on the GPU. Fastest. Needs ~16 GB+ for klein-4B (use on RunPod 24 GB+).
- offload: each part (text encoder, transformer, VAE) moves to the GPU when used. ~14 GB GPUs.
- stream:  weights stay in system RAM and stream to the GPU layer by layer. Full quality on
           8 GB GPUs, but slower. Needs ~20 GB free RAM.
- nf4:     transformer and text encoder compressed to 4-bit. Fits small GPUs, faster than
           stream, slightly lower quality.
- auto:    picks gpu / offload / stream from the GPU's memory.
"""

from __future__ import annotations

import io
import logging
import time
from dataclasses import dataclass

log = logging.getLogger("worker")

JPEG_QUALITY = 92
PIPELINE_CLASSES = {"flux2-klein": "Flux2KleinPipeline", "flux1": "FluxPipeline"}
MEMORY_MODES = ("auto", "gpu", "offload", "stream", "nf4")


def pipeline_kind(model_id: str) -> str:
    name = model_id.lower()
    if "flux.2-klein" in name:
        return "flux2-klein"
    if "flux.1" in name:
        return "flux1"
    raise ValueError(f"unsupported model {model_id!r}: expected a FLUX.2 [klein] or FLUX.1 model")


def pick_memory_mode(vram_gb: float) -> str:
    if vram_gb >= 22:
        return "gpu"
    if vram_gb >= 14:
        return "offload"
    return "stream"


@dataclass
class Job:
    prompt: str
    width: int
    height: int
    steps: int
    guidance: float
    seed: int
    max_sequence_length: int | None = None

    @classmethod
    def from_input(cls, data: dict) -> "Job":
        """Validate a job dict (the same format the backend and RunPod send)."""
        prompt = str(data.get("prompt", "")).strip()
        if not prompt or len(prompt) > 4000:
            raise ValueError("prompt must be 1-4000 characters")
        width, height = int(data.get("width", 1024)), int(data.get("height", 1024))
        for side in (width, height):
            if side % 16 or not 256 <= side <= 2048:
                raise ValueError("width and height must be multiples of 16 between 256 and 2048")
        steps = int(data.get("steps", 4))
        if not 1 <= steps <= 60:
            raise ValueError("steps must be 1-60")
        seed = int(data.get("seed", 0))
        if not 0 <= seed < 2**32:
            raise ValueError("seed must be 0..2^32-1")
        msl = data.get("max_sequence_length")
        return cls(prompt, width, height, steps, float(data.get("guidance", 1.0)), seed, int(msl) if msl else None)


class FluxEngine:
    def __init__(self, model_id: str, revision: str | None = None, memory: str = "auto") -> None:
        if memory not in MEMORY_MODES:
            raise ValueError(f"WORKER_MEMORY must be one of {MEMORY_MODES}")
        self.model_id = model_id
        self.revision = revision
        self.kind = pipeline_kind(model_id)
        self.memory = memory
        self.pipe = None
        self.load_seconds = 0.0

    def load(self) -> None:
        if self.pipe is not None:
            return
        import diffusers
        import torch

        if not torch.cuda.is_available():
            raise RuntimeError("No CUDA GPU found. Check the NVIDIA driver and that PyTorch is the CUDA build.")
        vram_gb = torch.cuda.get_device_properties(0).total_memory / 1024**3
        if self.memory == "auto":
            self.memory = pick_memory_mode(vram_gb)
        log.info("loading %s (%s) on %s, %.1f GB VRAM, memory mode %s",
                 self.model_id, self.revision or "latest", torch.cuda.get_device_name(0), vram_gb, self.memory)

        start = time.perf_counter()
        cls = getattr(diffusers, PIPELINE_CLASSES[self.kind])
        kwargs: dict = {"torch_dtype": torch.bfloat16, "revision": self.revision}
        if self.memory == "nf4":
            kwargs["quantization_config"] = diffusers.PipelineQuantizationConfig(
                quant_backend="bitsandbytes_4bit",
                quant_kwargs={"load_in_4bit": True, "bnb_4bit_quant_type": "nf4", "bnb_4bit_compute_dtype": torch.bfloat16},
                components_to_quantize=["transformer", "text_encoder"],
            )
        pipe = cls.from_pretrained(self.model_id, **kwargs)

        if self.memory == "gpu":
            pipe.to("cuda")
        elif self.memory in ("offload", "nf4"):
            pipe.enable_model_cpu_offload()
        else:  # stream
            pipe.enable_group_offload(
                onload_device=torch.device("cuda"),
                offload_device=torch.device("cpu"),
                offload_type="leaf_level",
                use_stream=True,
                low_cpu_mem_usage=True,  # pin layers on demand instead of all at once
            )
        self.pipe = pipe
        self.load_seconds = time.perf_counter() - start
        log.info("model ready in %.0f s", self.load_seconds)

    def generate(self, job: Job) -> dict:
        """Run one job. Returns the JPEG bytes plus timing and memory information."""
        import torch

        self.load()
        kwargs = dict(
            prompt=job.prompt,
            width=job.width,
            height=job.height,
            num_inference_steps=job.steps,
            guidance_scale=job.guidance,
            # A CPU generator gives the same image for the same seed whatever the memory mode.
            generator=torch.Generator("cpu").manual_seed(job.seed),
        )
        if self.kind == "flux1" and job.max_sequence_length:
            kwargs["max_sequence_length"] = job.max_sequence_length

        torch.cuda.reset_peak_memory_stats()
        start = time.perf_counter()
        image = self.pipe(**kwargs).images[0]
        seconds = time.perf_counter() - start

        buf = io.BytesIO()
        image.convert("RGB").save(buf, format="JPEG", quality=JPEG_QUALITY)
        return {
            "image": buf.getvalue(),
            "seconds": round(seconds, 2),
            "peak_vram_gb": round(torch.cuda.max_memory_allocated() / 1024**3, 2),
            "memory_mode": self.memory,
        }
