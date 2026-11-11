"""All settings come from environment variables (or backend/.env). See backend/.env.example."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        # Empty values (e.g. "DEFAULT_STEPS=") mean "use the default".
        env_file=".env", env_file_encoding="utf-8", extra="ignore", env_ignore_empty=True, protected_namespaces=()
    )

    # --- Supabase (login, database, image storage) ---
    supabase_url: str = ""
    # Secret key (sb_secret_...). Server only. Never put it in the frontend.
    supabase_secret_key: str = ""
    # Only needed for older Supabase projects that still sign logins with the legacy HS256 secret.
    supabase_jwt_secret: str = ""
    storage_bucket: str = "images"
    signed_url_ttl_seconds: int = 3600

    # Browser origins allowed to call this API, comma separated.
    frontend_origins: str = "http://localhost:3000"

    # --- Image worker ---
    worker_mode: Literal["mock", "local", "runpod"] = "mock"
    model_id: str = "black-forest-labs/FLUX.2-klein-4B"
    # Leave empty to use the model's recommended values (see presets.py).
    default_steps: int | None = None
    default_guidance: float | None = None
    worker_timeout_seconds: int = 300
    mock_delay_seconds: float = 1.0
    local_worker_url: str = "http://127.0.0.1:8001"
    runpod_endpoint_id: str = ""
    runpod_api_key: str = ""

    # --- Limits (cost protection) ---
    daily_limit: int = 10  # images per user per UTC day
    max_concurrent_jobs: int = 2  # images generated at the same time, across all users
    queue_wait_seconds: int = 60  # how long a request may wait for a free slot
    rate_limit_per_minute: int = 5  # requests per user per minute
    max_prompt_chars: int = 1000

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip().rstrip("/") for o in self.frontend_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
