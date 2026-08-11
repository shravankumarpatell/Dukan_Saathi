"""Return API routes — process return invoices with stock restoration and settlement."""

from fastapi import APIRouter, Depends
from app.dependencies import get_current_user, AuthenticatedUser
from app.database import get_db
from app.common.errors import NotFoundError, ValidationError
from app.common.calc import (
    gen_invoice_no, calculate_sold_pieces, compute_stock_addition,
    round2, today_iso, item_amount,
)
from app.returns.models import CreateReturnRequest
from app.invoices.models import InvoiceResponse
from google.cloud.firestore_v1 import Increment
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/returns", tags=["returns"])


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

    # Generate return invoice number
    shop_snap = shop_ref.get()
    shop_data = shop_snap.to_dict() if shop_snap.exists else {}
    seq = shop_data.get("invoiceSeq", 1) or 1
    invoice_no = gen_invoice_no(seq, False, "RET")
    shop_ref.update({"invoiceSeq": Increment(1)})

    # Build return invoice
    items_data = [it.model_dump() for it in body.items]
    subtotal = round2(sum(item_amount(it) for it in items_data))

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

    # Settlement
    if body.customerId:
        cust_snap = customers_col.document(body.customerId).get()
        if cust_snap.exists:
            customer = cust_snap.to_dict()
            cust_ref = customers_col.document(body.customerId)
            r = body.refundTotal

            if body.settlement == "adjust_udhari":
                new_pending = max(0, round2((customer.get("totalPending", 0) or 0) - r))
                cust_ref.update({"totalPending": new_pending})
            elif body.settlement == "store_credit":
                new_credit = round2((customer.get("storeCredit", 0) or 0) + r)
                cust_ref.update({"storeCredit": new_credit})

    # Record in returns collection
    returns_col.add({
        "invoiceNo": invoice_no,
        "originalInvoiceNo": body.originalInvoiceNo,
        "customerId": body.customerId,
        "customerName": body.customerName,
        "items": items_data,
        "refundTotal": body.refundTotal,
        "settlement": body.settlement,
        "date": today_iso(),
    })

    logger.info("Return %s created against %s", invoice_no, body.originalInvoiceNo)

    return InvoiceResponse(id=inv_ref.id, **inv)
