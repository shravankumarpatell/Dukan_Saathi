from typing import Optional, List, Dict
"""Invoice API routes — the most critical endpoint. Server-side commitBill."""

from fastapi import APIRouter, Depends
from app.dependencies import get_current_user, AuthenticatedUser
from app.database import get_db
from app.common.errors import NotFoundError, InsufficientStockError, ValidationError
from app.common.calc import (
    compute_bill_totals, gen_invoice_no, calculate_sold_pieces,
    validate_stock_availability, compute_stock_deduction, compute_stock_addition,
    round2, today_iso,
)
from app.invoices.models import CreateBillRequest, InvoiceResponse
from google.cloud.firestore_v1 import Increment
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["invoices"])


def _shop_ref(shop_id: str):
    return get_db().collection("shops").document(shop_id)


def _invoices_ref(shop_id: str):
    return _shop_ref(shop_id).collection("invoices")


def _to_response(doc_id: str, data: dict) -> InvoiceResponse:
    fields = InvoiceResponse.model_fields
    return InvoiceResponse(id=doc_id, **{
        k: data.get(k, fields[k].default) for k in fields if k != "id"
    })


@router.get("", response_model=List[InvoiceResponse])
async def list_invoices(user: AuthenticatedUser = Depends(get_current_user)):
    """List all invoices for the shop, sorted by date descending."""
    docs = _invoices_ref(user.uid).order_by("date", direction="DESCENDING").stream()
    return [_to_response(d.id, d.to_dict()) for d in docs]


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Get a single invoice by ID."""
    snap = _invoices_ref(user.uid).document(invoice_id).get()
    if not snap.exists:
        raise NotFoundError("Invoice", invoice_id)
    return _to_response(snap.id, snap.to_dict())


@router.post("", response_model=InvoiceResponse, status_code=201)
async def create_bill(
    body: CreateBillRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Create a sale or purchase invoice.

    This is the most critical endpoint. The server:
    1. Validates all items exist and have sufficient stock (for sales)
    2. Computes all totals (subtotal, discount, GST, grand total)
    3. Generates the invoice number atomically
    4. Deducts/adds stock for each item
    5. Creates/updates the customer record
    6. Updates customer balance (udhari)
    7. Applies store credit if used
    8. Persists the invoice
    """
    db = get_db()
    shop_id = user.uid
    shop_ref = _shop_ref(shop_id)
    products_col = shop_ref.collection("products")
    customers_col = shop_ref.collection("customers")
    invoices_col = shop_ref.collection("invoices")
    ledger_col = shop_ref.collection("stockLedger")

    # ── 1. Load and validate products ──
    product_docs = {}
    for item in body.items:
        snap = products_col.document(item.productId).get()
        if not snap.exists:
            raise NotFoundError("Product", item.productId)
        product_docs[item.productId] = snap.to_dict()

    # ── 2. For sales, validate stock availability ──
    if body.type == "sale":
        for item in body.items:
            product = product_docs[item.productId]
            sold_pieces = calculate_sold_pieces(item.model_dump())
            if not validate_stock_availability(product, sold_pieces):
                raise InsufficientStockError(product.get("name", item.productId))

    # ── 3. Compute totals (server is authoritative) ──
    draft = {
        "items": [it.model_dump() for it in body.items],
        "gstEnabled": body.gstEnabled,
        "gstRate": body.gstRate,
        "discount": body.discount.model_dump() if body.discount else None,
        "payments": [p.model_dump() for p in body.payments],
    }
    totals = compute_bill_totals(draft)

    # ── 4. Generate invoice number (atomic increment) ──
    shop_snap = shop_ref.get()
    shop_data = shop_snap.to_dict() if shop_snap.exists else {}
    seq = shop_data.get("invoiceSeq", 1) or 1
    prefix = None
    if body.type == "purchase":
        prefix = "PUR"
    invoice_no = gen_invoice_no(seq, body.gstEnabled, prefix)
    shop_ref.update({"invoiceSeq": Increment(1)})

    # ── 5. Resolve customer ──
    customer_id = None
    customer_name = body.customerName or "Walk-in"
    customer_doc = None

    if body.customerId:
        cust_snap = customers_col.document(body.customerId).get()
        if cust_snap.exists:
            customer_id = body.customerId
            customer_doc = cust_snap.to_dict()
            customer_name = customer_doc.get("name", customer_name)
    elif body.customerName.strip():
        # Try to find by name (case-insensitive)
        name_lower = body.customerName.strip().lower()
        for doc in customers_col.stream():
            d = doc.to_dict()
            if (d.get("name", "").strip().lower() == name_lower):
                customer_id = doc.id
                customer_doc = d
                customer_name = d.get("name", customer_name)
                break

        # Create new customer if not found
        if not customer_id and body.customerName.strip():
            new_cust = {
                "name": body.customerName.strip(),
                "phone": body.customerPhone or "",
                "isContractor": body.isContractor,
                "siteNote": body.siteNote or "",
                "totalPending": 0,
                "storeCredit": 0,
            }
            _, cust_ref = customers_col.add(new_cust)
            customer_id = cust_ref.id
            customer_doc = new_cust

    # ── 6. Build invoice document ──
    inv = {
        "invoiceNo": invoice_no,
        "date": today_iso(),
        "type": body.type,
        "customerId": customer_id,
        "customerName": customer_name,
        "items": [it.model_dump() for it in body.items],
        "discount": body.discount.model_dump() if body.discount else None,
        "gstEnabled": body.gstEnabled,
        "gstRate": totals["gstRate"],
        "subtotal": totals["subtotal"],
        "discountOff": totals["discountOff"],
        "gstAmount": totals["gstAmount"],
        "grandTotal": totals["grandTotal"],
        "payments": [p.model_dump() for p in body.payments],
        "amountPaid": totals["amountPaid"],
        "amountPending": totals["amountPending"],
        "paymentStatus": totals["paymentStatus"],
        "createdVia": body.createdVia,
    }

    # ── 7. Use batch write for atomicity ──
    batch = db.batch()

    inv_ref = invoices_col.document()
    batch.set(inv_ref, inv)

    # ── 8. Stock operations ──
    now = today_iso()
    for item in body.items:
        product = product_docs[item.productId]
        sold_pieces = calculate_sold_pieces(item.model_dump())
        prod_ref = products_col.document(item.productId)

        if body.type == "sale":
            new_qty = compute_stock_deduction(product, sold_pieces)
            batch.update(prod_ref, new_qty)
            ledger_ref = ledger_col.document()
            batch.set(ledger_ref, {
                "productId": item.productId,
                "change": -sold_pieces,
                "reason": "sale",
                "invoiceId": inv_ref.id,
                "timestamp": now,
            })
        else:  # purchase
            new_qty = compute_stock_addition(product, sold_pieces)
            batch.update(prod_ref, new_qty)
            ledger_ref = ledger_col.document()
            batch.set(ledger_ref, {
                "productId": item.productId,
                "change": sold_pieces,
                "reason": "purchase",
                "invoiceId": inv_ref.id,
                "timestamp": now,
            })

    # ── 9. Customer balance updates ──
    if customer_id and customer_doc:
        cust_ref = customers_col.document(customer_id)
        cust_updates = {}

        if body.type == "sale" and totals["amountPending"] > 0:
            cust_updates["totalPending"] = round2(
                (customer_doc.get("totalPending", 0) or 0) + totals["amountPending"]
            )

        credit_used = sum(
            p.amount for p in body.payments if p.mode == "credit"
        )
        if body.type == "sale" and credit_used > 0:
            current_credit = customer_doc.get("storeCredit", 0) or 0
            cust_updates["storeCredit"] = max(0, round2(current_credit - credit_used))

        if cust_updates:
            batch.update(cust_ref, cust_updates)

    # ── 10. Commit all writes atomically ──
    batch.commit()

    logger.info(
        "Invoice %s created: type=%s, total=%s, shop=%s",
        invoice_no, body.type, totals["grandTotal"], shop_id,
    )

    return _to_response(inv_ref.id, inv)
