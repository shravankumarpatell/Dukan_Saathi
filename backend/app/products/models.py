"""Pydantic models for Product endpoints."""

from pydantic import BaseModel, Field


class ProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    code: str = ""
    company: str = ""
    size: str = ""
    unit: str = Field(default="box", pattern="^(box|piece)$")
    piecesPerBox: int = Field(default=1, ge=1)
    costPrice: float = Field(default=0, ge=0)
    sellPrice: float = Field(default=0, ge=0)
    stockQty: float = Field(default=0, ge=0)
    lowStockThreshold: int = Field(default=10, ge=0)


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = None
    company: str | None = None
    size: str | None = None
    unit: str | None = Field(default=None, pattern="^(box|piece)$")
    piecesPerBox: int | None = Field(default=None, ge=1)
    costPrice: float | None = Field(default=None, ge=0)
    sellPrice: float | None = Field(default=None, ge=0)
    stockQty: float | None = Field(default=None, ge=0)
    lowStockThreshold: int | None = Field(default=None, ge=0)


class ProductResponse(BaseModel):
    id: str
    name: str = ""
    code: str = ""
    company: str = ""
    size: str = ""
    unit: str = "box"
    piecesPerBox: int = 1
    costPrice: float = 0
    sellPrice: float = 0
    stockQty: float = 0
    lowStockThreshold: int = 10


class BulkProductRow(BaseModel):
    name: str = Field(..., min_length=1)
    code: str = ""
    company: str = ""
    size: str = ""
    qty: float = Field(default=0, ge=0)
    price: float = Field(default=0, ge=0)


class BulkImportRequest(BaseModel):
    rows: list[BulkProductRow] = Field(..., min_length=1)
