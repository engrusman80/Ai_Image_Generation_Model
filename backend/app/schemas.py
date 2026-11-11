"""Request and response shapes of the API."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator

AspectRatio = Literal["1:1", "4:3", "16:9", "9:16"]


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)  # the configurable limit is checked in the route
    aspect_ratio: AspectRatio = "1:1"
    enhance: bool = False
    seed: int | None = Field(default=None, ge=0, le=2**32 - 1)

    @field_validator("prompt")
    @classmethod
    def clean_prompt(cls, value: str) -> str:
        # Drop control characters and collapse whitespace.
        value = "".join(ch if ch.isprintable() else " " for ch in value)
        value = " ".join(value.split())
        if not value:
            raise ValueError("prompt must not be empty")
        return value


class Generation(BaseModel):
    id: str
    prompt: str
    prompt_used: str
    aspect_ratio: str
    width: int
    height: int
    seed: int
    model: str
    image_url: str | None
    created_at: str


class GenerateResponse(BaseModel):
    generation: Generation
    used_today: int
    daily_limit: int


class MeResponse(BaseModel):
    id: str
    email: str | None
    used_today: int
    daily_limit: int


class PublicConfig(BaseModel):
    model: str
    model_license: str
    commercial_use: bool
    aspect_ratios: dict[str, tuple[int, int]]
    max_prompt_chars: int
    daily_limit: int
    worker_mode: str
