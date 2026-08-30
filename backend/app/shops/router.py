"""Shop API routes."""

import re
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import ValidationError
from app.db import get_session
from app.dependencies import AuthenticatedUser, get_current_user
from app.orm import Shop
from app.persist import shop_uuid
from app.shops.models import ShopResponse, ShopUpdate

router = APIRouter(prefix="/shops", tags=["shops"])

GSTIN_RE = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
STATE_CODES = {
    "01", "02", "03", "04", "05", "06", "07", "08", "09", "10",
    "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
    "21", "22", "23", "24", "26", "27", "28", "29", "30", "31",
    "32", "33", "34", "35", "36", "37", "38",
}


def _normalize_gstin(raw: str) -> str:
    return re.sub(r"\s+", "", (raw or "").strip().upper())


def _gstin_checksum_char(first14: str) -> str:
    total = 0
    factor = 1
    for ch in first14:
        code = ALPHABET.index(ch)
        product = factor * code
        total += product // 36 + product % 36
        factor = 2 if factor == 1 else 1
    return ALPHABET[(36 - total % 36) % 36]


def _validate_gst_fields(gst_enabled: bool, gstin: str) -> str:
    """Normalize + structurally validate GSTIN when GST is enabled."""
    value = _normalize_gstin(gstin)
    if not gst_enabled:
        return value
    if not value:
        raise ValidationError("GST enabled hai — GSTIN bharna zaroori hai")
    if len(value) != 15:
        raise ValidationError("GSTIN 15 characters ka hona chahiye")
    if not GSTIN_RE.match(value):
        raise ValidationError("GSTIN format galat hai (state + PAN + entity + Z + check)")
    if value[:2] not in STATE_CODES:
        raise ValidationError("GSTIN ka state code valid nahi hai")
    expected = _gstin_checksum_char(value[:14])
    if value[14] != expected:
        raise ValidationError("GSTIN check digit galat hai — number dobara check karein")
    return value


def _to_response(shop: Shop) -> ShopResponse:
    return ShopResponse(
        id=str(shop.id),
        name=shop.name,
        ownerName=shop.owner_name,
        phone=shop.phone,
        address=shop.address,
        gstEnabled=shop.gst_enabled,
        gstin=shop.gstin,
    )


async def _get_or_create_shop(session: AsyncSession, user: AuthenticatedUser) -> Shop:
    shop_id = shop_uuid(user.uid)
    shop = await session.get(Shop, shop_id)
    if shop is None:
        shop = Shop(
            id=shop_id,
            name=user.name or "My Shop",
            owner_name=user.name or "",
            phone="",
            address="",
            gst_enabled=True,
            gstin="",
            invoice_seq=1,
        )
        session.add(shop)
        await session.flush()
    return shop


@router.get("/me", response_model=ShopResponse)
async def get_my_shop(
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get the current user's shop, creating it if it doesn't exist."""
    shop = await _get_or_create_shop(session, user)
    return _to_response(shop)


@router.put("/me", response_model=ShopResponse)
async def update_my_shop(
    update: ShopUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Update shop settings. Only provided fields are updated."""
    shop = await _get_or_create_shop(session, user)
    patch = {k: v for k, v in update.model_dump().items() if v is not None}

    if "gstEnabled" in patch or "gstin" in patch:
        gst_enabled = bool(patch["gstEnabled"]) if "gstEnabled" in patch else shop.gst_enabled
        gstin_raw = patch["gstin"] if "gstin" in patch else shop.gstin
        shop.gstin = _validate_gst_fields(gst_enabled, gstin_raw)
        shop.gst_enabled = gst_enabled
        patch.pop("gstEnabled", None)
        patch.pop("gstin", None)

    field_map = {
        "name": "name",
        "ownerName": "owner_name",
        "phone": "phone",
        "address": "address",
    }
    for api_name, col in field_map.items():
        if api_name in patch:
            setattr(shop, col, patch[api_name])

    await session.flush()
    return _to_response(shop)
