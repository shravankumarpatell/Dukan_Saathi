"""Return API routes — process return invoices with stock restoration and settlement.

Settlement policy:
1. Always clear unpaid portion on the original sale first (synthetic return_adjust).
2. Leftover by mode: adjust_udhari FIFOs other open sales then store credit;
   cash / store_credit take the leftover.
3. customer.totalPending is always recomputed from open sale amountPendings.
"""

from typing import Optional

from fastapi import APIRouter, Depends
from app.dependencies import get_current_user, AuthenticatedUser
from app.database import get_db
from app.common.errors import NotFoundError, ValidationError
from app.common.calc import (
    gen_invoice_no, calculate_sold_pieces, compute_stock_addition,
    round2, today_iso, item_amount,
    remaining_returnable_by_product, remaining_returnable_amount,
    allocate_return_across_invoices, remove_return_adjust_payments,
    recompute_customer_total_pending, format_stock_pieces_label,
)
from app.returns.models import CreateReturnRequest, ConvertStoreCreditRequest
from app.invoices.models import InvoiceResponse
from google.cloud.firestore_v1 import Increment, FieldFilter
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/returns", tags=["returns"])


def _empty_detail() -> dict:
    return {
        "cash": 0.0,
        "udhariAdjusted": 0.0,
        "storeCredit": 0.0,
        "invoiceAllocations": [],
    }


def _to_response(doc_id: str, data: dict) -> InvoiceResponse:
    fields = InvoiceResponse.model_fields
    return InvoiceResponse(id=doc_id, **{
        k: data.get(k, fields[k].default) for k in fields if k != "id"
    })


def _find_sale_by_invoice_no(invoices_col, invoice_no: str) -> tuple:
    """Return (doc_id, data) for a sale invoice, or (None, None)."""
    q = invoices_col.where(filter=FieldFilter("invoiceNo", "==", invoice_no))
    for doc in q.stream():
        data = doc.to_dict() or {}
        if data.get("type") == "sale":
            return doc.id, data
    return None, None


def _list_prior_returns(invoices_col, original_invoice_no: str, exclude_invoice_no: str = None) -> list:
    """Prior return invoices against the same original sale."""
    out = []
    q = invoices_col.where(filter=FieldFilter("originalInvoiceNo", "==", original_invoice_no))
    for doc in q.stream():
        data = doc.to_dict() or {}
        if data.get("type") != "return":
            continue
        if exclude_invoice_no and data.get("invoiceNo") == exclude_invoice_no:
            continue
        out.append({**data, "id": doc.id})
    return out


def _list_customer_sales(invoices_col, customer_id: str) -> list:
    """All sale invoices for a customer (with id attached)."""
    if not customer_id:
        return []
    out = []
    q = invoices_col.where(filter=FieldFilter("customerId", "==", customer_id))
    for doc in q.stream():
        data = doc.to_dict() or {}
        if data.get("type") == "sale":
            out.append({**data, "id": doc.id})
    out.sort(key=lambda i: i.get("date") or "")
    return out


def _validate_settlement(settlement: str, customer: Optional[dict], open_pending: float = None) -> None:
    if settlement == "cash":
        return
    if not customer:
        raise ValidationError(
            "Walk-in customers can only be refunded in cash. Select a saved customer for udhari/store credit."
        )
    if settlement == "adjust_udhari":
        pending = (
            round2(open_pending)
            if open_pending is not None
            else round2(customer.get("totalPending", 0) or 0)
        )
        if pending <= 0:
            raise ValidationError(
                "This customer has no udhari to adjust. Use cash refund or store credit instead."
            )


def _detail_of(inv: dict) -> dict:
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


def _write_invoice_patches(invoices_col, patches: list) -> None:
    for p in patches:
        if p.get("id") and p.get("fields"):
            invoices_col.document(p["id"]).update(p["fields"])


def _reverse_return_adjusts(invoices_col, return_invoice_no: str, sales: list) -> list:
    """Remove return_adjust payments for this return from all sales; return updated sales."""
    updated = []
    for sale in sales:
        payments = sale.get("payments") or []
        has = any(
            (p.get("mode") or "") == "return_adjust"
            and (p.get("returnInvoiceNo") or "") == return_invoice_no
            for p in payments
        )
        if not has:
            updated.append(sale)
            continue
        fields = remove_return_adjust_payments(sale, return_invoice_no)
        invoices_col.document(sale["id"]).update(fields)
        updated.append({**sale, **fields})
    return updated


