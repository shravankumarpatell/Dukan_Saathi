"""Authentication dependency — verifies Supabase JWTs on every request."""

from __future__ import annotations

import logging
import socket
import urllib.error
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from pydantic import BaseModel

from app.common.errors import ServiceUnavailableError
from app.config import settings

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

_jwks_client: PyJWKClient | None = None

# JWKS fetch is a blocking urllib call; bound it so a slow Supabase Auth
# endpoint cannot stall the worker.
_JWKS_TIMEOUT_S = 5

# Errors that mean "we could not reach the key server", not "bad token".
_NETWORK_ERRORS = (urllib.error.URLError, socket.timeout, TimeoutError, ConnectionError, OSError)


class AuthUnavailable(Exception):
    """Could not verify the token because Supabase Auth was unreachable."""


class AuthenticatedUser(BaseModel):
    """Verified user extracted from a Supabase access token."""

    uid: str
    email: Optional[str] = None
    name: Optional[str] = None
    picture: Optional[str] = None


def _jwks() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        url = settings.supabase_jwks_url
        if not url:
            raise RuntimeError("SUPABASE_JWKS_URL or SUPABASE_URL is not configured")
        _jwks_client = PyJWKClient(url, cache_keys=True, lifespan=600, timeout=_JWKS_TIMEOUT_S)
    return _jwks_client


def reset_jwks_client() -> None:
    """Test helper — drop the cached JWKS client."""
    global _jwks_client
    _jwks_client = None


def decode_supabase_token(token: str) -> dict:
    """Verify a Supabase access token (ES256/RS256 via JWKS, HS256 via JWT secret)."""
    header = jwt.get_unverified_header(token)
    alg = header.get("alg") or ""

    decode_opts = {
        "verify_signature": True,
        "verify_exp": True,
        "verify_aud": False,
        "verify_iss": False,
    }

    if alg == "HS256":
        secret = settings.SUPABASE_JWT_SECRET
        if not secret:
            raise jwt.InvalidTokenError("HS256 token but SUPABASE_JWT_SECRET is not set")
        return jwt.decode(
            token,
            secret,
            algorithms=["HS256"],
            audience=settings.SUPABASE_JWT_AUDIENCE,
            options={**decode_opts, "verify_aud": False},
        )

    try:
        signing_key = _jwks().get_signing_key_from_jwt(token)
    except jwt.PyJWKClientConnectionError as exc:
        raise AuthUnavailable(str(exc)) from exc
    except _NETWORK_ERRORS as exc:
        raise AuthUnavailable(str(exc)) from exc
    except Exception:
        # Unknown kid (key rotation) or stale cache — rebuild once and retry.
        reset_jwks_client()
        try:
            signing_key = _jwks().get_signing_key_from_jwt(token)
        except jwt.PyJWKClientConnectionError as exc:
            raise AuthUnavailable(str(exc)) from exc
        except _NETWORK_ERRORS as exc:
            raise AuthUnavailable(str(exc)) from exc

    return jwt.decode(
        token,
        signing_key.key,
        algorithms=["ES256", "RS256"],
        audience=settings.SUPABASE_JWT_AUDIENCE,
        options=decode_opts,
    )


def user_from_claims(decoded: dict) -> AuthenticatedUser:
    meta = decoded.get("user_metadata") or {}
    name = (
        meta.get("full_name")
        or meta.get("name")
        or decoded.get("email", "").split("@")[0]
        or "User"
    )
    picture = meta.get("avatar_url") or meta.get("picture")
    return AuthenticatedUser(
        uid=decoded["sub"],
        email=decoded.get("email"),
        name=name,
        picture=picture,
    )


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
) -> AuthenticatedUser:
    """Verify the Bearer token and return the authenticated user.

    Raises 401 if the token is invalid, expired, or missing.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token = credentials.credentials
    try:
        # decode_supabase_token may hit the network (JWKS refresh) — keep it
        # off the event loop.
        decoded = await run_in_threadpool(decode_supabase_token, token)
        return user_from_claims(decoded)
    except AuthUnavailable as exc:
        # Not the user's fault: do NOT sign them out (a 401 would). 503 + retry.
        logger.error("Auth key server unreachable: %s", exc)
        raise ServiceUnavailableError(
            "Login verify nahi ho paya (auth server down). Thodi der baad try karein."
        ) from exc
    except Exception as exc:
        logger.warning("Token verification failed: %s", type(exc).__name__)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
