"""Shared test fixtures — in-memory SQLite so router tests always run.

Set TEST_DATABASE_URL to a Postgres URL (e.g. local `supabase start`) to exercise
the real dialect. Schema is created via SQLAlchemy metadata (no generated
bill_date / RLS on SQLite).
"""

from __future__ import annotations

import asyncio
import os
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient

# Must run before any `app.*` import so Settings picks up the test database.
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "sqlite+aiosqlite://")
os.environ["SUPABASE_JWT_SECRET"] = os.environ.get(
    "SUPABASE_JWT_SECRET", "test-jwt-secret-which-is-long-enough-32b"
)
os.environ["SUPABASE_URL"] = os.environ.get("SUPABASE_URL", "https://test.supabase.co")
os.environ["SUPABASE_JWT_AUDIENCE"] = os.environ.get("SUPABASE_JWT_AUDIENCE", "authenticated")

JWT_SECRET = os.environ["SUPABASE_JWT_SECRET"]


def make_token(user_id: str, email: str = "owner@test.local") -> str:
    return jwt.encode(
        {
            "sub": user_id,
            "email": email,
            "role": "authenticated",
            "aud": "authenticated",
            "user_metadata": {"full_name": "Test Owner"},
        },
        JWT_SECRET,
        algorithm="HS256",
    )


def auth_header(user_id: str | None = None) -> tuple[dict, str]:
    uid = user_id or str(uuid.uuid4())
    return {"Authorization": f"Bearer {make_token(uid)}"}, uid


@pytest.fixture
def client():
    from app.config import settings
    from app.db import get_engine, reset_engine
    from app.orm import Base

    settings.DATABASE_URL = os.environ["DATABASE_URL"]
    settings.SUPABASE_JWT_SECRET = JWT_SECRET
    settings.SUPABASE_URL = os.environ["SUPABASE_URL"]

    async def _prepare():
        await reset_engine()
        engine = get_engine()
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(_prepare())

    from app.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client

    asyncio.run(reset_engine())
