"""Core business calculations — THE authoritative source of truth.

Ported from frontend/src/lib/calc.js. The frontend may mirror these for UX,
but the backend is the final arbiter for all financial and stock calculations.
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import Any
import math

# GST
GST_DEFAULT = 18
GST_SLABS = [0, 5, 12, 18, 28, 40]


def round2(n: float) -> float:
    """Round to 2 decimal places (financial rounding)."""
    return round(float(n or 0), 2)


def item_amount(item: dict) -> float:
    """Calculate the amount for a single line item (boxes + loose pieces).

    For box items: amount = qty * rate + pieces * (rate / piecesPerBox)
    For piece items: amount = qty * rate
    """
    rate = float(item.get("rate", 0) or 0)
    qty = float(item.get("qty", 0) or 0)
    ppb = int(item.get("piecesPerBox", 1) or 1)
    pieces = float(item.get("pieces", 0) or 0)
    piece_price = rate / ppb if item.get("unit") == "box" and ppb else rate
    return round2(qty * rate + pieces * piece_price)


def compute_bill_totals(draft: dict) -> dict:
    """Compute subtotal, discount, GST, grand total, and payment status.

    This is the AUTHORITATIVE calculation — the frontend should never
    be trusted for these values.
    """
    items = draft.get("items") or []
    subtotal = round2(sum(item_amount(it) for it in items))

    # Discount
    discount_off = 0.0
    discount = draft.get("discount")
    if discount and float(discount.get("value", 0) or 0) > 0:
        val = float(discount["value"])
        if discount.get("type") == "percent":
            discount_off = round2(subtotal * (val / 100))
        else:
            discount_off = round2(val)

    taxable = round2(subtotal - discount_off)

    # GST
    gst_rate = float(draft.get("gstRate", GST_DEFAULT) or GST_DEFAULT) if draft.get("gstEnabled") else 0
    if gst_rate not in GST_SLABS:
        gst_rate = GST_DEFAULT if draft.get("gstEnabled") else 0
    gst_amount = round2(taxable * (gst_rate / 100))
    grand_total = round2(taxable + gst_amount)

    # Payments
    payments = draft.get("payments") or []
    amount_paid = round2(sum(float(p.get("amount", 0) or 0) for p in payments))
    amount_pending = round2(grand_total - amount_paid)

    if amount_pending > 0.5 and amount_paid > 0.5:
        payment_status = "partial"
    elif amount_pending > 0.5:
        payment_status = "pending"
    else:
        payment_status = "paid"

    return {
        "subtotal": subtotal,
        "discountOff": discount_off,
        "taxable": taxable,
        "gstRate": gst_rate,
        "gstAmount": gst_amount,
        "grandTotal": grand_total,
        "amountPaid": amount_paid,
        "amountPending": amount_pending,
        "paymentStatus": payment_status,
    }


def gen_invoice_no(seq: int, gst_enabled: bool, prefix: str | None = None) -> str:
    """Generate a deterministic invoice number from a sequence counter.

    Format: {PREFIX}{YEAR}{SEQ:04d}
    Examples: GST20260006, RET20260007, PUR20260008
    """
    yr = datetime.now(timezone.utc).year
    nn = str(seq).zfill(4)
    p = prefix or ("GST" if gst_enabled else "INV")
    return f"{p}{yr}{nn}"


def calculate_sold_pieces(item: dict) -> int:
    """Calculate total pieces being sold/returned for a line item."""
    ppb = int(item.get("piecesPerBox", 1) or 1)
    qty = float(item.get("qty", 0) or 0)
    pieces = float(item.get("pieces", 0) or 0)
    return round(qty * ppb + pieces)


def _get_total_stock_pieces(product: dict) -> int:
    """Get total stock in pieces, supporting both old (showroom/godown) and new (stockQty) fields."""
    ppb = int(product.get("piecesPerBox", 1) or 1)
    # New unified field
    stock_qty = product.get("stockQty", 0) or 0
    # Legacy fields (for data that hasn't been migrated yet)
    godown_qty = product.get("godownQty", 0) or 0
    showroom_qty = product.get("showroomQty", 0) or 0
    total_boxes = stock_qty + godown_qty + showroom_qty
    return round(total_boxes * ppb)


def validate_stock_availability(product: dict, sold_pieces: int) -> bool:
    """Check if a product has enough stock for the requested quantity."""
    return _get_total_stock_pieces(product) >= sold_pieces


def compute_stock_deduction(product: dict, sold_pieces: int) -> dict:
    """Compute new stockQty after a sale.

    Deducts from the unified stockQty field.
    Returns the new stockQty value (and zeroes out legacy fields if present).
    """
    total_pieces = _get_total_stock_pieces(product)
    ppb = int(product.get("piecesPerBox", 1) or 1)
    remaining_pieces = max(0, total_pieces - sold_pieces)

    result = {"stockQty": round2(remaining_pieces / ppb)}
    # Zero out legacy fields if they exist, consolidating into stockQty
    if product.get("godownQty") or product.get("showroomQty"):
        result["godownQty"] = 0
        result["showroomQty"] = 0
    return result


def compute_stock_addition(product: dict, add_pieces: int) -> dict:
    """Compute new stockQty after a stock-in (purchase/return).

    Adds to the unified stockQty field.
    """
    total_pieces = _get_total_stock_pieces(product) + add_pieces
    ppb = int(product.get("piecesPerBox", 1) or 1)

    result = {"stockQty": round2(total_pieces / ppb)}
    # Zero out legacy fields if they exist
    if product.get("godownQty") or product.get("showroomQty"):
        result["godownQty"] = 0
        result["showroomQty"] = 0
    return result


def today_iso() -> str:
    """Return the current UTC timestamp as ISO string."""
    return datetime.now(timezone.utc).isoformat()


# Sq-ft calculator
def sqft_calc(
    room_area: float = 0,
    room_length_ft: float = 0,
    room_width_ft: float = 0,
    tile_len_inch: float = 0,
    tile_wid_inch: float = 0,
    pieces_per_box: int = 1,
    rate_per_box: float = 0,
    wastage_pct: float = 5,
) -> dict:
    """Sq-ft calculator: given room and tile dimensions, compute boxes + price."""
    area = room_area if room_area > 0 else room_length_ft * room_width_ft
    tile_area = (tile_len_inch / 12) * (tile_wid_inch / 12)
    ppb = pieces_per_box or 1

    if not area or not tile_area:
        return {
            "roomArea": round2(area),
            "tileArea": round2(tile_area),
            "tilesNeeded": 0,
            "boxesNeeded": 0,
            "loosePieces": 0,
            "ppb": ppb,
            "price": 0,
        }

    with_wastage = area * (1 + wastage_pct / 100)
    tiles_needed = math.ceil(with_wastage / tile_area)
    boxes_needed = tiles_needed // ppb
    loose_pieces = tiles_needed - boxes_needed * ppb
    piece_price = rate_per_box / ppb if rate_per_box and ppb else 0
    price = round2(boxes_needed * rate_per_box + loose_pieces * piece_price)

    return {
        "roomArea": round2(area),
        "tileArea": round2(tile_area),
        "tilesNeeded": tiles_needed,
        "boxesNeeded": boxes_needed,
        "loosePieces": loose_pieces,
        "ppb": ppb,
        "price": price,
    }
