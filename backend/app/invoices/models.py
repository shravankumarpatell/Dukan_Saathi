from typing import Optional, List, Dict
"""Pydantic models for Invoice endpoints."""

from pydantic import BaseModel, Field


class PaymentEntry(BaseModel):
    mode: str = Field(..., pattern="^(cash|online|credit)$")
    amount: float = Field(..., ge=0)


class BillItemInput(BaseModel):
    productId: str = Field(..., min_length=1)
    name: str = ""
    qty: float = Field(default=0, ge=0)
    pieces: float = Field(default=0, ge=0)
    unit: str = "box"
    rate: float = Field(default=0, ge=0)
    piecesPerBox: int = Field(default=1, ge=1)
    size: str = ""
    productUnit: Optional[str] = None
    packQty: Optional[float] = None
    lotNo: str = ""
    measureUnit: str = "ft"
    areaUnit: str = "sqft"
    measurements: List[dict] = Field(default_factory=list)


class DiscountInput(BaseModel):
    type: str = Field(default="flat", pattern="^(flat|percent)$")
    value: float = Field(default=0, ge=0)


class CreateBillRequest(BaseModel):
    """Request body for creating a sale invoice.

    The server computes all totals, validates stock, and manages
    customer balances. The frontend should NOT send pre-computed totals.
    """
    type: str = Field(default="sale", pattern="^sale$")
    items: List[BillItemInput] = Field(..., min_length=1)
    gstEnabled: bool = True
    gstRate: float = Field(default=18, ge=0)
    discount: Optional[DiscountInput] = None
    payments: List[PaymentEntry] = Field(default_factory=list)

    # Customer (optional — blank = Walk-in)
    customerId: Optional[str] = None
    customerName: str = ""
    customerPhone: str = ""
    isContractor: bool = False
    siteNote: str = ""
    vehicleNo: str = ""

    createdVia: str = "manual"
    language: str = "hi"


class InvoiceResponse(BaseModel):
    id: str
    invoiceNo: str = ""
    date: str = ""
    type: str = ""
    customerId: Optional[str] = None
    customerName: str = ""
    customerPhone: str = ""
    isContractor: bool = False
    siteNote: str = ""
    vehicleNo: str = ""
    items: List[dict] = Field(default_factory=list)
    discount: Optional[dict] = None
    gstEnabled: bool = False
    gstRate: float = 0
    subtotal: float = 0
    discountOff: float = 0
    gstAmount: float = 0
    grandTotal: float = 0
    payments: List[dict] = Field(default_factory=list)
    amountPaid: float = 0
    amountPending: float = 0
    paymentStatus: str = ""
    createdVia: str = "manual"
    settlement: Optional[str] = None
    settlementDetail: Optional[dict] = None
    settlementConvertedAt: Optional[str] = None
    settlementConvertedAmount: float = 0
    settlementConvertedTo: Optional[str] = None
    originalInvoiceNo: Optional[str] = None
    refundTotal: Optional[float] = None
