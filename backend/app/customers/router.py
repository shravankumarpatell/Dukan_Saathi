"""Customer API routes — CRUD + payment allocation against pending bills."""

from typing import Optional, List

from fastapi import APIRouter, Depends, Query
from app.dependencies import get_current_user, AuthenticatedUser
from app.database import get_db
from app.common.errors import NotFoundError, ConflictError, ValidationError
from app.common.calc import (
    round2,
    apply_payment_to_invoice,
    recompute_customer_total_pending,
    today_iso,
)
from app.customers.models import CustomerCreate, CustomerResponse, AllocatePaymentRequest
from google.cloud.firestore_v1 import FieldFilter
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/customers", tags=["customers"])


def _customers_ref(shop_id: str):
    return get_db().collection("shops").document(shop_id).collection("customers")


def _to_response(doc_id: str, data: dict) -> CustomerResponse:
    return CustomerResponse(
        id=doc_id,
        name=data.get("name", ""),
        phone=data.get("phone", ""),
        isContractor=data.get("isContractor", False),
        siteNote=data.get("siteNote", ""),
        totalPending=data.get("totalPending", 0) or 0,
        storeCredit=data.get("storeCredit", 0) or 0,
    )


def _list_customer_sales(invoices_col, customer_id: str) -> list:
    out = []
    q = invoices_col.where(filter=FieldFilter("customerId", "==", customer_id))
    for doc in q.stream():
        data = doc.to_dict() or {}
        if data.get("type") == "sale":
            out.append({**data, "id": doc.id})
    out.sort(key=lambda i: i.get("date") or "")
    return out


def _list_customer_returns(invoices_col, customer_id: str) -> list:
    out = []
    q = invoices_col.where(filter=FieldFilter("customerId", "==", customer_id))
    for doc in q.stream():
        data = doc.to_dict() or {}
        if data.get("type") == "return":
            out.append({**data, "id": doc.id})
    out.sort(key=lambda i: i.get("date") or "")
    return out


@router.get("", response_model=List[CustomerResponse])
async def list_customers(
    role: Optional[str] = Query(
        None,
        pattern="^(all|customer|contractor)$",
        description="Filter: all (default), customer (retail), or contractor (contractor/dealer).",
    ),
    user: AuthenticatedUser = Depends(get_current_user),
):
    """List customers for the shop, optionally filtered by role."""
    docs = _customers_ref(user.uid).stream()
    out = [_to_response(d.id, d.to_dict()) for d in docs]
    if role == "contractor":
        return [c for c in out if c.isContractor]
    if role == "customer":
        return [c for c in out if not c.isContractor]
    return out


