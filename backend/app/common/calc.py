"""Core business calculations — THE authoritative source of truth.

Ported from frontend/src/lib/calc.js. The frontend may mirror these for UX,
but the backend is the final arbiter for all financial and stock calculations.
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import List, Optional, Any
import math

# GST
GST_DEFAULT = 18
GST_SLABS = [0, 5, 12, 18, 28, 40]


def round2(n: float) -> float:
    """Round to 2 decimal places (financial rounding)."""
    return round(float(n or 0), 2)


def item_amount(item: dict) -> float:
    """Calculate the amount for a single line item.

    Tiles (unit=box): amount = qty * rate + pieces * (rate / piecesPerBox)
    Sanitary (unit=piece): amount = qty * rate  (pieces ignored)
    """
    rate = float(item.get("rate", 0) or 0)
    qty = float(item.get("qty", 0) or 0)
    # Missing unit defaults to box (tiles) — same as stock helpers / frontend.
    if item.get("unit") == "piece":
        return round2(qty * rate)
    ppb = int(item.get("piecesPerBox", 1) or 1)
    pieces = float(item.get("pieces", 0) or 0)
    piece_price = rate / ppb if ppb else rate
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
            pct = min(100.0, max(0.0, val))
            discount_off = round2(subtotal * (pct / 100))
        else:
            discount_off = round2(val)

    taxable = round2(max(0.0, subtotal - discount_off))

    # GST
    gst_rate = float(draft.get("gstRate", GST_DEFAULT) or GST_DEFAULT) if draft.get("gstEnabled") else 0
    if gst_rate not in GST_SLABS:
        gst_rate = GST_DEFAULT if draft.get("gstEnabled") else 0
    gst_amount = round2(taxable * (gst_rate / 100))
    grand_total = round2(taxable + gst_amount)

    # Payments
    payments = draft.get("payments") or []
    amount_paid = round2(sum(float(p.get("amount", 0) or 0) for p in payments))
    # Never store a negative balance if a client somehow overpays.
    amount_pending = round2(max(0.0, grand_total - amount_paid))

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


def cash_online_total(payments) -> float:
    """Sum of cash + online only (store credit is applied separately)."""
    total = 0.0
    for p in payments or []:
        mode = (p.get("mode") if isinstance(p, dict) else getattr(p, "mode", "")) or ""
        amount = p.get("amount") if isinstance(p, dict) else getattr(p, "amount", 0)
        if mode in ("cash", "online"):
            total += float(amount or 0)
    return round2(total)


def validate_payment_split(grand_total: float, payments) -> None:
    """Reject cash+online (and total paid) that exceed the bill total.

    Raises ValidationError — imported lazily to keep calc free of FastAPI on
    import for unit tests that only need the math helpers.
    """
    from app.common.errors import ValidationError

    gt = round2(grand_total)
    cash_online = cash_online_total(payments)
    if cash_online > gt + 0.01:
        raise ValidationError(
            f"Cash + Online (₹{cash_online:.2f}) bill total (₹{gt:.2f}) se zyada nahi ho sakta"
        )

    paid = round2(sum(
        float((p.get("amount") if isinstance(p, dict) else getattr(p, "amount", 0)) or 0)
        for p in (payments or [])
    ))
    if paid > gt + 0.01:
        raise ValidationError(
            f"Total payment (₹{paid:.2f}) bill total (₹{gt:.2f}) se zyada nahi ho sakta"
        )


def gen_invoice_no(seq: int, gst_enabled: bool, prefix: Optional[str] = None) -> str:
    """Generate a deterministic invoice number from a sequence counter.

    Format: {PREFIX}{YEAR}{SEQ:04d}
    Examples: GST20260006, RET20260007, PUR20260008
    """
    yr = datetime.now(timezone.utc).year
    nn = str(seq).zfill(4)
    p = prefix or ("GST" if gst_enabled else "INV")
    return f"{p}{yr}{nn}"


def calculate_sold_pieces(item: dict) -> int:
    """Calculate total pieces being sold/returned for a line item.

    Tiles: boxes * piecesPerBox + loose pieces.
    Sanitary: qty is already in pieces.
    Missing unit defaults to box (tiles) — same as the frontend normalizer.
    """
    if item.get("unit") == "piece":
        return round(float(item.get("qty", 0) or 0))
    ppb = int(item.get("piecesPerBox", 1) or 1)
    qty = float(item.get("qty", 0) or 0)
    pieces = float(item.get("pieces", 0) or 0)
    return round(qty * ppb + pieces)


def get_total_stock_pieces(product: dict) -> int:
    """Get total stock in pieces, supporting both old (showroom/godown) and new (stockQty) fields.

    stockQty is stored in the product's selling unit:
      - tiles (unit=box or missing): boxes (may be fractional)
      - sanitary (unit=piece): pieces
    """
    stock_qty = product.get("stockQty", 0) or 0
    godown_qty = product.get("godownQty", 0) or 0
    showroom_qty = product.get("showroomQty", 0) or 0
    total_units = stock_qty + godown_qty + showroom_qty
    if product.get("unit") == "piece":
        return round(total_units)
    ppb = int(product.get("piecesPerBox", 1) or 1)
    return round(total_units * ppb)


# Back-compat alias used by older call sites / tests.
_get_total_stock_pieces = get_total_stock_pieces


def validate_stock_availability(product: dict, sold_pieces: int) -> bool:
    """Check if a product has enough stock for the requested quantity."""
    return get_total_stock_pieces(product) >= sold_pieces


def format_stock_pieces_label(product: dict, pieces: int) -> str:
    """Human label for a piece count: '3b+1p' or '7 pcs'."""
    pieces = max(0, int(pieces or 0))
    if product.get("unit") == "piece":
        return f"{pieces} pcs"
    ppb = max(1, int(product.get("piecesPerBox", 1) or 1))
    boxes = pieces // ppb
    loose = pieces - boxes * ppb
    if loose:
        return f"{boxes}b+{loose}p"
    return f"{boxes}b"


def compute_stock_deduction(product: dict, sold_pieces: int) -> dict:
    """Compute new stockQty after a sale.

    Deducts from the unified stockQty field (in selling units).
    """
    total_pieces = get_total_stock_pieces(product)
    remaining_pieces = max(0, total_pieces - sold_pieces)

    if product.get("unit") == "piece":
        result = {"stockQty": float(remaining_pieces)}
    else:
        ppb = int(product.get("piecesPerBox", 1) or 1)
        result = {"stockQty": round2(remaining_pieces / ppb)}
    # Zero out legacy fields if they exist, consolidating into stockQty
    if product.get("godownQty") or product.get("showroomQty"):
        result["godownQty"] = 0
        result["showroomQty"] = 0
    return result


def compute_stock_addition(product: dict, add_pieces: int) -> dict:
    """Compute new stockQty after a stock-in (purchase/return).

    Adds to the unified stockQty field (in selling units).
    """
    total_pieces = get_total_stock_pieces(product) + add_pieces

    if product.get("unit") == "piece":
        result = {"stockQty": float(total_pieces)}
    else:
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


# ── Ledger helpers (udhari / returns / payments) ─────────────────────────────

def payment_status(amount_paid: float, amount_pending: float) -> str:
    """Same 0.5-rupee thresholds used by compute_bill_totals / Record Payment."""
    paid = round2(amount_paid)
    pending = round2(amount_pending)
    if pending > 0.5 and paid > 0.5:
        return "partial"
    if pending > 0.5:
        return "pending"
    return "paid"


def apply_payment_to_invoice(inv: dict, amount: float, payment_entry: dict) -> dict:
    """Return patched invoice payment fields after applying `amount`.

    Does not mutate `inv`. Caps at current amountPending (never overpays).
    """
    amount = round2(amount)
    if amount <= 0:
        return {}

    grand = round2(inv.get("grandTotal", 0) or 0)
    cur_pending = round2(inv.get("amountPending", 0) or 0)
    # Prefer stored pending; fall back to grand - paid.
    if cur_pending <= 0 and grand > 0:
        cur_paid = round2(inv.get("amountPaid", 0) or 0)
        cur_pending = round2(max(0.0, grand - cur_paid))

    applied = round2(min(amount, cur_pending))
    if applied <= 0:
        return {}

    paid = round2((inv.get("amountPaid", 0) or 0) + applied)
    pending = round2(max(0.0, grand - paid))
    payments = list(inv.get("payments") or [])
    entry = {**payment_entry, "amount": applied}
    if not entry.get("date"):
        entry["date"] = today_iso()
    payments.append(entry)
    return {
        "amountPaid": paid,
        "amountPending": pending,
        "paymentStatus": payment_status(paid, pending),
        "payments": payments,
        "_applied": applied,  # callers may pop this
    }


def remove_return_adjust_payments(inv: dict, return_invoice_no: str) -> dict:
    """Strip synthetic return_adjust payments for a return and recompute paid/pending."""
    payments = [
        p for p in (inv.get("payments") or [])
        if not (
            (p.get("mode") or "") == "return_adjust"
            and (p.get("returnInvoiceNo") or "") == (return_invoice_no or "")
        )
    ]
    paid = round2(sum(float(p.get("amount", 0) or 0) for p in payments))
    grand = round2(inv.get("grandTotal", 0) or 0)
    pending = round2(max(0.0, grand - paid))
    return {
        "payments": payments,
        "amountPaid": paid,
        "amountPending": pending,
        "paymentStatus": payment_status(paid, pending),
    }


def remaining_returnable_by_product(
    original_items: list,
    prior_return_items: list,
) -> dict:
    """Map productId -> pieces still returnable (sold − already returned)."""
    sold: dict = {}
    for it in original_items or []:
        pid = it.get("productId")
        if not pid:
            continue
        sold[pid] = sold.get(pid, 0) + calculate_sold_pieces(it)

    returned: dict = {}
    for it in prior_return_items or []:
        pid = it.get("productId")
        if not pid:
            continue
        returned[pid] = returned.get(pid, 0) + calculate_sold_pieces(it)

    return {pid: max(0, int(sold[pid]) - int(returned.get(pid, 0))) for pid in sold}


def remaining_returnable_amount(original_inv: dict, prior_returns: list) -> float:
    """Max refund still allowed against an original sale (by prior refund totals)."""
    grand = round2(original_inv.get("grandTotal", 0) or 0)
    already = round2(sum(
        float(r.get("refundTotal", 0) or r.get("grandTotal", 0) or 0)
        for r in (prior_returns or [])
    ))
    return round2(max(0.0, grand - already))


def recompute_customer_total_pending(sale_invoices: list) -> float:
    """Single source of truth: sum of open sale invoice pendings."""
    total = 0.0
    for inv in sale_invoices or []:
        if (inv.get("type") or "sale") != "sale":
            continue
        total += float(inv.get("amountPending", 0) or 0)
    return round2(total)


def allocate_return_across_invoices(
    refund: float,
    original_inv: dict,
    other_open_sales: list,
    *,
    return_invoice_no: str,
    settlement: str,
) -> tuple[list, dict, float]:
    """Clear unpaid portion first on original, then settle leftover by mode.

    Returns (invoice_patches, settlement_detail, leftover_after_invoice_clears).

    invoice_patches: list of {id, invoiceNo, fields} where fields are Firestore updates.
    settlement_detail includes cash / udhariAdjusted / storeCredit / invoiceAllocations.
    leftover_after_invoice_clears: amount still to put in cash or store credit (caller
    may further FIFO for adjust_udhari — this function already FIFOs for adjust_udhari).
    """
    refund = round2(refund)
    detail = {
        "cash": 0.0,
        "udhariAdjusted": 0.0,
        "storeCredit": 0.0,
        "invoiceAllocations": [],
    }
    patches: list = []
    remaining = refund

    def _patch_one(inv: dict, amount: float) -> float:
        nonlocal remaining
        if amount <= 0 or remaining <= 0:
            return 0.0
        fields = apply_payment_to_invoice(
            inv,
            min(amount, remaining),
            {
                "mode": "return_adjust",
                "returnInvoiceNo": return_invoice_no,
                "date": today_iso(),
            },
        )
        applied = round2(fields.pop("_applied", 0) or 0)
        if applied <= 0:
            return 0.0
        remaining = round2(remaining - applied)
        detail["udhariAdjusted"] = round2(detail["udhariAdjusted"] + applied)
        detail["invoiceAllocations"].append({
            "invoiceId": inv.get("id"),
            "invoiceNo": inv.get("invoiceNo"),
            "amount": applied,
        })
        # Keep in-memory inv in sync for subsequent FIFO steps.
        inv["amountPaid"] = fields["amountPaid"]
        inv["amountPending"] = fields["amountPending"]
        inv["paymentStatus"] = fields["paymentStatus"]
        inv["payments"] = fields["payments"]
        patches.append({
            "id": inv.get("id"),
            "invoiceNo": inv.get("invoiceNo"),
            "fields": {
                "amountPaid": fields["amountPaid"],
                "amountPending": fields["amountPending"],
                "paymentStatus": fields["paymentStatus"],
                "payments": fields["payments"],
            },
        })
        return applied

    # 1) Always clear unpaid on the original sale first.
    if original_inv and original_inv.get("id"):
        _patch_one(original_inv, remaining)

    # 2) Leftover by settlement mode.
    if settlement == "adjust_udhari" and remaining > 0:
        for inv in other_open_sales or []:
            if remaining <= 0:
                break
            if inv.get("id") and inv.get("id") == (original_inv or {}).get("id"):
                continue
            if round2(inv.get("amountPending", 0) or 0) <= 0.5:
                continue
            _patch_one(inv, remaining)

    leftover = remaining
    if settlement == "cash":
        detail["cash"] = round2(leftover)
        leftover = 0.0
    elif settlement == "store_credit":
        detail["storeCredit"] = round2(leftover)
        leftover = 0.0
    elif settlement == "adjust_udhari":
        # Anything still left after FIFO becomes store credit.
        detail["storeCredit"] = round2(leftover)
        leftover = 0.0

    return patches, detail, leftover


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
