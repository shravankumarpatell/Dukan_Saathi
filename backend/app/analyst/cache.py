"""SQL-plan cache: store query text, never result rows."""

from __future__ import annotations

import logging
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from difflib import SequenceMatcher
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session_factory

logger = logging.getLogger(__name__)

REUSE_THRESHOLD = 0.95
GUIDE_THRESHOLD = 0.60

_mem: list[tuple[str, str, str]] = []  # shop_id, norm, sql


def normalize_question(tokenized: str) -> str:
    q = (tokenized or "").lower()
    q = re.sub(r"\s+", " ", q).strip()
    return q


def _score(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return SequenceMatcher(None, a, b).ratio()


@dataclass
class CacheHit:
    sql: str
    score: float
    reuse: bool


def clear_sql_cache() -> None:
    _mem.clear()


async def lookup_sql(
    session: AsyncSession,
    shop_id: UUID,
    tokenized: str,
) -> CacheHit | None:
    norm = normalize_question(tokenized)
    best: CacheHit | None = None
    sid = str(shop_id)
    for s, n, sql in _mem:
        if s != sid:
            continue
        sc = _score(norm, n)
        if best is None or sc > best.score:
            best = CacheHit(sql=sql, score=sc, reuse=sc >= REUSE_THRESHOLD)
    try:
        rows = (
            await session.execute(
                text(
                    """
                    SELECT question_norm, sql FROM analyst_sql_cache
                    WHERE shop_id = :sid
                    ORDER BY created_at DESC
                    LIMIT 50
                    """
                ),
                {"sid": sid},
            )
        ).mappings().all()
        for row in rows:
            sc = _score(norm, str(row["question_norm"]))
            if best is None or sc > best.score:
                best = CacheHit(sql=str(row["sql"]), score=sc, reuse=sc >= REUSE_THRESHOLD)
    except Exception as exc:
        # Cache is an optimisation: fall back to in-memory hits, but say so.
        logger.warning("analyst_sql_cache lookup skipped (%s)", type(exc).__name__)
        try:
            if session.in_transaction():
                await session.rollback()
        except Exception:
            logger.debug("rollback after cache lookup failure failed", exc_info=True)
    if best and best.score >= GUIDE_THRESHOLD:
        return best
    return None


async def store_sql(
    session: AsyncSession | None,
    shop_id: UUID,
    tokenized: str,
    sql: str,
) -> None:
    if not sql:
        return
    norm = normalize_question(tokenized)
    sid = str(shop_id)
    _mem.append((sid, norm, sql))
    if len(_mem) > 500:
        del _mem[:100]
    try:
        factory = get_session_factory()
        async with factory() as own:
            await own.execute(
                text(
                    """
                    INSERT INTO analyst_sql_cache (id, shop_id, question_norm, sql, created_at)
                    VALUES (:id, :sid, :q, :sql, :ts)
                    """
                ),
                {
                    "id": str(uuid.uuid4()),
                    "sid": sid,
                    "q": norm,
                    "sql": sql,
                    "ts": datetime.now(timezone.utc).isoformat(),
                },
            )
            await own.commit()
    except Exception as exc:
        logger.warning("analyst_sql_cache store skipped (%s)", type(exc).__name__)
