"""In-memory request limits. Good for one backend server, which is all this app needs at 20-30 users."""

from __future__ import annotations

import asyncio
import time
from collections import defaultdict, deque
from contextlib import asynccontextmanager


class LimitError(Exception):
    def __init__(self, status_code: int, message: str) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class RateLimiter:
    """At most `per_minute` requests per user in any 60-second window."""

    def __init__(self, per_minute: int) -> None:
        self.per_minute = per_minute
        self.hits: dict[str, deque[float]] = defaultdict(deque)

    def check(self, user_id: str) -> None:
        now = time.monotonic()
        hits = self.hits[user_id]
        while hits and now - hits[0] > 60:
            hits.popleft()
        if len(hits) >= self.per_minute:
            raise LimitError(429, "Too many requests. Please wait a minute and try again.")
        hits.append(now)


class JobGate:
    """Caps images generated at the same time (cost and GPU protection), and one job per user."""

    def __init__(self, max_concurrent: int, wait_seconds: float) -> None:
        self.slots = asyncio.Semaphore(max_concurrent)
        self.wait_seconds = wait_seconds
        self.running: set[str] = set()

    @asynccontextmanager
    async def job(self, user_id: str):
        if user_id in self.running:
            raise LimitError(409, "You already have an image generating. Please wait for it to finish.")
        self.running.add(user_id)
        try:
            try:
                await asyncio.wait_for(self.slots.acquire(), timeout=self.wait_seconds)
            except asyncio.TimeoutError:
                raise LimitError(503, "The image server is busy. Please try again in a minute.") from None
            try:
                yield
            finally:
                self.slots.release()
        finally:
            self.running.discard(user_id)
