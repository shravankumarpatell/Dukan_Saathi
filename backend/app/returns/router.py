from typing import Optional, List, Dict
"""Return API routes — process return invoices with stock restoration and settlement."""

from fastapi import APIRouter, Depends
from app.dependencies import get_current_user, AuthenticatedUser
from app.database import get_db
from app.common.errors import NotFoundError, ValidationError
from app.common.calc import (
    gen_invoice_no, calculate_sold_pieces, compute_stock_addition,
    round2, today_iso, item_amount,
)
from app.returns.models import CreateReturnRequest, UpdateReturnRequest
from app.invoices.models import InvoiceResponse
from google.cloud.firestore_v1 import Increment, FieldFilter
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/returns", tags=["returns"])


def _empty_detail() -> dict:
    return {"cash": 0.0, "udhariAdjusted": 0.0, "storeCredit": 0.0}


def _to_response(doc_id: str, data: dict) -> InvoiceResponse:
    fields = InvoiceResponse.model_fields
    return InvoiceResponse(id=doc_id, **{
        k: data.get(k, fields[k].default) for k in fields if k != "id"
    })


def _validate_settlement(settlement: str, customer: Optional[dict]) -> None:
    """A settlement mode is only valid if the customer can actually absorb it."""
    if settlement == "cash":
        return
    if not customer:
        raise ValidationError(
            "Walk-in customers can only be refunded in cash. Select a saved customer for udhari/store credit."
        )
    if settlement == "adjust_udhari" and round2(customer.get("totalPending", 0) or 0) <= 0:
        raise ValidationError(
            "This customer has no udhari to adjust. Use cash refund or store credit instead."
        )


def _apply_settlement(customer: dict, settlement: str, refund: float) -> tuple[dict, dict]:
    """Compute customer balance updates for a settlement.

    Returns (updates, detail). `detail` records exactly how the refund was
    settled so the effect can be reversed later if the return is re-settled.
    Any part of an udhari adjustment that exceeds the pending amount becomes
    store credit, so the shop's books stay balanced.
    """
    pending = round2(customer.get("totalPending", 0) or 0)
    credit = round2(customer.get("storeCredit", 0) or 0)
    detail = _empty_detail()
    updates: dict = {}

    if settlement == "adjust_udhari":
        adjusted = min(refund, pending)
        detail["udhariAdjusted"] = round2(adjusted)
        updates["totalPending"] = round2(pending - adjusted)
        excess = round2(refund - adjusted)
        if excess > 0:
            detail["storeCredit"] = excess
            updates["storeCredit"] = round2(credit + excess)
    elif settlement == "store_credit":
        detail["storeCredit"] = round2(refund)
        updates["storeCredit"] = round2(credit + refund)
    else:  # cash — money leaves the drawer, no customer balance changes
        detail["cash"] = round2(refund)

    return updates, detail


def _reverse_settlement(customer: dict, detail: dict) -> dict:
    """Undo a previously applied settlement on the customer's balances."""
    pending = round2(customer.get("totalPending", 0) or 0)
    credit = round2(customer.get("storeCredit", 0) or 0)
    updates: dict = {}

    if detail.get("udhariAdjusted"):
        updates["totalPending"] = round2(pending + detail["udhariAdjusted"])
    if detail.get("storeCredit"):
        updates["storeCredit"] = max(0.0, round2(credit - detail["storeCredit"]))

    return updates


def _detail_of(inv: dict) -> dict:
    """Settlement detail of a return, derived for records saved before it was tracked."""
    stored = inv.get("settlementDetail")
    if isinstance(stored, dict):
        return {**_empty_detail(), **stored}

    refund = round2(inv.get("refundTotal", 0) or 0)
    detail = _empty_detail()
    settlement = inv.get("settlement") or "cash"
    if settlement == "adjust_udhari":
        detail["udhariAdjusted"] = refund
    elif settlement == "store_credit":
        detail["storeCredit"] = refund
    else:
        detail["cash"] = refund
    return detail


