"""Database and image storage.

SupabaseStore talks to Supabase over HTTP with the secret key. MemoryStore keeps everything in
memory and is used by the automated tests.
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Protocol

import httpx


def utc_today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


class StoreError(Exception):
    pass


class Store(Protocol):
    async def claim_generation(self, user_id: str, limit: int) -> int | None: ...
    async def release_generation(self, user_id: str) -> None: ...
    async def used_today(self, user_id: str) -> int: ...
    async def save_image(self, path: str, data: bytes, content_type: str) -> None: ...
    async def insert_generation(self, row: dict[str, Any]) -> dict[str, Any]: ...
    async def list_generations(self, user_id: str, limit: int) -> list[dict[str, Any]]: ...
    async def sign_urls(self, paths: list[str], ttl_seconds: int) -> dict[str, str]: ...
    async def close(self) -> None: ...


class SupabaseStore:
    def __init__(self, url: str, secret_key: str, bucket: str) -> None:
        if not url or not secret_key:
            raise StoreError("Set SUPABASE_URL and SUPABASE_SECRET_KEY in backend/.env (see README)")
        self.url = url.rstrip("/")
        self.bucket = bucket
        # New Supabase keys go in the `apikey` header only, not `Authorization: Bearer`.
        self.http = httpx.AsyncClient(base_url=self.url, headers={"apikey": secret_key}, timeout=30)

    async def _check(self, resp: httpx.Response) -> httpx.Response:
        if resp.is_error:
            raise StoreError(f"Supabase {resp.request.method} {resp.request.url.path} -> {resp.status_code}: {resp.text[:300]}")
        return resp

    async def claim_generation(self, user_id: str, limit: int) -> int | None:
        """Atomically count one image against today's limit. Returns None if the limit is reached."""
        resp = await self._check(
            await self.http.post("/rest/v1/rpc/claim_generation", json={"p_user": user_id, "p_limit": limit})
        )
        return resp.json()

    async def release_generation(self, user_id: str) -> None:
        """Give the image back to today's allowance (used when generation fails)."""
        await self._check(await self.http.post("/rest/v1/rpc/release_generation", json={"p_user": user_id}))

    async def used_today(self, user_id: str) -> int:
        resp = await self._check(
            await self.http.get(
                "/rest/v1/daily_usage",
                params={"select": "count", "user_id": f"eq.{user_id}", "day": f"eq.{utc_today()}"},
            )
        )
        rows = resp.json()
        return rows[0]["count"] if rows else 0

    async def save_image(self, path: str, data: bytes, content_type: str) -> None:
        await self._check(
            await self.http.post(
                f"/storage/v1/object/{self.bucket}/{path}",
                content=data,
                headers={"content-type": content_type, "x-upsert": "false"},
            )
        )

    async def insert_generation(self, row: dict[str, Any]) -> dict[str, Any]:
        resp = await self._check(
            await self.http.post("/rest/v1/generations", json=row, headers={"Prefer": "return=representation"})
        )
        return resp.json()[0]

    async def list_generations(self, user_id: str, limit: int) -> list[dict[str, Any]]:
        resp = await self._check(
            await self.http.get(
                "/rest/v1/generations",
                params={"user_id": f"eq.{user_id}", "order": "created_at.desc", "limit": str(limit)},
            )
        )
        return resp.json()

    async def sign_urls(self, paths: list[str], ttl_seconds: int) -> dict[str, str]:
        """Temporary download links for private images."""
        if not paths:
            return {}
        resp = await self._check(
            await self.http.post(
                f"/storage/v1/object/sign/{self.bucket}", json={"expiresIn": ttl_seconds, "paths": paths}
            )
        )
        return {
            item["path"]: f"{self.url}/storage/v1{item['signedURL']}"
            for item in resp.json()
            if item.get("signedURL")
        }

    async def close(self) -> None:
        await self.http.aclose()


class MemoryStore:
    def __init__(self) -> None:
        self.usage: dict[tuple[str, str], int] = defaultdict(int)
        self.images: dict[str, bytes] = {}
        self.rows: list[dict[str, Any]] = []

    async def claim_generation(self, user_id: str, limit: int) -> int | None:
        key = (user_id, utc_today())
        if self.usage[key] >= limit:
            return None
        self.usage[key] += 1
        return self.usage[key]

    async def release_generation(self, user_id: str) -> None:
        key = (user_id, utc_today())
        self.usage[key] = max(0, self.usage[key] - 1)

    async def used_today(self, user_id: str) -> int:
        return self.usage[(user_id, utc_today())]

    async def save_image(self, path: str, data: bytes, content_type: str) -> None:
        self.images[path] = data

    async def insert_generation(self, row: dict[str, Any]) -> dict[str, Any]:
        stored = {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat(), **row}
        self.rows.append(stored)
        return stored

    async def list_generations(self, user_id: str, limit: int) -> list[dict[str, Any]]:
        mine = [r for r in self.rows if r["user_id"] == user_id]
        return list(reversed(mine))[:limit]

    async def sign_urls(self, paths: list[str], ttl_seconds: int) -> dict[str, str]:
        return {p: f"memory://{p}" for p in paths if p in self.images}

    async def close(self) -> None:
        pass
