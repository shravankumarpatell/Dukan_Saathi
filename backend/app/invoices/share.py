"""Public invoice page data. The token is the only credential."""

from __future__ import annotations

import re

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.errors import NotFoundError
from app.db import get_session
from app.orm import Invoice, Shop
from app.persist import INVOICE_LOAD, public_bill_payload

router = APIRouter(prefix="/b", tags=["share"])

# token_urlsafe(18) is 24 chars. Reject anything else before hitting the database.
_TOKEN = re.compile(r"^[A-Za-z0-9_-]{20,64}$")


@router.get("/{token}")
async def get_shared_bill(
    token: str,
    response: Response,
    session: AsyncSession = Depends(get_session),
):
    """One bill, for the customer who was sent the link. No login."""
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["X-Robots-Tag"] = "noindex, nofollow"
    if not _TOKEN.fullmatch(token):
        raise NotFoundError("Invoice")

    inv = (
        await session.execute(
            select(Invoice).options(*INVOICE_LOAD).where(Invoice.share_token == token)
        )
    ).scalar_one_or_none()
    if inv is None:
        raise NotFoundError("Invoice")
    shop = await session.get(Shop, inv.shop_id)
    if shop is None:
        raise NotFoundError("Invoice")
    return public_bill_payload(shop, inv)
