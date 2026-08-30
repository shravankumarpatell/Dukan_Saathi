"""Pydantic models for Shop endpoints."""

from typing import Optional

from pydantic import BaseModel


class ShopResponse(BaseModel):
    id: str
    name: str = ""
    ownerName: str = ""
    phone: str = ""
    address: str = ""
    gstEnabled: bool = True
    gstin: str = ""


class ShopUpdate(BaseModel):
    name: Optional[str] = None
    ownerName: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    gstEnabled: Optional[bool] = None
    gstin: Optional[str] = None
