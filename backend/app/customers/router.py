from typing import Optional, List, Dict
"""Customer API routes — CRUD + payment allocation against pending bills."""

from fastapi import APIRouter, Depends
from app.dependencies import get_current_user, AuthenticatedUser
from app.database import get_db
from app.common.errors import NotFoundError, ConflictError, ValidationError
from app.common.calc import round2
from app.customers.models import CustomerCreate, CustomerResponse, AllocatePaymentRequest
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


@router.get("", response_model=List[CustomerResponse])
async def list_customers(user: AuthenticatedUser = Depends(get_current_user)):
    """List all customers for the shop."""
    docs = _customers_ref(user.uid).stream()
    return [_to_response(d.id, d.to_dict()) for d in docs]


@router.post("", response_model=CustomerResponse, status_code=201)
async def create_customer(
    body: CustomerCreate,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Create a new customer. Names must be unique (case-insensitive)."""
    col = _customers_ref(user.uid)
    name_lower = body.name.strip().lower()

    # Check uniqueness
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

    For each allocation:
    1. Adds the amount to the invoice's amountPaid
    2. Recalculates amountPending and paymentStatus
    3. Appends the payment entry to the invoice's payments array

    Then reduces the customer's totalPending by the total amount paid.
    """
    db = get_db()
    shop_ref = db.collection("shops").document(user.uid)
    customers_col = shop_ref.collection("customers")
    invoices_col = shop_ref.collection("invoices")

    # Verify customer exists
    cust_snap = customers_col.document(customer_id).get()
    if not cust_snap.exists:
        raise NotFoundError("Customer", customer_id)
    customer = cust_snap.to_dict()

    total_paid = 0.0

    for alloc in body.allocations:
        inv_snap = invoices_col.document(alloc.invoiceId).get()
        if not inv_snap.exists:
            raise NotFoundError("Invoice", alloc.invoiceId)

        inv_data = inv_snap.to_dict()
        new_paid = round2((inv_data.get("amountPaid", 0) or 0) + alloc.amount)
        new_pending = round2((inv_data.get("grandTotal", 0) or 0) - new_paid)

        if new_pending <= 0.5:
            status = "paid"
        elif new_paid > 0.5:
            status = "partial"
        else:
            status = "pending"

        existing_payments = inv_data.get("payments", []) or []
        existing_payments.append({"mode": body.mode, "amount": alloc.amount})

        invoices_col.document(alloc.invoiceId).update({
            "amountPaid": new_paid,
            "amountPending": max(0, new_pending),
            "paymentStatus": status,
            "payments": existing_payments,
        })

        total_paid += alloc.amount

    # Update customer balance
    if total_paid > 0:
        new_pending = max(0, round2((customer.get("totalPending", 0) or 0) - total_paid))
        customers_col.document(customer_id).update({"totalPending": new_pending})

    logger.info(
        "Payment of %s allocated for customer %s across %d bills",
        total_paid, customer_id, len(body.allocations),
    )

    return {"totalPaid": total_paid, "customerId": customer_id}
