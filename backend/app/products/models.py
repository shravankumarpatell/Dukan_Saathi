from typing import Optional, List, Dict
"""Pydantic models for Product endpoints."""

from pydantic import BaseModel, Field


class ProductCreate(BaseModel):
    """Quick-add payload — used when billing a product that isn't in the catalog yet.

    Tiles (unit=box): size + piecesPerBox required in practice.
    Sanitary (unit=piece): size empty, piecesPerBox always 1.
    """
    name: str = Field(..., min_length=1, max_length=200)
    code: str = ""
    company: str = ""
    size: str = ""
    unit: str = Field(default="box", pattern="^(box|piece)$")
    piecesPerBox: int = Field(default=1, ge=1)
    sellPrice: float = Field(default=0, ge=0)
    stockQty: float = Field(default=0, ge=0)
    lowStockThreshold: int = Field(default=10, ge=0)


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    code: Optional[str] = None
    company: Optional[str] = None
    size: Optional[str] = None
    unit: Optional[str] = Field(default=None, pattern="^(box|piece)$")
    piecesPerBox: Optional[int] = Field(default=None, ge=1)
    sellPrice: Optional[float] = Field(default=None, ge=0)
    stockQty: Optional[float] = Field(default=None, ge=0)
    lowStockThreshold: Optional[int] = Field(default=None, ge=0)


class ProductResponse(BaseModel):
    id: str
    name: str = ""
    code: str = ""
    company: str = ""
    size: str = ""
    unit: str = "box"
    piecesPerBox: int = 1
    sellPrice: float = 0
    stockQty: float = 0
    lowStockThreshold: int = 10


class BulkProductRow(BaseModel):
    name: str = Field(..., min_length=1)
    code: str = ""
    company: str = ""
    size: str = ""
    # "box" = tiles (size + pcs/box). "piece" = sanitary (no size, pcs/box = 1).
    unit: str = Field(default="box", pattern="^(box|piece)$")
    piecesPerBox: int = Field(default=1, ge=1)
    qty: float = Field(default=0, ge=0)
    # Optional — supplier sheets usually have no price. Left blank means
    # the shopkeeper enters the rate while making the bill.
    price: float = Field(default=0, ge=0)


class BulkImportRequest(BaseModel):
    rows: List[BulkProductRow] = Field(..., min_length=1)