@router.post("", response_model=CustomerResponse, status_code=201)
async def create_customer(
    body: CustomerCreate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Create a new customer. Names must be unique (case-insensitive)."""
    col = _customers_ref(user.uid)
    name_lower = body.name.strip().lower()

    for doc in col.stream():
        if (doc.to_dict().get("name", "").strip().lower() == name_lower):
            raise ConflictError(f"Customer '{body.name}' already exists")

    data = {
        "name": body.name.strip(),
        "phone": body.phone,
        "isContractor": body.isContractor,
        "siteNote": body.siteNote,
        "totalPending": 0,
        "storeCredit": 0,
    }
    _, doc_ref = col.add(data)
    return _to_response(doc_ref.id, data)


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get a single customer."""
    snap = _customers_ref(user.uid).document(customer_id).get()
    if not snap.exists:
        raise NotFoundError("Customer", customer_id)
    return _to_response(snap.id, snap.to_dict())


@router.post("/{customer_id}/payment", response_model=dict)
async def allocate_payment(
    customer_id: str,
    body: AllocatePaymentRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Record a payment allocated across specific pending invoices.

    Caps each allocation to the invoice's current amountPending, verifies the
    invoice belongs to this customer and is a sale, then recomputes
    customer.totalPending from open sale pendings.
    """
    db = get_db()
    shop_ref = db.collection("shops").document(user.uid)
    customers_col = shop_ref.collection("customers")
    invoices_col = shop_ref.collection("invoices")

    cust_snap = customers_col.document(customer_id).get()
    if not cust_snap.exists:
        raise NotFoundError("Customer", customer_id)

    if not body.allocations:
        raise ValidationError("Kam se kam ek bill ke against amount daaliye")

    total_paid = 0.0
    sales_cache: dict = {}

    for alloc in body.allocations:
        amount = round2(alloc.amount)
        if amount <= 0:
            continue

        inv_snap = invoices_col.document(alloc.invoiceId).get()
        if not inv_snap.exists:
            raise NotFoundError("Invoice", alloc.invoiceId)

        inv_data = {**(inv_snap.to_dict() or {}), "id": inv_snap.id}

        if inv_data.get("type") != "sale":
            raise ValidationError("Sirf sale invoices par payment allocate ho sakti hai")
        if (inv_data.get("customerId") or "") != customer_id:
            raise ValidationError("Ye bill is customer ka nahi hai")

        pending = round2(inv_data.get("amountPending", 0) or 0)
        if pending <= 0.5:
            raise ValidationError(
                f"{inv_data.get('invoiceNo') or alloc.invoiceId} pe koi pending nahi hai"
            )

        capped = round2(min(amount, pending))
        if capped + 0.01 < amount:
            # Soft-cap rather than hard-reject so UI "Full" rounding is safe.
            amount = capped

        fields = apply_payment_to_invoice(
            inv_data,
            amount,
            {"mode": body.mode or "cash", "date": today_iso()},
        )
        applied = round2(fields.pop("_applied", 0) or 0)
        if applied <= 0:
            continue

        invoices_col.document(alloc.invoiceId).update({
            "amountPaid": fields["amountPaid"],
            "amountPending": fields["amountPending"],
            "paymentStatus": fields["paymentStatus"],
            "payments": fields["payments"],
        })
        sales_cache[alloc.invoiceId] = {**inv_data, **fields}
        total_paid = round2(total_paid + applied)

    # Recompute totalPending from all sales (source of truth)
    sales = _list_customer_sales(invoices_col, customer_id)
    for sid, patched in sales_cache.items():
        for i, s in enumerate(sales):
            if s["id"] == sid:
                sales[i] = {**s, **patched}
                break
    new_pending = recompute_customer_total_pending(sales)
    customers_col.document(customer_id).update({"totalPending": new_pending})

    logger.info(
        "Payment of %s allocated for customer %s across %d bills (pending now %s)",
        total_paid, customer_id, len(body.allocations), new_pending,
    )

    return {
        "totalPaid": total_paid,
        "customerId": customer_id,
        "totalPending": new_pending,
    }


@router.post("/{customer_id}/reconcile", response_model=dict)
async def reconcile_customer(
    customer_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Repair desynced udhari: attribute historic returns onto sale invoices.

    For each return lacking return_adjust payments, allocate its refund onto
    open sales (prefer originalInvoiceNo, then FIFO). Then set
    customer.totalPending = sum(sale.amountPending).

    Does not change storeCredit (already applied historically).
    """
    db = get_db()
    shop_ref = db.collection("shops").document(user.uid)
    customers_col = shop_ref.collection("customers")
    invoices_col = shop_ref.collection("invoices")

    cust_snap = customers_col.document(customer_id).get()
    if not cust_snap.exists:
        raise NotFoundError("Customer", customer_id)

    sales = _list_customer_sales(invoices_col, customer_id)
    sales_by_id = {s["id"]: s for s in sales}
    sales_by_no = {s.get("invoiceNo"): s for s in sales if s.get("invoiceNo")}
    returns = _list_customer_returns(invoices_col, customer_id)

    adjusted_returns = 0
    applied_total = 0.0

    for ret in returns:
        ret_no = ret.get("invoiceNo") or ""
        refund = round2(ret.get("refundTotal", 0) or ret.get("grandTotal", 0) or 0)
        if refund <= 0 or not ret_no:
            continue

        # Skip if this return already wrote return_adjust payments.
        already = False
        for s in sales_by_id.values():
            for p in (s.get("payments") or []):
                if (p.get("mode") or "") == "return_adjust" and (p.get("returnInvoiceNo") or "") == ret_no:
                    already = True
                    break
            if already:
                break
        if already:
            continue

        remaining = refund
        # Prefer original invoice first
        order = []
        orig_no = (ret.get("originalInvoiceNo") or "").strip()
        if orig_no and orig_no in sales_by_no:
            order.append(sales_by_no[orig_no])
        for s in sorted(sales_by_id.values(), key=lambda i: i.get("date") or ""):
            if orig_no and s.get("invoiceNo") == orig_no:
                continue
            order.append(s)

        for sale in order:
            if remaining <= 0.01:
                break
            pending = round2(sale.get("amountPending", 0) or 0)
            if pending <= 0.5:
                continue
            fields = apply_payment_to_invoice(
                sale,
                remaining,
                {"mode": "return_adjust", "returnInvoiceNo": ret_no, "date": today_iso()},
            )
            applied = round2(fields.pop("_applied", 0) or 0)
            if applied <= 0:
                continue
            invoices_col.document(sale["id"]).update({
                "amountPaid": fields["amountPaid"],
                "amountPending": fields["amountPending"],
                "paymentStatus": fields["paymentStatus"],
                "payments": fields["payments"],
            })
            sale.update(fields)
            sales_by_id[sale["id"]] = sale
            if sale.get("invoiceNo"):
                sales_by_no[sale["invoiceNo"]] = sale
            remaining = round2(remaining - applied)
            applied_total = round2(applied_total + applied)

        adjusted_returns += 1

    sales = list(sales_by_id.values())
    new_pending = recompute_customer_total_pending(sales)
    old_pending = round2((cust_snap.to_dict() or {}).get("totalPending", 0) or 0)
    customers_col.document(customer_id).update({"totalPending": new_pending})

    logger.info(
        "Reconciled customer %s: returns=%s applied=%s pending %s -> %s",
        customer_id, adjusted_returns, applied_total, old_pending, new_pending,
    )

    return {
        "customerId": customer_id,
        "returnsProcessed": adjusted_returns,
        "amountAppliedToInvoices": applied_total,
        "totalPendingBefore": old_pending,
        "totalPending": new_pending,
    }
