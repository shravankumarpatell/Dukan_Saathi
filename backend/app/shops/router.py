from typing import Optional, List, Dict
"""Shop API routes."""

from fastapi import APIRouter, Depends
from app.dependencies import get_current_user, AuthenticatedUser
from app.database import get_db
from app.shops.models import ShopResponse, ShopUpdate

router = APIRouter(prefix="/shops", tags=["shops"])


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

    patch = {k: v for k, v in update.model_dump().items() if v is not None}
    if patch:
        shop_ref.update(patch)

    updated = shop_ref.get().to_dict()
    return ShopResponse(id=user.uid, **{k: updated.get(k, "") for k in ShopResponse.model_fields if k != "id"})
