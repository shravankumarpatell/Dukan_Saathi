"""Authentication dependency — verifies Supabase JWTs on every request."""

from __future__ import annotations

import logging
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from pydantic import BaseModel

from app.config import settings

logger = logging.getLogger(__name__)

security = HTTPBearer(auto_error=False)

_jwks_client: PyJWKClient | None = None


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
        _jwks_client = PyJWKClient(url, cache_keys=True, lifespan=600)
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
    except Exception:
        reset_jwks_client()
        signing_key = _jwks().get_signing_key_from_jwt(token)

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
        decoded = decode_supabase_token(token)
        return user_from_claims(decoded)
    except Exception as exc:
        logger.warning("Token verification failed: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc
