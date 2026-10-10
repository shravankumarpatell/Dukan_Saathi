"""Phone + password signup without an SMS provider or a confirmation email."""

from __future__ import annotations

import re

import httpx
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.common.errors import ValidationError
from app.config import settings

router = APIRouter(prefix="/auth", tags=["auth"])

_MOBILE = re.compile(r"^[6-9]\d{9}$")


class PhoneSignup(BaseModel):
    phone: str = ""
    password: str = Field(min_length=6, max_length=72)
    name: str = ""


def _digits(raw: str) -> str:
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 12 and digits.startswith("91"):
        digits = digits[2:]
    elif len(digits) == 11 and digits.startswith("0"):
        digits = digits[1:]
    if not _MOBILE.match(digits):
        raise ValidationError("10 digit mobile number likhein")
    return digits


@router.post("/phone-signup")
async def phone_signup(body: PhoneSignup):
    digits = _digits(body.phone)
    if not settings.SUPABASE_URL or not settings.SUPABASE_SECRET_KEY:
        raise ValidationError("Phone signup abhi configured nahi hai.")
    email = f"91{digits}@phone.dukansaathi.app"
    payload = {
        "email": email,
        "password": body.password,
        "email_confirm": True,
        "user_metadata": {
            "full_name": (body.name or "").strip(),
            "phone": f"+91{digits}",
        },
    }
    url = f"{settings.SUPABASE_URL}/auth/v1/admin/users"
    headers = {
        "apikey": settings.SUPABASE_SECRET_KEY,
        "Authorization": f"Bearer {settings.SUPABASE_SECRET_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=20) as client:
        res = await client.post(url, headers=headers, json=payload)
    if res.status_code in (200, 201):
        return {"ok": True}
    try:
        data = res.json()
    except Exception:
        data = {}
    message = str(data.get("msg") or data.get("message") or data.get("error_description") or "")
    code = str(data.get("error_code") or data.get("code") or "")
    if res.status_code in (409, 422) or "already" in message.lower() or code in {
        "email_exists",
        "user_already_exists",
    }:
        raise ValidationError("Is number pe account pehle se hai. Sign in karein.")
    raise ValidationError(message or "Account nahi bana. Dobara koshish karein.")
