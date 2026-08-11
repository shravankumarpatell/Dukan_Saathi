from typing import Optional, List, Dict
"""Pydantic models for Customer endpoints."""

from pydantic import BaseModel, Field


class CustomerCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    phone: str = ""
    isContractor: bool = False
    siteNote: str = ""


class CustomerResponse(BaseModel):
    id: str
    name: str = ""
    phone: str = ""
    isContractor: bool = False
    siteNote: str = ""
    totalPending: float = 0
    storeCredit: float = 0


class PaymentAllocationEntry(BaseModel):
    invoiceId: str = Field(..., min_length=1)
    amount: float = Field(..., gt=0)


class AllocatePaymentRequest(BaseModel):
    allocations: List[PaymentAllocationEntry] = Field(..., min_length=1)
    mode: str = Field(default="cash", pattern="^(cash|online)$")
