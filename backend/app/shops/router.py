"""Shop API routes."""

import re
from fastapi import APIRouter, Depends
from app.dependencies import get_current_user, AuthenticatedUser
from app.database import get_db
from app.common.errors import ValidationError
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
    """Normalize + structurally validate GSTIN when GST is enabled.

    Checks format, state code, and mod-36 check digit. Does not call GSTN
    to verify the taxpayer is currently registered.
    """
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


@router.get("/me", response_model=ShopResponse)
async def get_my_shop(user: AuthenticatedUser = Depends(get_current_user)):
    """Get the current user's shop, creating it if it doesn't exist."""
    db = get_db()
    shop_ref = db.collection("shops").document(user.uid)
    snap = shop_ref.get()

    if not snap.exists:
        shop_data = {
            "name": user.name or "My Shop",
            "ownerName": user.name or "",
            "phone": "",
            "address": "",
            "gstEnabled": True,
            "gstin": "",
            "invoiceSeq": 1,
        }
        shop_ref.set(shop_data)
        return ShopResponse(id=user.uid, **shop_data)

    data = snap.to_dict()
    return ShopResponse(id=user.uid, **{k: data.get(k, "") for k in ShopResponse.model_fields if k != "id"})


@router.put("/me", response_model=ShopResponse)
async def update_my_shop(
    update: ShopUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Update shop settings. Only provided fields are updated."""
    db = get_db()
    shop_ref = db.collection("shops").document(user.uid)

    # Ensure shop exists
    snap = shop_ref.get()
    if not snap.exists:
        # Auto-create
        await get_my_shop(user)
        snap = shop_ref.get()

    current = snap.to_dict() or {}
    patch = {k: v for k, v in update.model_dump().items() if v is not None}

    if "gstEnabled" in patch or "gstin" in patch:
        gst_enabled = bool(patch["gstEnabled"]) if "gstEnabled" in patch else bool(current.get("gstEnabled", True))
        gstin_raw = patch["gstin"] if "gstin" in patch else (current.get("gstin") or "")
        patch["gstin"] = _validate_gst_fields(gst_enabled, gstin_raw)
        patch["gstEnabled"] = gst_enabled

    if patch:
        shop_ref.update(patch)

    updated = shop_ref.get().to_dict()
    return ShopResponse(id=user.uid, **{k: updated.get(k, "") for k in ShopResponse.model_fields if k != "id"})
