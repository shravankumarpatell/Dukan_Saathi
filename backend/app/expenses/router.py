from typing import Optional, List, Dict
"""Expense API routes."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from app.dependencies import get_current_user, AuthenticatedUser
from app.database import get_db
from app.common.calc import today_iso

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


def _expenses_ref(shop_id: str):
    return get_db().collection("shops").document(shop_id).collection("expenses")


@router.get("", response_model=List[ExpenseResponse])
async def list_expenses(user: AuthenticatedUser = Depends(get_current_user)):
    """List all expenses for the shop."""
    docs = _expenses_ref(user.uid).stream()
    return [
        ExpenseResponse(id=d.id, **{
            k: d.to_dict().get(k, "") for k in ["amount", "note", "mode", "date"]
        })
        for d in docs
    ]


@router.post("", response_model=ExpenseResponse, status_code=201)
async def create_expense(
    body: ExpenseCreate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Record an expense."""
    data = {
        "amount": body.amount,
        "note": body.note,
        "mode": body.mode,
        "date": body.date or today_iso(),
    }
    _, doc_ref = _expenses_ref(user.uid).add(data)
    return ExpenseResponse(id=doc_ref.id, **data)
