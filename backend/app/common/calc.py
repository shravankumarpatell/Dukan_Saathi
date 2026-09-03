"""Core business calculations — THE authoritative source of truth.

Ported from frontend/src/lib/calc.js. The frontend may mirror these for UX,
but the backend is the final arbiter for all financial and stock calculations.
"""

from __future__ import annotations
from datetime import datetime, timezone
from typing import List, Optional, Any
import math

from app.common.uom import (
    conversion_product,
    is_slab_product,
    line_price_qty,
    normalize_unit_code,
    sold_pieces,
    sqft_per_piece,
    to_product_unit,
    unit_kind,
    uses_piece_stock,
)

# GST
GST_DEFAULT = 18
GST_SLABS = [0, 5, 12, 18, 28, 40]
# PostgreSQL numeric(12, 2) — max storable money value.
MAX_MONEY = 9_999_999_999.99


def round2(n: float) -> float:
    """Round to 2 decimal places (financial rounding)."""
    return round(float(n or 0), 2)


def item_amount(item: dict, product: dict | None = None) -> float:
    """Amount for a line. Rate is always per product.unit (priced unit).

    Box lines keep qty * rate + loose * (rate/ppb) so existing invoices match.
    Piece lines stay qty * rate. Every other line unit converts via to_product_unit.
    """
    rate = float(item.get("rate", 0) or 0)
    qty = float(item.get("qty", 0) or 0)
    raw_unit = item.get("unit")
    if raw_unit in (None, ""):
        line_unit = "box"
    else:
        line_unit = normalize_unit_code(raw_unit, default="box")
    if line_unit == "box":
        ppb = int(item.get("piecesPerBox", 1) or 1)
        pieces = float(item.get("pieces", 0) or 0)
        piece_price = rate / ppb if ppb else rate
        return round2(qty * rate + pieces * piece_price)
    return round2(line_price_qty(item, product) * rate)


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


def validate_money_limit(value: float, label: str = "Amount") -> None:
    """Reject values that would overflow numeric(12, 2) in Postgres."""
    from app.common.errors import ValidationError

    v = round2(value)
    if abs(v) > MAX_MONEY:
        raise ValidationError(
            f"{label} ₹{v:,.2f} bahut bada hai — max ₹{MAX_MONEY:,.2f}. Rate ya qty check karein."
        )


def validate_bill_limits(totals: dict, items=None) -> None:
    """Ensure line items and computed totals fit in numeric(12, 2)."""
    for idx, it in enumerate(items or []):
        amt = item_amount(it if isinstance(it, dict) else it.model_dump())
        name = (it.get("name") if isinstance(it, dict) else getattr(it, "name", "")) or f"Line {idx + 1}"
        validate_money_limit(amt, f"'{name}' amount")
        rate = float((it.get("rate") if isinstance(it, dict) else getattr(it, "rate", 0)) or 0)
        validate_money_limit(rate, f"'{name}' rate")
    validate_money_limit(totals.get("subtotal", 0), "Subtotal")
    validate_money_limit(totals.get("grandTotal", 0), "Bill total")
    validate_money_limit(totals.get("amountPaid", 0), "Amount paid")
    validate_money_limit(totals.get("amountPending", 0), "Pending amount")


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


def calculate_sold_pieces(item: dict, product: dict | None = None) -> int:
    """Pieces consumed by a box/piece/area line. Non-count lines return 0."""
    return sold_pieces(item, product)


def line_consumed_qty(item: dict, product: dict | None = None) -> float:
    """Qty of stock in product.unit that this bill line consumes."""
    fields = conversion_product(item, product)
    raw = item.get("unit")
    line_unit = "box" if raw in (None, "") else raw
    return to_product_unit(fields, line_unit, item.get("qty") or 0, item.get("pieces") or 0)


def line_return_qty(item: dict, product: dict | None = None) -> float:
    """Comparable qty for remaining-returnable checks.

    Box/piece/area (tile) lines stay in integer pieces so existing bills match.
    Stone/slab lines return remaining sq.ft (or product.unit area) — no re-measure.
    Meter/kg/bag lines use qty in the product's priced unit.
    """
    fields = conversion_product(item, product)
    if is_slab_product(item) or is_slab_product(product) or is_slab_product(fields):
        return line_consumed_qty(item, product)
    line_u = normalize_unit_code(item.get("unit") or "box", default="box")
    tile_area = unit_kind(line_u) == "area" and sqft_per_piece(fields) > 0
    if uses_piece_stock(fields) or line_u in ("box", "piece") or tile_area:
        return float(sold_pieces(item, fields))
    return line_consumed_qty(item, product)


def stock_on_hand(product: dict) -> float:
    """StockQty in product.unit, including legacy showroom/godown fields."""
    return float(
        (product.get("stockQty") or 0)
        + (product.get("godownQty") or 0)
        + (product.get("showroomQty") or 0)
    )


def get_total_stock_pieces(product: dict) -> int:
    """Get total stock in pieces, supporting both old (showroom/godown) and new (stockQty) fields.

    stockQty is stored in the product's selling unit:
      - tiles (unit=box or missing): boxes (may be fractional)
      - sanitary (unit=piece): pieces
    """
    total_units = stock_on_hand(product)
    if product.get("unit") == "piece":
        return round(total_units)
    if not uses_piece_stock(product) and product.get("unit") not in (None, "", "box"):
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