def _apply_store_credit_delta(cust_ref, customer: dict, credit_delta: float) -> dict:
    """Apply store-credit change; return new customer snapshot fields."""
    credit_delta = round2(credit_delta)
    if abs(credit_delta) < 0.0001 or not cust_ref:
        return {}
    current = round2(customer.get("storeCredit", 0) or 0)
    new_credit = max(0.0, round2(current + credit_delta))
    cust_ref.update({"storeCredit": new_credit})
    return {"storeCredit": new_credit}


def _set_total_pending_from_sales(cust_ref, sales: list) -> float:
    total = recompute_customer_total_pending(sales)
    if cust_ref:
        cust_ref.update({"totalPending": total})
    return total


def _validate_return_qty(original_items: list, prior_returns: list, new_items: list) -> None:
    prior_items = []
    for r in prior_returns:
        prior_items.extend(r.get("items") or [])
    remaining = remaining_returnable_by_product(original_items, prior_items)

    # Also reject unknown product lines not on the original bill.
    original_ids = {it.get("productId") for it in (original_items or []) if it.get("productId")}

    for it in new_items:
        pid = it.get("productId")
        if not pid:
            raise ValidationError("Return item me productId zaroori hai")
        if pid not in original_ids:
            raise ValidationError(f"'{it.get('name') or pid}' is original bill me nahi tha")
        want = calculate_sold_pieces(it)
        left = int(remaining.get(pid, 0))
        if want > left:
            # Build a friendly label using the return line's unit meta.
            label = format_stock_pieces_label(it, left)
            raise ValidationError(
                f"'{it.get('name') or pid}' me sirf {label} return ho sakta hai (pehle se return ho chuka / sold se zyada)"
            )
        remaining[pid] = left - want


