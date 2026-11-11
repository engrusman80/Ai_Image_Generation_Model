"""Checks the Supabase login token that the frontend sends as `Authorization: Bearer <token>`.

Tokens are verified locally with Supabase's public keys (JWKS), so no call to Supabase is needed
per request. Older projects that still use the legacy HS256 secret are supported through
SUPABASE_JWT_SECRET.
"""

from __future__ import annotations

from dataclasses import dataclass

import jwt
from jwt import PyJWKClient

from app.config import Settings


class AuthError(Exception):
    pass


@dataclass(frozen=True)
class User:
    id: str
    email: str | None


class SupabaseAuth:
    def __init__(self, settings: Settings) -> None:
        base = settings.supabase_url.rstrip("/")
        self.issuer = f"{base}/auth/v1"
        self.jwt_secret = settings.supabase_jwt_secret
        # Public keys are cached for 10 minutes, matching Supabase's own cache.
        self.jwks = PyJWKClient(f"{self.issuer}/.well-known/jwks.json", cache_jwk_set=True, lifespan=600)

    def verify(self, token: str) -> User:
        try:
            alg = jwt.get_unverified_header(token).get("alg")
            if alg == "HS256":
                if not self.jwt_secret:
                    raise AuthError("This project uses legacy HS256 tokens: set SUPABASE_JWT_SECRET")
                key = self.jwt_secret
            elif alg in ("ES256", "RS256"):
                key = self.jwks.get_signing_key_from_jwt(token).key
            else:
                raise AuthError(f"unsupported token algorithm {alg!r}")
            claims = jwt.decode(
                token,
                key,
                algorithms=[alg],
                audience="authenticated",
                issuer=self.issuer,
                options={"require": ["exp", "sub", "aud", "iss"]},
            )
        except AuthError:
            raise
        except jwt.PyJWTError as exc:
            raise AuthError(f"invalid token: {exc}") from exc
        if claims.get("role") != "authenticated":
            raise AuthError("not a signed-in user")
        return User(id=claims["sub"], email=claims.get("email"))
