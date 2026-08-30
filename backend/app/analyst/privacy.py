"""Outbound payload scanners — strict mode must not leak PII or money figures."""

from __future__ import annotations

import re

# Indian mobiles as their own token — not a 10-digit run inside a UUID hex.
PHONE_RE = re.compile(r"(?<![0-9A-Fa-f])(?:\+91[\s-]?)?[6-9]\d{9}(?![0-9A-Fa-f])")
MONEY_RE = re.compile(r"(?:₹|rs\.?|inr)\s*\d", re.I)
# Bare rupee-like amounts: 1234.56 or 1,234.50 — used in tests with fixtures.
AMOUNT_RE = re.compile(r"\b\d{1,3}(?:,\d{2,3})*(?:\.\d{1,2})\b")


class PrivacyLeak(ValueError):
    pass


def collect_leaks(
    payload: str,
    forbidden: list[str] | None = None,
    *,
    check_amounts: bool = False,
    check_phones: bool = True,
) -> list[str]:
    text = payload or ""
    leaks: list[str] = []
    if check_phones and PHONE_RE.search(text):
        leaks.append("phone")
    if check_amounts and (MONEY_RE.search(text) or AMOUNT_RE.search(text)):
        leaks.append("amount")
    for item in forbidden or []:
        if item and str(item).lower() in text.lower():
            leaks.append(f"forbidden:{item}")
    return leaks


def assert_strict_payload(
    payload: str,
    forbidden: list[str] | None = None,
    *,
    check_amounts: bool = False,
    check_phones: bool = True,
) -> None:
    leaks = collect_leaks(
        payload, forbidden, check_amounts=check_amounts, check_phones=check_phones
    )
    if leaks:
        raise PrivacyLeak(", ".join(leaks))