@router.post("", response_model=InvoiceResponse, status_code=201)
async def create_return(
    body: CreateReturnRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Process a return invoice.

    1. Validates all returned items exist
    2. Generates a RET-prefixed invoice number
    3. Restores stock to godown for each returned item
    4. Applies settlement (cash refund / adjust udhari / store credit)
    5. Records the return
    """
    db = get_db()
    shop_ref = db.collection("shops").document(user.uid)
    products_col = shop_ref.collection("products")
    invoices_col = shop_ref.collection("invoices")
    customers_col = shop_ref.collection("customers")
    returns_col = shop_ref.collection("returns")
    ledger_col = shop_ref.collection("stockLedger")

    # Validate returned items exist as products
    for item in body.items:
        snap = products_col.document(item.productId).get()
        if not snap.exists:
            raise NotFoundError("Product", item.productId)

    # Load the customer up front — settlement mode depends on their balances
    customer = None
    cust_ref = None
    if body.customerId:
        cust_ref = customers_col.document(body.customerId)
        cust_snap = cust_ref.get()
        if cust_snap.exists:
            customer = cust_snap.to_dict()
        else:
            cust_ref = None

    _validate_settlement(body.settlement, customer)

    # Generate return invoice number
    shop_snap = shop_ref.get()
    shop_data = shop_snap.to_dict() if shop_snap.exists else {}
    seq = shop_data.get("invoiceSeq", 1) or 1
    invoice_no = gen_invoice_no(seq, False, "RET")
    shop_ref.update({"invoiceSeq": Increment(1)})

    # Build return invoice
    items_data = [it.model_dump() for it in body.items]
    subtotal = round2(sum(item_amount(it) for it in items_data))

    # Settlement
    detail = _empty_detail()
    if customer is not None and cust_ref is not None:
        updates, detail = _apply_settlement(customer, body.settlement, body.refundTotal)
        if updates:
            cust_ref.update(updates)
    else:
        detail["cash"] = round2(body.refundTotal)

    inv = {
        "invoiceNo": invoice_no,
        "date": today_iso(),
        "type": "return",
        "customerId": body.customerId,
        "customerName": body.customerName or "Walk-in",
        "items": items_data,
        "gstEnabled": False,
        "gstRate": 0,
        "subtotal": subtotal,
        "discountOff": 0,
        "gstAmount": 0,
        "grandTotal": body.refundTotal,
        "payments": [],
        "amountPaid": 0,
        "amountPending": 0,
        "paymentStatus": "return",
        "createdVia": "manual",
        "settlement": body.settlement,
        "settlementDetail": detail,
        "originalInvoiceNo": body.originalInvoiceNo,
        "refundTotal": body.refundTotal,
    }

    _, inv_ref = invoices_col.add(inv)

    # Restore stock to godown
    for item in body.items:
        product = products_col.document(item.productId).get().to_dict()
        add_pieces = calculate_sold_pieces(item.model_dump())
        if add_pieces > 0:
            new_qty = compute_stock_addition(product, add_pieces)
            products_col.document(item.productId).update(new_qty)
            ledger_col.add({
                "productId": item.productId,
                "change": add_pieces,
                "reason": "return",
                "invoiceId": inv_ref.id,
                "timestamp": today_iso(),
            })

    # Record in returns collection
    returns_col.add({
        "invoiceNo": invoice_no,
        "originalInvoiceNo": body.originalInvoiceNo,
        "customerId": body.customerId,
        "customerName": body.customerName,
        "items": items_data,
        "refundTotal": body.refundTotal,
        "settlement": body.settlement,
        "settlementDetail": detail,
        "date": today_iso(),
    })

    logger.info("Return %s created against %s", invoice_no, body.originalInvoiceNo)

    return _to_response(inv_ref.id, inv)


@router.put("/{invoice_id}", response_model=InvoiceResponse)
async def update_return_settlement(
    invoice_id: str,
    body: UpdateReturnRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Re-settle an existing return.

    Typical case: the customer took store credit, then later wants the cash.
    The old settlement is reversed on the customer's balances and the new one
    applied, so udhari and store credit stay consistent. Returned items and
    stock are untouched.
    """
    db = get_db()
    shop_ref = db.collection("shops").document(user.uid)
    invoices_col = shop_ref.collection("invoices")
    customers_col = shop_ref.collection("customers")
    returns_col = shop_ref.collection("returns")

    inv_ref = invoices_col.document(invoice_id)
    inv_snap = inv_ref.get()
    if not inv_snap.exists:
        raise NotFoundError("Return", invoice_id)

    inv = inv_snap.to_dict()
    if inv.get("type") != "return":
        raise ValidationError("Only return invoices can be re-settled")

    new_refund = round2(
        inv.get("refundTotal", 0) or 0 if body.refundTotal is None else body.refundTotal
    )

    customer = None
    cust_ref = None
    if inv.get("customerId"):
        cust_ref = customers_col.document(inv["customerId"])
        cust_snap = cust_ref.get()
        if cust_snap.exists:
            customer = cust_snap.to_dict()
        else:
            cust_ref = None

    old_detail = _detail_of(inv)
    detail = _empty_detail()

    if customer is not None and cust_ref is not None:
        # Reverse the old effect first, then validate the new mode against the
        # balances the customer would have once reversed.
        reverted = _reverse_settlement(customer, old_detail)
        restored = {**customer, **reverted}

        _validate_settlement(body.settlement, restored)

        applied, detail = _apply_settlement(restored, body.settlement, new_refund)
        final_updates = {**reverted, **applied}
        if final_updates:
            cust_ref.update(final_updates)
    else:
        _validate_settlement(body.settlement, None)
        detail["cash"] = new_refund

    patch = {
        "settlement": body.settlement,
        "settlementDetail": detail,
        "refundTotal": new_refund,
        "grandTotal": new_refund,
    }
    inv_ref.update(patch)

    # Keep the mirrored returns collection in sync
    mirror = returns_col.where(filter=FieldFilter("invoiceNo", "==", inv.get("invoiceNo", "")))
    for doc in mirror.stream():
        returns_col.document(doc.id).update({
            "settlement": body.settlement,
            "settlementDetail": detail,
            "refundTotal": new_refund,
        })

    logger.info(
        "Return %s re-settled as %s (refund %s)",
        inv.get("invoiceNo"), body.settlement, new_refund,
    )

    return _to_response(invoice_id, {**inv, **patch})
