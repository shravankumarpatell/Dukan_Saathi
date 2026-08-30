"""Content-free analyst traces — never store result rows."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import text

from app.db import get_session_factory

logger = logging.getLogger("analyst.trace")


async def write_trace(
    shop_id: UUID,
    *,
    question_tokenized: str,
    route: str,
    sql: str | None,
    row_count: int | None,
    latency_ms: int,
    repaired: bool,
    cache_hit: bool,
) -> None:
    payload = {
        "shop_id": str(shop_id),
        "route": route,
        "row_count": row_count,
        "latency_ms": latency_ms,
        "repaired": repaired,
        "cache_hit": cache_hit,
        "sql_len": len(sql or ""),
    }
    logger.info("analyst_trace %s", payload)
    try:
        factory = get_session_factory()
        async with factory() as session:
            await session.execute(
                text(
                    """
                    INSERT INTO analyst_traces (
                        id, shop_id, question_tokenized, route, sql, row_count,
                        latency_ms, repaired, cache_hit, created_at
                    ) VALUES (
                        :id, :sid, :q, :route, :sql, :rc, :ms, :rep, :hit, :ts
                    )
                    """
                ),
                {
                    "id": str(uuid.uuid4()),
                    "sid": str(shop_id),
                    "q": (question_tokenized or "")[:500],
                    "route": route,
                    "sql": (sql or "")[:4000],
                    "rc": row_count,
                    "ms": latency_ms,
                    "rep": 1 if repaired else 0,
                    "hit": 1 if cache_hit else 0,
                    "ts": datetime.now(timezone.utc).isoformat(),
                },
            )
            await session.commit()
    except Exception:
        logger.debug("trace persist skipped", exc_info=True)
