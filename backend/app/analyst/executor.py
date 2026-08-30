"""Read-only SELECT executor with SET LOCAL shop_id / role / timeout."""

from __future__ import annotations

import logging
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.db import get_analyst_session_factory

logger = logging.getLogger(__name__)


class ExecError(RuntimeError):
    pass


def _dialect_name(session: AsyncSession) -> str:
    bind = session.get_bind()
    return bind.dialect.name if bind is not None else "sqlite"


def _cell(value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, (bytes, bytearray, memoryview)):
        return bytes(value).decode("utf-8", "replace")
    if type(value).__name__ == "UUID":
        return str(value)
    return value


async def _prepare_local(session: AsyncSession, shop_id: UUID) -> None:
    dialect = _dialect_name(session)
    if dialect != "postgresql":
        return
    timeout = settings.ANALYST_STATEMENT_TIMEOUT_MS
    await session.execute(text("SET LOCAL default_transaction_read_only = on"))
    await session.execute(text(f"SET LOCAL statement_timeout = '{timeout}'"))
    await session.execute(
        text("SELECT set_config('app.shop_id', :sid, true)"),
        {"sid": str(shop_id)},
    )
    try:
        await session.execute(text("SET LOCAL ROLE analyst_ro"))
    except Exception:
        logger.debug("SET LOCAL ROLE analyst_ro skipped", exc_info=True)


async def execute_select(
    sql: str,
    shop_id: UUID,
    params: dict[str, Any] | None = None,
) -> tuple[list[str], list[dict[str, Any]]]:
    """Run guarded SQL. Returns (column_names, rows as dicts)."""
    factory = get_analyst_session_factory()
    async with factory() as session:
        try:
            await _prepare_local(session, shop_id)
            dialect = _dialect_name(session)
            bind: dict[str, Any] = {}
            for key, value in (params or {}).items():
                if isinstance(value, UUID):
                    bind[key] = value.hex if dialect == "sqlite" else str(value)
                else:
                    bind[key] = value
            result = await session.execute(text(sql), bind)
            mappings = result.mappings().all()
            cols = list(result.keys()) if mappings or result.returns_rows else []
            data = [{k: _cell(v) for k, v in dict(row).items()} for row in mappings]
            if not cols and data:
                cols = list(data[0].keys())
            await session.rollback()
            return cols, data
        except Exception as exc:
            await session.rollback()
            raise ExecError(str(exc)) from exc
