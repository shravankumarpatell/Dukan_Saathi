"""Expense API routes."""

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.dependencies import AuthenticatedUser, get_current_user
from app.orm import Expense
from app.persist import iso, money, shop_uuid
from app.shops.router import _get_or_create_shop

router = APIRouter(prefix="/expenses", tags=["expenses"])


class ExpenseCreate(BaseModel):
    amount: float = Field(..., gt=0)
    note: str = ""
    mode: str = Field(default="cash", pattern="^(cash|online)$")
    date: str = ""


class ExpenseResponse(BaseModel):
    id: str
    amount: float = 0
    note: str = ""
    mode: str = "cash"
    date: str = ""


def _parse_date(raw: str) -> datetime:
    if not raw:
        return datetime.now(timezone.utc)
    try:
        value = datetime.fromisoformat(raw.replace("Z", "+00:00"))
    except ValueError:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value


def _to_response(row: Expense) -> ExpenseResponse:
    return ExpenseResponse(
        id=str(row.id),
        amount=money(row.amount),
        note=row.note,
        mode=row.mode,
        date=iso(row.date),
    )


@router.get("", response_model=List[ExpenseResponse])
async def list_expenses(
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all expenses for the shop."""
    shop_id = shop_uuid(user.uid)
    rows = (
        await session.execute(select(Expense).where(Expense.shop_id == shop_id))
    ).scalars().all()
    return [_to_response(r) for r in rows]


@router.post("", response_model=ExpenseResponse, status_code=201)
async def create_expense(
    body: ExpenseCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Record an expense."""
    shop = await _get_or_create_shop(session, user)
    row = Expense(
        shop_id=shop.id,
        amount=body.amount,
        note=body.note,
        mode=body.mode,
        date=_parse_date(body.date),
    )
    session.add(row)
    await session.flush()
    return _to_response(row)
