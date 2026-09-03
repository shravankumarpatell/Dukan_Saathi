from typing import Optional, List
"""Pydantic models for Product endpoints."""

from pydantic import BaseModel, Field, ValidationInfo, field_validator

from app.common.uom import normalize_category, normalize_unit_code


def _norm_unit(v, default="box"):
    if v is None or v == "":
        return default
    return normalize_unit_code(v, default=default)


class ProductCreate(BaseModel):
    """Quick-add payload — used when billing a product that isn't in the catalog yet."""

    name: str = Field(..., min_length=1, max_length=200)
    code: str = ""
    company: str = ""
    size: str = ""
    unit: str = "box"
    category: str = ""
    allowedUnits: List[str] = Field(default_factory=list)
    piecesPerBox: int = Field(default=1, ge=1)
    packQty: float = Field(default=1, gt=0)
    sellPrice: float = Field(default=0, ge=0)
    stockQty: float = Field(default=0, ge=0)
    lowStockThreshold: int = Field(default=10, ge=0)

    @field_validator("unit", mode="before")
    @classmethod
    def _unit(cls, v):
        return _norm_unit(v, "box")

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, v, info: ValidationInfo):
        return normalize_category(v, (info.data or {}).get("unit"))

    @field_validator("allowedUnits", mode="before")
    @classmethod
    def _allowed(cls, v):
        if not v:
            return []
        return [_norm_unit(u, "box") for u in v]


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=200)
    code: Optional[str] = None
    company: Optional[str] = None
    size: Optional[str] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    allowedUnits: Optional[List[str]] = None
    piecesPerBox: Optional[int] = Field(default=None, ge=1)
    packQty: Optional[float] = Field(default=None, gt=0)
    sellPrice: Optional[float] = Field(default=None, ge=0)
    stockQty: Optional[float] = Field(default=None, ge=0)
    lowStockThreshold: Optional[int] = Field(default=None, ge=0)

    @field_validator("unit", mode="before")
    @classmethod
    def _unit(cls, v):
        if v is None or v == "":
            return v
        return _norm_unit(v, "box")

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, v, info: ValidationInfo):
        if v is None or v == "":
            return v
        return normalize_category(v, (info.data or {}).get("unit"))

    @field_validator("allowedUnits", mode="before")
    @classmethod
    def _allowed(cls, v):
        if v is None:
            return v
        return [_norm_unit(u, "box") for u in v]


class ProductResponse(BaseModel):
    id: str
    name: str = ""
    code: str = ""
    company: str = ""
    size: str = ""
    unit: str = "box"
    category: str = "tiles"
    allowedUnits: List[str] = Field(default_factory=list)
    piecesPerBox: int = 1
    packQty: float = 1
    sellPrice: float = 0
    stockQty: float = 0
    lowStockThreshold: int = 10


class BulkProductRow(BaseModel):
    name: str = Field(..., min_length=1)
    code: str = ""
    company: str = ""
    size: str = ""
    unit: str = "box"
    category: str = ""
    allowedUnits: List[str] = Field(default_factory=list)
    piecesPerBox: int = Field(default=1, ge=1)
    packQty: float = Field(default=1, gt=0)
    qty: float = Field(default=0, ge=0)
    price: float = Field(default=0, ge=0)

    @field_validator("unit", mode="before")
    @classmethod
    def _unit(cls, v):
        return _norm_unit(v, "box")

    @field_validator("category", mode="before")
    @classmethod
    def _category(cls, v, info: ValidationInfo):
        return normalize_category(v, (info.data or {}).get("unit"))

    @field_validator("allowedUnits", mode="before")
    @classmethod
    def _allowed(cls, v):
        if not v:
            return []
        return [_norm_unit(u, "box") for u in v]


class BulkImportRequest(BaseModel):
    rows: List[BulkProductRow] = Field(..., min_length=1)
