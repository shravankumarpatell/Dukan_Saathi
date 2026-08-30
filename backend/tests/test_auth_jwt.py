"""JWT verification for Supabase access tokens."""

import jwt
import pytest

from app.config import settings
from app.dependencies import decode_supabase_token, reset_jwks_client, user_from_claims


def test_hs256_roundtrip(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "unit-secret-which-is-long-enough-32b")
    token = jwt.encode(
        {"sub": "user-1", "email": "a@b.c"},
        "unit-secret-which-is-long-enough-32b",
        algorithm="HS256",
    )
    claims = decode_supabase_token(token)
    assert claims["sub"] == "user-1"
    user = user_from_claims(claims)
    assert user.uid == "user-1"
    assert user.email == "a@b.c"


def test_hs256_rejects_wrong_secret(monkeypatch):
    monkeypatch.setattr(settings, "SUPABASE_JWT_SECRET", "unit-secret-which-is-long-enough-32b")
    token = jwt.encode(
        {"sub": "user-1"},
        "other-secret-which-is-long-enough-32b",
        algorithm="HS256",
    )
    with pytest.raises(jwt.InvalidTokenError):
        decode_supabase_token(token)


def test_kid_miss_refreshes_jwks(monkeypatch):
    """A missing kid rebuilds the JWKS client, then the second lookup succeeds."""
    reset_jwks_client()
    calls = {"n": 0}

    class _Key:
        key = "unused"

    class _Client:
        def get_signing_key_from_jwt(self, token):
            calls["n"] += 1
            if calls["n"] == 1:
                raise jwt.PyJWKClientError("The JWK Set did not contain any keys")
            return _Key()

    monkeypatch.setattr("app.dependencies._jwks", lambda: _Client())
    monkeypatch.setattr(jwt, "decode", lambda *args, **kwargs: {"sub": "refreshed-user"})
    monkeypatch.setattr(
        jwt,
        "get_unverified_header",
        lambda token: {"alg": "ES256", "kid": "rotated"},
    )
    claims = decode_supabase_token("not.a.real.token")
    assert claims["sub"] == "refreshed-user"
    assert calls["n"] == 2
    reset_jwks_client()
