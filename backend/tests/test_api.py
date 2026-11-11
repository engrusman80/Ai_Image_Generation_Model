"""API tests with an in-memory store, the mock worker and fake logins. No network or Supabase needed."""

from __future__ import annotations

import asyncio
import io
import time
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from PIL import Image

from app.auth import AuthError, SupabaseAuth, User
from app.config import Settings
from app.main import create_app
from app.presets import ASPECT_RATIOS, MODEL_PRESETS
from app.prompt_enhancer import enhance_prompt
from app.store import MemoryStore
from app.worker_client import MockWorker, WorkerError, WorkerJob


class FakeAuth:
    def verify(self, token: str) -> User:
        if token in ("alice", "bob"):
            return User(id=f"{token}-id", email=f"{token}@example.com")
        raise AuthError("bad token")


class FailingWorker:
    async def generate(self, job):
        raise WorkerError("GPU on fire")


def make_client(worker=None, **overrides) -> tuple[TestClient, MemoryStore]:
    settings = Settings(_env_file=None, mock_delay_seconds=0, **overrides)
    store = MemoryStore()
    app = create_app(settings, store=store, worker=worker or MockWorker(0), auth=FakeAuth())
    return TestClient(app), store


def auth(user="alice"):
    return {"Authorization": f"Bearer {user}"}


def test_requires_login():
    client, _ = make_client()
    with client:
        assert client.get("/api/me").status_code == 401
        assert client.get("/api/me", headers=auth("mallory")).status_code == 401
        assert client.post("/api/generate", json={"prompt": "x"}).status_code == 401


def test_public_config_has_default_model_and_sizes():
    client, _ = make_client()
    with client:
        cfg = client.get("/api/config").json()
    assert cfg["model"] == "black-forest-labs/FLUX.2-klein-4B"
    assert cfg["aspect_ratios"]["16:9"] == [1360, 768]


def test_generate_stores_image_and_history():
    client, store = make_client()
    with client:
        r = client.post("/api/generate", json={"prompt": "  a red fox \n in snow ", "aspect_ratio": "9:16", "seed": 7}, headers=auth())
        assert r.status_code == 200, r.text
        gen = r.json()["generation"]
        assert gen["prompt"] == "a red fox in snow"
        assert (gen["width"], gen["height"], gen["seed"]) == (768, 1360, 7)
        assert r.json()["used_today"] == 1
        img = Image.open(io.BytesIO(next(iter(store.images.values()))))
        assert img.size == (768, 1360) and img.format == "WEBP"

        hist = client.get("/api/history", headers=auth()).json()
        assert [h["id"] for h in hist] == [gen["id"]]
        assert hist[0]["image_url"].startswith("memory://alice-id/")
        # Other users never see it.
        assert client.get("/api/history", headers=auth("bob")).json() == []


def test_daily_limit_and_no_charge_on_failure():
    client, store = make_client(daily_limit=2, rate_limit_per_minute=100)
    with client:
        for _ in range(2):
            assert client.post("/api/generate", json={"prompt": "cat"}, headers=auth()).status_code == 200
        r = client.post("/api/generate", json={"prompt": "cat"}, headers=auth())
        assert r.status_code == 429 and "Daily limit" in r.json()["detail"]
        assert client.get("/api/me", headers=auth()).json()["used_today"] == 2

    failing, store = make_client(worker=FailingWorker())
    with failing:
        r = failing.post("/api/generate", json={"prompt": "cat"}, headers=auth())
        assert r.status_code == 502
        assert failing.get("/api/me", headers=auth()).json()["used_today"] == 0


def test_rate_limit_per_minute():
    client, _ = make_client(rate_limit_per_minute=2, daily_limit=100)
    with client:
        codes = [client.post("/api/generate", json={"prompt": "dog"}, headers=auth()).status_code for _ in range(3)]
    assert codes == [200, 200, 429]


@pytest.mark.parametrize(
    "body",
    [{"prompt": ""}, {"prompt": "   "}, {"prompt": "x" * 1001}, {"prompt": "ok", "aspect_ratio": "21:9"}, {"prompt": "ok", "seed": -1}],
)
def test_invalid_input_rejected(body):
    client, _ = make_client()
    with client:
        assert client.post("/api/generate", json=body, headers=auth()).status_code == 422


def test_enhancer_used_when_requested():
    client, _ = make_client()
    with client:
        gen = client.post("/api/generate", json={"prompt": "a cat", "enhance": True}, headers=auth()).json()["generation"]
    assert gen["prompt"] == "a cat"
    assert gen["prompt_used"] == enhance_prompt("a cat")
    assert "highly detailed" in gen["prompt_used"]


def test_presets_are_valid():
    for w, h in ASPECT_RATIOS.values():
        assert w % 16 == 0 and h % 16 == 0
    klein = MODEL_PRESETS["black-forest-labs/FLUX.2-klein-4B"]
    assert (klein.steps, klein.commercial_use) == (4, True)
    assert not MODEL_PRESETS["black-forest-labs/FLUX.1-dev"].commercial_use
    with pytest.raises(ValueError):
        create_app(Settings(_env_file=None, model_id="some/other-model"), store=MemoryStore(), auth=FakeAuth())


def test_mock_worker_draws_requested_size():
    job = WorkerJob("hello", 1152, 864, 4, 1.0, 3, "m")
    result = asyncio.run(MockWorker(0).generate(job))
    assert Image.open(io.BytesIO(result.image)).size == (1152, 864)


# --- token verification ----------------------------------------------------

URL = "https://demo.supabase.co"


def _claims(**over):
    claims = {"sub": "u1", "email": "a@b.c", "aud": "authenticated", "role": "authenticated",
              "iss": f"{URL}/auth/v1", "exp": int(time.time()) + 600}
    claims.update(over)
    return claims


