"""FastAPI app: login check, daily limits, validation, and calls to the image worker.

Run locally:  uv run uvicorn app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import secrets
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth import AuthError, SupabaseAuth, User
from app.config import Settings, get_settings
from app.limits import JobGate, LimitError, RateLimiter
from app.presets import ASPECT_RATIOS, get_preset
from app.prompt_enhancer import enhance_prompt
from app.schemas import GenerateRequest, GenerateResponse, Generation, MeResponse, PublicConfig
from app.store import Store, StoreError, SupabaseStore
from app.worker_client import WorkerError, WorkerJob, make_worker

log = logging.getLogger("backend")
bearer = HTTPBearer(auto_error=False)
HISTORY_LIMIT = 50


def create_app(settings: Settings | None = None, store: Store | None = None, worker=None, auth=None) -> FastAPI:
    """Build the app. Tests pass in fake store/worker/auth; normal runs build the real ones."""
    settings = settings or get_settings()
    preset = get_preset(settings.model_id)  # fails fast on an unsupported MODEL_ID

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.store = store or SupabaseStore(
            settings.supabase_url, settings.supabase_secret_key, settings.storage_bucket
        )
        app.state.auth = auth or SupabaseAuth(settings)
        app.state.worker = worker or make_worker(settings)
        log.info("worker_mode=%s model=%s daily_limit=%s", settings.worker_mode, preset.model_id, settings.daily_limit)
        yield
        await app.state.store.close()

    app = FastAPI(title="Image Chat API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type"],
    )
    rate_limiter = RateLimiter(settings.rate_limit_per_minute)
    gate = JobGate(settings.max_concurrent_jobs, settings.queue_wait_seconds)

    @app.exception_handler(LimitError)
    async def _limit_error(request: Request, exc: LimitError):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

    def current_user(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer)) -> User:
        if creds is None:
            raise HTTPException(401, "Please sign in.")
        try:
            return request.app.state.auth.verify(creds.credentials)
        except AuthError as exc:
            log.info("auth rejected: %s", exc)
            raise HTTPException(401, "Your session has expired. Please sign in again.") from None

    def to_generation(row: dict, urls: dict[str, str]) -> Generation:
        return Generation(
            id=str(row["id"]),
            prompt=row["prompt"],
            prompt_used=row["prompt_used"],
            aspect_ratio=row["aspect_ratio"],
            width=row["width"],
            height=row["height"],
            seed=row["seed"],
            model=row["model"],
            image_url=urls.get(row["image_path"]),
            created_at=str(row["created_at"]),
        )

    @app.get("/health")
    async def health():
        return {"ok": True}

    @app.get("/api/config", response_model=PublicConfig)
    async def public_config():
        return PublicConfig(
            model=preset.model_id,
            model_license=preset.license,
            commercial_use=preset.commercial_use,
            aspect_ratios=ASPECT_RATIOS,
            max_prompt_chars=settings.max_prompt_chars,
            daily_limit=settings.daily_limit,
            worker_mode=settings.worker_mode,
        )

    @app.get("/api/me", response_model=MeResponse)
    async def me(request: Request, user: User = Depends(current_user)):
        used = await request.app.state.store.used_today(user.id)
        return MeResponse(id=user.id, email=user.email, used_today=used, daily_limit=settings.daily_limit)

    @app.get("/api/history", response_model=list[Generation])
    async def history(request: Request, user: User = Depends(current_user)):
        store: Store = request.app.state.store
        rows = await store.list_generations(user.id, HISTORY_LIMIT)
        urls = await store.sign_urls([r["image_path"] for r in rows], settings.signed_url_ttl_seconds)
        return [to_generation(r, urls) for r in rows]

    @app.post("/api/generate", response_model=GenerateResponse)
    async def generate(body: GenerateRequest, request: Request, user: User = Depends(current_user)):
        if len(body.prompt) > settings.max_prompt_chars:
            raise HTTPException(422, f"Prompt is too long (max {settings.max_prompt_chars} characters).")
        rate_limiter.check(user.id)
        store: Store = request.app.state.store

        async with gate.job(user.id):
            used = await store.claim_generation(user.id, settings.daily_limit)
            if used is None:
                raise HTTPException(429, f"Daily limit reached ({settings.daily_limit} images). Try again tomorrow (UTC).")

            width, height = ASPECT_RATIOS[body.aspect_ratio]
            prompt_used = enhance_prompt(body.prompt) if body.enhance else body.prompt
            seed = body.seed if body.seed is not None else secrets.randbelow(2**32)
            job = WorkerJob(
                prompt=prompt_used,
                width=width,
                height=height,
                steps=settings.default_steps or preset.steps,
                guidance=settings.default_guidance if settings.default_guidance is not None else preset.guidance,
                seed=seed,
                model_id=preset.model_id,
                max_sequence_length=preset.max_sequence_length,
            )
            try:
                result = await request.app.state.worker.generate(job)
                path = f"{user.id}/{uuid.uuid4().hex}.jpg"
                await store.save_image(path, result.image, result.content_type)
                row = await store.insert_generation(
                    {
                        "user_id": user.id,
                        "prompt": body.prompt,
                        "prompt_used": prompt_used,
                        "model": preset.model_id,
                        "aspect_ratio": body.aspect_ratio,
                        "width": width,
                        "height": height,
                        "steps": job.steps,
                        "guidance": job.guidance,
                        "seed": seed,
                        "image_path": path,
                    }
                )
            except (WorkerError, StoreError) as exc:
                # The user should not lose an image from today's allowance for our failure.
                await store.release_generation(user.id)
                log.error("generation failed for %s: %s", user.id, exc)
                raise HTTPException(502, "Image generation failed. Please try again.") from None

        urls = await store.sign_urls([row["image_path"]], settings.signed_url_ttl_seconds)
        return GenerateResponse(generation=to_generation(row, urls), used_today=used, daily_limit=settings.daily_limit)

    return app


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

# `uvicorn app.main:app` serves this. Tests build their own app with create_app().
try:
    app = create_app()
except ValueError as exc:  # e.g. an unsupported MODEL_ID: show a clear message, not a stack trace
    raise SystemExit(f"Configuration error: {exc}") from None
