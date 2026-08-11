"""Pydantic models for Shop endpoints."""

from pydantic import BaseModel, Field


class ShopResponse(BaseModel):
    id: str
    name: str = ""
    ownerName: str = ""
    phone: str = ""
    address: str = ""
    gstEnabled: bool = True
    gstin: str = ""


class ShopUpdate(BaseModel):
    name: str | None = None
    ownerName: str | None = None
    phone: str | None = None
    address: str | None = None
    gstEnabled: bool | None = None
    gstin: str | None = None