@router.post("", response_model=InvoiceResponse, status_code=201)
async def create_return(
    body: CreateReturnRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Process a return invoice with ledger-consistent settlement."""
    db = get_db()
    shop_ref = db.collection("shops").document(user.uid)
    products_col = shop_ref.collection("products")
    invoices_col = shop_ref.collection("invoices")
    customers_col = shop_ref.collection("customers")
    returns_col = shop_ref.collection("returns")
    ledger_col = shop_ref.collection("stockLedger")

    if not (body.originalInvoiceNo or "").strip():
        raise ValidationError("Original invoice number zaroori hai")

    # Validate returned items exist as products
    for item in body.items:
        snap = products_col.document(item.productId).get()
        if not snap.exists:
            raise NotFoundError("Product", item.productId)

    # Load original sale
    original_id, original = _find_sale_by_invoice_no(invoices_col, body.originalInvoiceNo.strip())
    if not original_id:
        raise NotFoundError("Invoice", body.originalInvoiceNo)
    original = {**original, "id": original_id}

    # Prior returns against this bill
    prior = _list_prior_returns(invoices_col, body.originalInvoiceNo.strip())
    items_data = [it.model_dump() for it in body.items]
    _validate_return_qty(original.get("items") or [], prior, items_data)

    # Refund: prefer line subtotal; cap by remaining returnable amount
    subtotal = round2(sum(item_amount(it) for it in items_data))
    max_refund = remaining_returnable_amount(original, prior)
    requested = round2(body.refundTotal if body.refundTotal is not None else subtotal)
    if requested > max_refund + 0.01:
        raise ValidationError(
            f"Refund ₹{requested:.2f} is bill se zyada returnable nahi (max ₹{max_refund:.2f})"
        )
    # Prefer server subtotal when client sends 0 / empty; otherwise allow override within cap.
    refund = requested if requested > 0 else min(subtotal, max_refund)
    refund = round2(min(refund, max_refund))
    if refund <= 0:
        raise ValidationError("Refund amount 0 nahi ho sakta")

    # Customer
    customer = None
    cust_ref = None
    customer_id = body.customerId or original.get("customerId")
    if customer_id:
        cust_ref = customers_col.document(customer_id)
        cust_snap = cust_ref.get()
        if cust_snap.exists:
            customer = cust_snap.to_dict()
        else:
            cust_ref = None
            customer_id = None

    sales = _list_customer_sales(invoices_col, customer_id) if customer_id else []
    # Ensure original is in the working set with latest fields
    sales_by_id = {s["id"]: s for s in sales}
    sales_by_id[original_id] = {**sales_by_id.get(original_id, original), **original, "id": original_id}
    sales = sorted(sales_by_id.values(), key=lambda i: i.get("date") or "")
    open_pending = recompute_customer_total_pending(sales)

    _validate_settlement(body.settlement, customer, open_pending=open_pending)

    # Generate return invoice number first (needed for payment tags)
    shop_snap = shop_ref.get()
    shop_data = shop_snap.to_dict() if shop_snap.exists else {}
    seq = shop_data.get("invoiceSeq", 1) or 1
    invoice_no = gen_invoice_no(seq, False, "RET")
    shop_ref.update({"invoiceSeq": Increment(1)})

    working_original = sales_by_id[original_id]
    others = [s for s in sales if s["id"] != original_id]
    patches, detail, _ = allocate_return_across_invoices(
        refund,
        working_original,
        others if body.settlement == "adjust_udhari" else [],
        return_invoice_no=invoice_no,
        settlement=body.settlement,
    )
    _write_invoice_patches(invoices_col, patches)

    # Refresh sales after patches for recompute
    for p in patches:
        if p["id"] in sales_by_id:
            sales_by_id[p["id"]].update(p["fields"])
    sales = list(sales_by_id.values())

    # Store credit from settlement detail; totalPending from invoices
    if customer is not None and cust_ref is not None:
        credit_add = round2(detail.get("storeCredit", 0) or 0)
        if credit_add > 0:
            customer = {**customer, **_apply_store_credit_delta(cust_ref, customer, credit_add)}
        _set_total_pending_from_sales(cust_ref, sales)

    inv = {
        "invoiceNo": invoice_no,
        "date": today_iso(),
        "type": "return",
        "customerId": customer_id,
        "customerName": body.customerName or original.get("customerName") or "Walk-in",
        "isContractor": bool((customer or original).get("isContractor", False)),
        "siteNote": (customer or original).get("siteNote", "") or "",
        "items": items_data,
        "gstEnabled": False,
        "gstRate": 0,
        "subtotal": subtotal,
        "discountOff": 0,
        "gstAmount": 0,
        "grandTotal": refund,
        "payments": [],
        "amountPaid": 0,
        "amountPending": 0,
        "paymentStatus": "return",
        "createdVia": "manual",
        "settlement": body.settlement,
        "settlementDetail": detail,
        "originalInvoiceNo": body.originalInvoiceNo.strip(),
        "refundTotal": refund,
    }

    _, inv_ref = invoices_col.add(inv)

    # Restore stock after validation / settlement
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

    returns_col.add({
        "invoiceNo": invoice_no,
        "originalInvoiceNo": body.originalInvoiceNo.strip(),
        "customerId": customer_id,
        "customerName": inv["customerName"],
        "items": items_data,
        "refundTotal": refund,
        "settlement": body.settlement,
        "settlementDetail": detail,
        "date": today_iso(),
    })

    logger.info("Return %s created against %s", invoice_no, body.originalInvoiceNo)
    return _to_response(inv_ref.id, inv)


@router.post("/{invoice_id}/convert-store-credit", response_model=InvoiceResponse)
async def convert_store_credit_return(
    invoice_id: str,
    body: ConvertStoreCreditRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Convert a store-credit return to cash refund or adjust-udhari.

    Items/stock are untouched. Reverses old store credit + return_adjust
    payments, then re-allocates the same refund under the new settlement.
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

    inv = inv_snap.to_dict() or {}
    if inv.get("type") != "return":
        raise ValidationError("Only return invoices can be converted")

    old_detail = _detail_of(inv)
    old_credit = round2(old_detail.get("storeCredit", 0) or 0)
    current_settlement = (inv.get("settlement") or "").strip()
    if current_settlement != "store_credit" and old_credit <= 0.01:
        raise ValidationError("Sirf store-credit return convert ho sakta hai")

    target = body.targetSettlement
    if target not in ("cash", "adjust_udhari"):
        raise ValidationError("Target settlement cash ya adjust_udhari hona chahiye")

    return_no = inv.get("invoiceNo") or ""
    original_no = (inv.get("originalInvoiceNo") or "").strip()
    new_refund = round2(inv.get("refundTotal", 0) or inv.get("grandTotal", 0) or 0)
    if new_refund <= 0:
        raise ValidationError("Refund amount 0 nahi ho sakta")

    # Cap refund against remaining returnable (excluding this return itself)
    original = None
    original_id = None
    if original_no:
        original_id, original = _find_sale_by_invoice_no(invoices_col, original_no)
        if original_id:
            prior = _list_prior_returns(invoices_col, original_no, exclude_invoice_no=return_no)
            max_refund = remaining_returnable_amount({**original, "id": original_id}, prior)
            if new_refund > max_refund + 0.01:
                raise ValidationError(
                    f"Refund ₹{new_refund:.2f} is bill se zyada returnable nahi (max ₹{max_refund:.2f})"
                )
            new_refund = round2(min(new_refund, max_refund))
            original = {**original, "id": original_id}

    customer = None
    cust_ref = None
    customer_id = inv.get("customerId")
    if customer_id:
        cust_ref = customers_col.document(customer_id)
        cust_snap = cust_ref.get()
        if cust_snap.exists:
            customer = cust_snap.to_dict()
        else:
            cust_ref = None

    # Reverse old store credit first
    if customer is not None and cust_ref is not None and old_credit > 0:
        customer = {**customer, **_apply_store_credit_delta(cust_ref, customer, -old_credit)}

    # Reverse old return_adjust payments on sales
    sales = _list_customer_sales(invoices_col, customer_id) if customer_id else []
    if original_id and original and original_id not in {s["id"] for s in sales}:
        sales.append(original)
    sales = _reverse_return_adjusts(invoices_col, return_no, sales)

    open_pending = recompute_customer_total_pending(sales)
    _validate_settlement(target, customer, open_pending=open_pending)

    detail = _empty_detail()
    if customer is not None and cust_ref is not None and original:
        sales_by_id = {s["id"]: s for s in sales}
        if original_id:
            sales_by_id[original_id] = {
                **sales_by_id.get(original_id, original),
                **original,
                "id": original_id,
            }
        working_original = sales_by_id.get(original_id) or original
        others = [s for s in sales_by_id.values() if s["id"] != original_id]
        patches, detail, _ = allocate_return_across_invoices(
            new_refund,
            working_original,
            others if target == "adjust_udhari" else [],
            return_invoice_no=return_no,
            settlement=target,
        )
        _write_invoice_patches(invoices_col, patches)
        for p in patches:
            if p["id"] in sales_by_id:
                sales_by_id[p["id"]].update(p["fields"])
        sales = list(sales_by_id.values())

        credit_add = round2(detail.get("storeCredit", 0) or 0)
        if credit_add > 0:
            _apply_store_credit_delta(cust_ref, customer, credit_add)
        _set_total_pending_from_sales(cust_ref, sales)
    else:
        # Walk-in / no original — cash only path
        _validate_settlement(target, None)
        detail["cash"] = new_refund
        if cust_ref:
            _set_total_pending_from_sales(cust_ref, sales)

    converted_at = today_iso()
    patch = {
        "settlement": target,
        "settlementDetail": detail,
        "refundTotal": new_refund,
        "grandTotal": new_refund,
        "settlementConvertedAt": converted_at,
    }
    inv_ref.update(patch)

    mirror = returns_col.where(filter=FieldFilter("invoiceNo", "==", return_no))
    for doc in mirror.stream():
        returns_col.document(doc.id).update({
            "settlement": target,
            "settlementDetail": detail,
            "refundTotal": new_refund,
            "settlementConvertedAt": converted_at,
        })

    logger.info(
        "Return %s store-credit converted to %s (refund %s)",
        return_no, target, new_refund,
    )
    return _to_response(invoice_id, {**inv, **patch})
