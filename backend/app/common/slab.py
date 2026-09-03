"""Unique-slab area math. Keep formulas in lockstep with frontend/src/lib/slab.js.

A lot is many L×W pieces. Billable qty is Σ area in product.unit (usually sq.ft).
Leftover individual pieces are not stocked — only remaining sq.ft of the quality.
"""

from __future__ import annotations

from typing import Any, Optional

from app.common.uom import (
    SQM_TO_SQFT,
    is_slab_product,
    normalize_unit_code,
    product_unit,
    to_product_unit,
)

CM2_PER_SQFT = 30.48 * 30.48  # 929.0304
IN2_PER_SQFT = 144.0
MEASURE_UNITS = ("cm", "inch", "ft")
AREA_UNITS = ("sqft", "sqm")

__all__ = [
    "CM2_PER_SQFT",
    "IN2_PER_SQFT",
    "MEASURE_UNITS",
    "AREA_UNITS",
    "is_slab_product",
    "normalize_measure_unit",
    "normalize_area_unit",
    "round_area",
    "row_area_sqft",
    "filled_rows",
    "total_area_sqft",
    "total_area",
    "measurements_payload",
    "has_measurements",
    "slab_line_qty_rate",
    "apply_measurements_to_line",
]


def _num(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _row_length(row: Any) -> float:
    if not isinstance(row, dict):
        return 0.0
    if "length" in row:
        return _num(row.get("length"))
    return _num(row.get("l"))


def _row_width(row: Any) -> float:
    if not isinstance(row, dict):
        return 0.0
    if "width" in row:
        return _num(row.get("width"))
    return _num(row.get("w"))


def normalize_measure_unit(raw: Any, default: str = "ft") -> str:
    t = str(raw or "").strip().lower().replace("_", " ")
    compact = t.replace(" ", "").replace(".", "")
    if t in ("cm",) or compact in ("cm", "cms", "centimeter", "centimetre"):
        return "cm"
    if t == "inch" or compact in ("in", "inch", "inches"):
        return "inch"
    if t == "ft" or compact in ("ft", "feet", "foot"):
        return "ft"
    return default if default in MEASURE_UNITS else "ft"


def normalize_area_unit(raw: Any, default: str = "sqft") -> str:
    u = normalize_unit_code(raw, default=default)
    return "sqm" if u == "sqm" else "sqft"


def round_area(n: Any, decimals: int = 4) -> float:
    q = 10 ** decimals
    return round(float(n or 0) * q) / q


def row_area_sqft(length, width, measure_unit: str = "ft") -> float:
    L = _num(length)
    W = _num(width)
    if L <= 0 or W <= 0:
        return 0.0
    raw = L * W
    u = normalize_measure_unit(measure_unit)
    if u == "ft":
        return raw
    if u == "inch":
        return raw / IN2_PER_SQFT
    if u == "cm":
        return raw / CM2_PER_SQFT
    return raw


def filled_rows(rows) -> list[dict]:
    out = []
    for r in rows or []:
        if _row_length(r) > 0 and _row_width(r) > 0:
            out.append(r)
    return out


def total_area_sqft(rows, measure_unit: str = "ft") -> float:
    mu = normalize_measure_unit(measure_unit)
    return sum(row_area_sqft(_row_length(r), _row_width(r), mu) for r in filled_rows(rows))


def total_area(rows, measure_unit: str = "ft", area_unit: str = "sqft") -> float:
    sqft = total_area_sqft(rows, measure_unit)
    if normalize_area_unit(area_unit) == "sqm":
        return sqft / SQM_TO_SQFT
    return sqft


def measurements_payload(rows, measure_unit: str = "ft") -> list[dict]:
    mu = normalize_measure_unit(measure_unit)
    out = []
    for r in filled_rows(rows):
        length = _row_length(r)
        width = _row_width(r)
        out.append({
            "length": length,
            "width": width,
            "area": round_area(row_area_sqft(length, width, mu), 4),
        })
    return out


def has_measurements(item: Optional[dict]) -> bool:
    rows = (item or {}).get("measurements")
    if not isinstance(rows, list):
        return False
    return any(_row_length(r) > 0 and _row_width(r) > 0 for r in rows)


def slab_line_qty_rate(
    rows,
    measure_unit: str = "ft",
    area_unit: str = "sqft",
    product: Optional[dict] = None,
    ui_rate: float = 0,
) -> dict:
    dest = product_unit(product or {}, default="sqft")
    au = normalize_area_unit(area_unit)
    area = total_area(rows, measure_unit, au)
    qty = to_product_unit({**(product or {}), "unit": dest}, au, area)
    rate_raw = float(ui_rate or 0)
    rate = rate_raw
    if au != dest and qty > 0:
        rate = (area * rate_raw) / qty
    return {
        "qty": round_area(qty, 4),
        "unit": dest,
        "rate": round(rate * 100) / 100.0,
        "area": area,
        "areaUnit": au,
    }


def apply_measurements_to_line(item: dict, product: Optional[dict] = None) -> dict:
    """If a grid is present, recompute qty from L×W. Do not trust a typed qty."""
    if not has_measurements(item):
        return item
    rows = item.get("measurements") or []
    mu = normalize_measure_unit(item.get("measureUnit") or item.get("measure_unit") or "ft")
    au = normalize_area_unit(item.get("areaUnit") or item.get("area_unit") or "sqft")
    dest = product_unit(product or item, default="sqft")
    merged = {**(product or {}), **item, "unit": dest}
    area = total_area(rows, mu, au)
    qty = to_product_unit(merged, au, area)
    out = dict(item)
    out["qty"] = round_area(qty, 4)
    out["unit"] = dest
    out["measureUnit"] = mu
    out["areaUnit"] = au
    out["measurements"] = measurements_payload(rows, mu)
    out["lotNo"] = str(item.get("lotNo") or item.get("lot_no") or "")
    return out
