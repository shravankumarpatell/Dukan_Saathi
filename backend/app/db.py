"""Async SQLAlchemy engine and session dependency."""

from __future__ import annotations

from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool

from app.config import settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None
_analyst_engine: AsyncEngine | None = None
_analyst_session_factory: async_sessionmaker[AsyncSession] | None = None


def _normalize_url(url: str) -> str:
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+psycopg" not in url and "+asyncpg" not in url:
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    if url.startswith("sqlite://") and "+aiosqlite" not in url:
        url = url.replace("sqlite://", "sqlite+aiosqlite://", 1)
    return url


def _postgres_pool_kwargs(*, pool_size: int, max_overflow: int) -> dict:
    # Supabase session-mode pooler (port 5432) caps clients (~15 on small plans).
    # Keep SQLAlchemy well under that: local reload + Oracle + this process share the cap.
    return {
        "pool_size": pool_size,
        "max_overflow": max_overflow,
        "pool_pre_ping": True,
        "pool_recycle": 180,
        "pool_timeout": 30,
        "pool_use_lifo": True,
    }


def get_engine() -> AsyncEngine:
    global _engine, _session_factory
    if _engine is None:
        url = _normalize_url(settings.DATABASE_URL)
        kwargs = {"echo": False}
        if url.startswith("sqlite"):
            # One shared in-memory DB across connections (needed for tests).
            kwargs["connect_args"] = {"check_same_thread": False}
            kwargs["poolclass"] = StaticPool
        else:
            kwargs.update(_postgres_pool_kwargs(pool_size=2, max_overflow=1))
        _engine = create_async_engine(url, **kwargs)
        _session_factory = async_sessionmaker(_engine, expire_on_commit=False)
    return _engine


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    get_engine()
    assert _session_factory is not None
    return _session_factory


def get_analyst_engine() -> AsyncEngine:
    """Read-only analyst queries. Shares the billing engine unless ANALYST_DATABASE_URL differs."""
    global _analyst_engine, _analyst_session_factory
    if _analyst_engine is None:
        raw = settings.ANALYST_DATABASE_URL or settings.DATABASE_URL
        url = _normalize_url(raw)
        main_url = _normalize_url(settings.DATABASE_URL)
        if url.startswith("sqlite") or url == main_url:
            # Same database as billing — do not open a second pool (Supabase
            # session pooler is tiny; a second engine would double clients).
            _analyst_engine = get_engine()
            _analyst_session_factory = get_session_factory()
            return _analyst_engine
        _analyst_engine = create_async_engine(
            url, echo=False, **_postgres_pool_kwargs(pool_size=1, max_overflow=1)
        )
        _analyst_session_factory = async_sessionmaker(
            _analyst_engine, expire_on_commit=False
        )
    return _analyst_engine


def get_analyst_session_factory() -> async_sessionmaker[AsyncSession]:
    get_analyst_engine()
    assert _analyst_session_factory is not None
    return _analyst_session_factory


async def reset_engine() -> None:
    """Dispose the engine — used by tests to rebuild the schema."""
    global _engine, _session_factory, _analyst_engine, _analyst_session_factory
    if _analyst_engine is not None and _analyst_engine is not _engine:
        await _analyst_engine.dispose()
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None
    _analyst_engine = None
    _analyst_session_factory = None


async def init_db() -> None:
    """Create the engine on startup. Schema is applied via migrations."""
    get_engine()


async def get_session() -> AsyncGenerator[AsyncSession, None]:
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
