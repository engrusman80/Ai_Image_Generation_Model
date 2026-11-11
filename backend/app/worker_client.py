"""Sends a generation job to the image worker selected by WORKER_MODE.

- mock:   draws a placeholder image instantly (free, for testing the app).
- local:  calls the worker running on this laptop (Phase 2).
- runpod: calls the RunPod Serverless endpoint (Phase 3).

All modes use the same job format, so the frontend and backend never change between them.
"""

from __future__ import annotations

import asyncio
import base64
import binascii
import hashlib
import io
import textwrap
from dataclasses import asdict, dataclass

import httpx
from PIL import Image, ImageDraw, ImageFont

from app.config import Settings



@dataclass(frozen=True)
class WorkerJob:
    prompt: str
    width: int
    height: int
    steps: int
    guidance: float
    seed: int
    model_id: str
    max_sequence_length: int | None = None

    def payload(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class WorkerResult:
    image: bytes
    content_type: str


class WorkerError(Exception):
    pass


class MockWorker:
    def __init__(self, delay_seconds: float = 1.0) -> None:
        self.delay_seconds = delay_seconds

    async def generate(self, job: WorkerJob) -> WorkerResult:
        await asyncio.sleep(self.delay_seconds)  # pretend to work, so loading states are visible
        return WorkerResult(_placeholder_png(job), "image/png")


class RunSyncWorker:
    """Calls a worker that speaks RunPod's /runsync format: {"input": job} -> {"status", "output"}.

    The local laptop worker (worker/local_server.py) uses the same format, so Phase 3 only changes
    the URL and adds an API key.
    """

    def __init__(self, url: str, timeout_seconds: float, headers: dict | None = None, transport=None) -> None:
        self.url = url
        self.timeout = timeout_seconds
        self.headers = headers or {}
        self.transport = transport  # tests pass a fake transport

    async def generate(self, job: WorkerJob) -> WorkerResult:
        try:
            async with httpx.AsyncClient(timeout=self.timeout, transport=self.transport) as client:
                resp = await client.post(self.url, json={"input": job.payload()}, headers=self.headers)
        except httpx.TimeoutException:
            raise WorkerError(f"worker did not answer within {self.timeout:.0f} s") from None
        except httpx.HTTPError as exc:
            raise WorkerError(f"cannot reach the worker at {self.url}: {exc}") from None
        if resp.is_error:
            raise WorkerError(f"worker HTTP {resp.status_code}: {resp.text[:300]}")
        body = resp.json()
        if body.get("status") != "COMPLETED":
            raise WorkerError(f"worker status {body.get('status')}: {body.get('error')}")
        output = body.get("output") or {}
        try:
            image = base64.b64decode(output["image_base64"], validate=True)
        except (KeyError, binascii.Error):
            raise WorkerError("worker returned no valid image") from None
        return WorkerResult(image, output.get("content_type", "image/png"))


class NotReadyWorker:
    def __init__(self, mode: str, phase: int) -> None:
        self.mode, self.phase = mode, phase

    async def generate(self, job: WorkerJob) -> WorkerResult:
        raise WorkerError(f"WORKER_MODE={self.mode} is added in Phase {self.phase}; use WORKER_MODE=mock or local")


def make_worker(settings: Settings):
    if settings.worker_mode == "mock":
        return MockWorker(settings.mock_delay_seconds)
    if settings.worker_mode == "local":
        url = f"{settings.local_worker_url.rstrip('/')}/runsync"
        return RunSyncWorker(url, settings.worker_timeout_seconds)
    return NotReadyWorker("runpod", 3)


def _placeholder_png(job: WorkerJob) -> bytes:
    """A colourful gradient (different per seed) with the prompt written on it."""
    digest = hashlib.sha256(f"{job.seed}".encode()).digest()
    top, bottom = digest[:3], digest[3:6]
    img = Image.new("RGB", (job.width, job.height))
    draw = ImageDraw.Draw(img)
    for y in range(job.height):
        t = y / max(1, job.height - 1)
        color = tuple(int(a + (b - a) * t) for a, b in zip(top, bottom))
        draw.line([(0, y), (job.width, y)], fill=color)

    font = ImageFont.load_default(size=max(18, job.width // 32))
    lines = ["MOCK IMAGE", ""] + textwrap.wrap(job.prompt, width=40)[:12] + ["", f"{job.width}x{job.height}  seed {job.seed}"]
    text = "\n".join(lines)
    box = draw.multiline_textbbox((0, 0), text, font=font, spacing=8, align="center")
    x = (job.width - (box[2] - box[0])) / 2
    y = (job.height - (box[3] - box[1])) / 2
    draw.multiline_text((x + 2, y + 2), text, font=font, fill=(0, 0, 0), spacing=8, align="center")
    draw.multiline_text((x, y), text, font=font, fill=(255, 255, 255), spacing=8, align="center")

    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