def _stock_result(product: dict, stock_qty: float) -> dict:
    result = {"stockQty": round(max(0.0, float(stock_qty or 0)), 4)}
    if product.get("godownQty") or product.get("showroomQty"):
        result["godownQty"] = 0
        result["showroomQty"] = 0
    return result


def compute_stock_deduction(product: dict, sold_pieces: int) -> dict:
    """Compute new stockQty after a sale.

    Deducts from the unified stockQty field (in selling units).
    """
    total_pieces = get_total_stock_pieces(product)
    remaining_pieces = max(0, total_pieces - sold_pieces)

    if product.get("unit") == "piece" or (
        not uses_piece_stock(product) and product.get("unit") not in (None, "", "box")
    ):
        return _stock_result(product, float(remaining_pieces))
    ppb = int(product.get("piecesPerBox", 1) or 1)
    return _stock_result(product, remaining_pieces / ppb)


def compute_stock_addition(product: dict, add_pieces: int) -> dict:
    """Compute new stockQty after a stock-in (purchase/return).

    Adds to the unified stockQty field (in selling units).
    """
    total_pieces = get_total_stock_pieces(product) + add_pieces

    if product.get("unit") == "piece" or (
        not uses_piece_stock(product) and product.get("unit") not in (None, "", "box")
    ):
        return _stock_result(product, float(total_pieces))
    ppb = int(product.get("piecesPerBox", 1) or 1)
    return _stock_result(product, total_pieces / ppb)


def compute_stock_after_qty(product: dict, delta_product_unit: float) -> dict:
    """Apply a signed qty in product.unit to stockQty (sale negative, return positive)."""
    return _stock_result(product, stock_on_hand(product) + float(delta_product_unit or 0))


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


def enrich_line(item: dict, product: dict | None = None) -> dict:
    """Copy priced-unit fields from the catalog onto a bill line."""
    from app.common.uom import normalize_unit_code

    out = dict(item or {})
    prod = product or {}
    dest = prod.get("unit") or out.get("productUnit") or "box"
    out["productUnit"] = dest
    if out.get("packQty") is None:
        out["packQty"] = prod.get("packQty") if prod.get("packQty") is not None else 1
    if not out.get("size"):
        out["size"] = prod.get("size") or ""
    if not out.get("piecesPerBox"):
        out["piecesPerBox"] = prod.get("piecesPerBox") or 1
    raw = out.get("unit")
    if raw in (None, ""):
        out["unit"] = dest
    else:
        out["unit"] = normalize_unit_code(raw, default=dest)
    return out


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
        sold[pid] = sold.get(pid, 0) + line_return_qty(it)

    returned: dict = {}
    for it in prior_return_items or []:
        pid = it.get("productId")
        if not pid:
            continue
        returned[pid] = returned.get(pid, 0) + line_return_qty(it)

    out = {}
    for pid in sold:
        rem = sold[pid] - float(returned.get(pid, 0))
        out[pid] = max(0, int(round(rem))) if rem == int(rem) or abs(rem - round(rem)) < 1e-9 else max(0.0, rem)
    return out


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


def conversion_recorded_amount(target: str, old_credit: float, extra_detail: dict | None = None) -> float:
    """Amount that actually moved off store credit onto the convert target.

    cash: the whole credit slice is paid out.
    adjust_udhari: only the udhari that was cleared; leftover stays store credit.
    """
    if target == "cash":
        return round2(old_credit)
    return round2((extra_detail or {}).get("udhariAdjusted") or 0)


def apply_store_credit_conversion(
    old_detail: dict,
    target: str,
    extra_detail: dict | None = None,
) -> dict:
    """Move only the store-credit slice. Prior udhari (and any existing cash) stay put.

    cash: store credit becomes cash refund.
    adjust_udhari: extra_detail is the allocation of that credit slice
    (new udhari clears + leftover credit).
    """
    old_cash = round2((old_detail or {}).get("cash") or 0)
    old_udhari = round2((old_detail or {}).get("udhariAdjusted") or 0)
    old_credit = round2((old_detail or {}).get("storeCredit") or 0)
    old_allocs = list((old_detail or {}).get("invoiceAllocations") or [])
    if target == "cash":
        return {
            "cash": round2(old_cash + old_credit),
            "udhariAdjusted": old_udhari,
            "storeCredit": 0.0,
            "invoiceAllocations": old_allocs,
        }
    extra = extra_detail or {
        "cash": 0.0,
        "udhariAdjusted": 0.0,
        "storeCredit": old_credit,
        "invoiceAllocations": [],
    }
    return {
        "cash": round2(old_cash + (extra.get("cash") or 0)),
        "udhariAdjusted": round2(old_udhari + (extra.get("udhariAdjusted") or 0)),
        "storeCredit": round2(extra.get("storeCredit") or 0),
        "invoiceAllocations": old_allocs + list(extra.get("invoiceAllocations") or []),
    }


def settlement_label_from_detail(detail: dict, fallback: str = "cash") -> str:
    """Primary enum for mixed returns. Display always uses the split amounts."""
    cash = round2((detail or {}).get("cash") or 0)
    credit = round2((detail or {}).get("storeCredit") or 0)
    udhari = round2((detail or {}).get("udhariAdjusted") or 0)
    if cash > 0.01 and credit <= 0.01:
        return "cash"
    if credit > 0.01 and cash <= 0.01 and udhari <= 0.01:
        return "store_credit"
    if udhari > 0.01:
        return "adjust_udhari"
    if credit > 0.01:
        return "store_credit"
    return fallback or "cash"


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