def test_hs256_legacy_tokens():
    secret = "s" * 40
    auth_ = SupabaseAuth(Settings(_env_file=None, supabase_url=URL, supabase_jwt_secret=secret))
    assert auth_.verify(jwt.encode(_claims(), secret, algorithm="HS256")).id == "u1"
    for bad in [_claims(aud="other"), _claims(iss="https://evil/auth/v1"), _claims(exp=int(time.time()) - 5), _claims(role="anon")]:
        with pytest.raises(AuthError):
            auth_.verify(jwt.encode(bad, secret, algorithm="HS256"))
    with pytest.raises(AuthError):
        auth_.verify(jwt.encode(_claims(), "wrong" * 10, algorithm="HS256"))


def test_es256_tokens_via_jwks(monkeypatch):
    key = ec.generate_private_key(ec.SECP256R1())
    auth_ = SupabaseAuth(Settings(_env_file=None, supabase_url=URL))
    monkeypatch.setattr(auth_.jwks, "get_signing_key_from_jwt", lambda token: SimpleNamespace(key=key.public_key()))
    assert auth_.verify(jwt.encode(_claims(), key, algorithm="ES256")).email == "a@b.c"
    other = ec.generate_private_key(ec.SECP256R1())
    with pytest.raises(AuthError):
        auth_.verify(jwt.encode(_claims(), other, algorithm="ES256"))


# --- local / RunPod-format worker client ------------------------------------

import base64 as _b64
import json as _json

import httpx

from app.worker_client import RunSyncWorker

JOB = WorkerJob("a fox", 1024, 1024, 4, 1.0, 5, "black-forest-labs/FLUX.2-klein-4B")


def _worker(handler):
    return RunSyncWorker("http://worker/runsync", 5, transport=httpx.MockTransport(handler))


def test_runsync_worker_sends_job_and_decodes_image():
    seen = {}

    def handler(request):
        seen.update(_json.loads(request.content))
        return httpx.Response(200, json={"status": "COMPLETED", "output": {"image_base64": _b64.b64encode(b"JPEGDATA").decode(), "content_type": "image/jpeg"}})

    result = asyncio.run(_worker(handler).generate(JOB))
    assert result.image == b"JPEGDATA"
    assert seen["input"]["prompt"] == "a fox" and seen["input"]["seed"] == 5


@pytest.mark.parametrize(
    "response",
    [
        httpx.Response(200, json={"status": "FAILED", "error": "CUDA out of memory"}),
        httpx.Response(500, text="boom"),
        httpx.Response(200, json={"status": "COMPLETED", "output": {}}),
    ],
)
def test_runsync_worker_errors_become_worker_errors(response):
    with pytest.raises(WorkerError):
        asyncio.run(_worker(lambda request: response).generate(JOB))


def test_runsync_worker_unreachable():
    def handler(request):
        raise httpx.ConnectError("refused")

    with pytest.raises(WorkerError, match="cannot reach"):
        asyncio.run(_worker(handler).generate(JOB))


# --- storage format and downloads ---------------------------------------------


def test_images_stored_lossless_and_downloadable_in_each_format():
    client, store = make_client()
    with client:
        gen = client.post("/api/generate", json={"prompt": "a lighthouse", "aspect_ratio": "4:3"}, headers=auth()).json()["generation"]
        stored = next(iter(store.images.values()))
        assert Image.open(io.BytesIO(stored)).format == "WEBP"
        for fmt, pil_name, ext in [("png", "PNG", "png"), ("jpeg", "JPEG", "jpg"), ("webp", "WEBP", "webp")]:
            r = client.get(f"/api/generations/{gen['id']}/download?format={fmt}", headers=auth())
            assert r.status_code == 200, r.text
            img = Image.open(io.BytesIO(r.content))
            assert img.format == pil_name and img.size == (1152, 864)
            assert r.headers["content-disposition"].endswith(f'.{ext}"')
        assert client.get(f"/api/generations/{gen['id']}/download?format=svg", headers=auth()).status_code == 422
        # Another user cannot download it.
        assert client.get(f"/api/generations/{gen['id']}/download", headers=auth("bob")).status_code == 404
        assert client.get(f"/api/generations/{gen['id']}/download").status_code == 401


def test_lossless_storage_keeps_pixels():
    from app.image_formats import convert, to_storage

    src = Image.effect_noise((64, 48), 80).convert("RGB")
    buf = io.BytesIO()
    src.save(buf, format="PNG")
    back = Image.open(io.BytesIO(convert(to_storage(buf.getvalue()), "png"))).convert("RGB")
    assert list(back.getdata()) == list(src.getdata())


def test_delete_one_and_all_only_touch_own_images():
    client, store = make_client(rate_limit_per_minute=100)
    with client:
        ids = [client.post("/api/generate", json={"prompt": f"p{i}"}, headers=auth()).json()["generation"]["id"] for i in range(3)]
        client.post("/api/generate", json={"prompt": "bob's"}, headers=auth("bob"))
        assert client.delete(f"/api/generations/{ids[0]}", headers=auth("bob")).status_code == 404
        assert client.delete(f"/api/generations/{ids[0]}", headers=auth()).json() == {"deleted": 1}
        assert len(client.get("/api/history", headers=auth()).json()) == 2
        assert client.delete("/api/generations", headers=auth()).json() == {"deleted": 2}
        assert client.get("/api/history", headers=auth()).json() == []
        assert len(client.get("/api/history", headers=auth("bob")).json()) == 1
        assert len(store.images) == 1  # only bob's file is left
        # Deleting does not give back today's allowance.
        assert client.get("/api/me", headers=auth()).json()["used_today"] == 3
