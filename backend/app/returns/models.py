from typing import Optional, List, Dict
"""Pydantic models for Return endpoints."""

from pydantic import BaseModel, Field


class ReturnItemInput(BaseModel):
    productId: str = Field(..., min_length=1)
    name: str = ""
    qty: float = Field(default=0, ge=0)
    pieces: float = Field(default=0, ge=0)
    unit: str = "box"
    rate: float = Field(default=0, ge=0)
    piecesPerBox: int = Field(default=1, ge=1)


class CreateReturnRequest(BaseModel):
    """Request body for creating a return invoice."""
    originalInvoiceNo: str = Field(..., min_length=1)
    items: List[ReturnItemInput] = Field(..., min_length=1)
    refundTotal: float = Field(..., ge=0)
    settlement: str = Field(..., pattern="^(cash|adjust_udhari|store_credit)$")
    customerId: Optional[str] = None
    customerName: str = ""


class UpdateReturnRequest(BaseModel):
    """Re-settle an existing return — e.g. a customer who took store credit
    later wants the cash instead. Items and stock are left untouched."""
    settlement: str = Field(..., pattern="^(cash|adjust_udhari|store_credit)$")
    refundTotal: Optional[float] = Field(default=None, ge=0)
