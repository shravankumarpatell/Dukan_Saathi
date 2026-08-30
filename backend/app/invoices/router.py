"""Invoice API routes — server-side bill commit."""

from datetime import datetime, timezone
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.calc import (
    calculate_sold_pieces,
    compute_bill_totals,
    compute_stock_deduction,
    format_stock_pieces_label,
    gen_invoice_no,
    get_total_stock_pieces,
    round2,
    validate_bill_limits,
    validate_payment_split,
)
from app.common.errors import InsufficientStockError, NotFoundError, ValidationError
from app.db import get_session
from app.dependencies import AuthenticatedUser, get_current_user
from app.invoices.models import CreateBillRequest, InvoiceResponse
from app.orm import Customer, Invoice, InvoiceItem, Payment, Product, Shop, StockLedger
from app.persist import (
    INVOICE_LOAD,
    invoice_response,
    load_invoice,
    money,
    parse_uuid,
    product_dict,
    shop_uuid,
)
from app.shops.router import _get_or_create_shop
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/invoices", tags=["invoices"])


@router.get("", response_model=List[InvoiceResponse])
async def list_invoices(
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List all invoices for the shop, sorted by date descending."""
    shop_id = shop_uuid(user.uid)
    rows = (
        await session.execute(
            select(Invoice)
            .options(*INVOICE_LOAD)
            .where(Invoice.shop_id == shop_id)
            .order_by(Invoice.date.desc())
        )
    ).scalars().unique().all()
    return [invoice_response(inv) for inv in rows]


@router.get("/{invoice_id}", response_model=InvoiceResponse)
async def get_invoice(
    invoice_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a single invoice by ID."""
    shop_id = shop_uuid(user.uid)
    inv = await load_invoice(session, shop_id, parse_uuid(invoice_id, "Invoice"))
    return invoice_response(inv)


@router.post("", response_model=InvoiceResponse, status_code=201)
async def create_bill(
    body: CreateBillRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a sale invoice in a single transaction."""
    if body.type != "sale":
        raise ValidationError("Sirf sale bill ban sakta hai. Stock ke liye Add Stock use karein.")
    shop = await _get_or_create_shop(session, user)
    shop_id = shop.id

    shop = (
        await session.execute(select(Shop).where(Shop.id == shop_id).with_for_update())
    ).scalar_one()

    product_ids = [parse_uuid(it.productId, "Product") for it in body.items]
    products_by_id: dict[UUID, Product] = {}
    for pid in product_ids:
        stmt = select(Product).where(
            Product.shop_id == shop_id, Product.id == pid
        ).with_for_update()
        product = (await session.execute(stmt)).scalar_one_or_none()
        if product is None:
            raise NotFoundError("Product", str(pid))
        products_by_id[pid] = product

    needed: dict[UUID, int] = {}
    for item in body.items:
        pid = parse_uuid(item.productId, "Product")
        needed[pid] = needed.get(pid, 0) + calculate_sold_pieces(item.model_dump())
    for pid, sold_pieces in needed.items():
        product = products_by_id[pid]
        available = get_total_stock_pieces(product_dict(product))
        if sold_pieces > available:
            raise InsufficientStockError(
                product.name or str(pid),
                available=available,
                requested=sold_pieces,
                avail_label=format_stock_pieces_label(product_dict(product), available),
                req_label=format_stock_pieces_label(product_dict(product), sold_pieces),
            )

    draft = {
        "items": [it.model_dump() for it in body.items],
        "gstEnabled": body.gstEnabled,
        "gstRate": body.gstRate,
        "discount": body.discount.model_dump() if body.discount else None,
        "payments": [p.model_dump() for p in body.payments],
    }
    totals = compute_bill_totals(draft)
    validate_bill_limits(totals, body.items)
    validate_payment_split(totals["grandTotal"], body.payments)
    credit_used = round2(sum(p.amount for p in body.payments if p.mode == "credit"))

    seq = shop.invoice_seq or 1
    shop.invoice_seq = seq + 1
    invoice_no = gen_invoice_no(seq, body.gstEnabled, None)

    customer = None
    customer_id = None
    customer_name = body.customerName or "Walk-in"

    if body.customerId:
        cid = parse_uuid(body.customerId, "Customer")
        customer = await session.get(Customer, cid)
        if customer is None or customer.shop_id != shop_id:
            customer = None
        else:
            customer_id = customer.id
            customer_name = customer.name or customer_name
    elif body.customerName.strip():
        name_lower = body.customerName.strip().lower()
        customer = (
            await session.execute(
                select(Customer).where(
                    Customer.shop_id == shop_id,
                    func.lower(Customer.name) == name_lower,
                )
            )
        ).scalar_one_or_none()
        if customer:
            customer_id = customer.id
            customer_name = customer.name or customer_name
        else:
            customer = Customer(
                shop_id=shop_id,
                name=body.customerName.strip(),
                phone=body.customerPhone or "",
                is_contractor=body.isContractor,
                site_note=body.siteNote or "",
                total_pending=0,
                store_credit=0,
            )
            session.add(customer)
            await session.flush()
            customer_id = customer.id

    if credit_used > 0:
        current_credit = round2(money(customer.store_credit) if customer else 0)
        if credit_used > current_credit + 0.01:
            raise ValidationError(
                f"Store credit ₹{credit_used:.2f} available ₹{current_credit:.2f} se zyada nahi ho sakta"
            )

    is_contractor = bool(body.isContractor)
    site_note = (body.siteNote or "").strip()
    now = datetime.now(timezone.utc)

    inv = Invoice(
        shop_id=shop_id,
        invoice_no=invoice_no,
        date=now,
        type=body.type,
        customer_id=customer_id,
        customer_name=customer_name,
        customer_phone=body.customerPhone or (customer.phone if customer else "") or "",
        is_contractor=is_contractor,
        site_note=site_note,
        discount_type=body.discount.type if body.discount else None,
        discount_value=body.discount.value if body.discount else None,
        gst_enabled=body.gstEnabled,
        gst_rate=totals["gstRate"],
        subtotal=totals["subtotal"],
        discount_off=totals["discountOff"],
        gst_amount=totals["gstAmount"],
        grand_total=totals["grandTotal"],
        amount_paid=totals["amountPaid"],
        amount_pending=totals["amountPending"],
        payment_status=totals["paymentStatus"],
        created_via=body.createdVia,
    )
    for idx, item in enumerate(body.items):
        inv.items.append(
            InvoiceItem(
                shop_id=shop_id,
                line_no=idx,
                product_id=parse_uuid(item.productId, "Product"),
                name=item.name,
                qty=item.qty,
                pieces=item.pieces,
                unit=item.unit,
                rate=item.rate,
                pieces_per_box=item.piecesPerBox,
                size=item.size,
            )
        )
    for pay in body.payments:
        inv.payments.append(
            Payment(
                shop_id=shop_id,
                mode=pay.mode,
                amount=pay.amount,
                date=now,
            )
        )
    session.add(inv)
    await session.flush()

    for item in body.items:
        pid = parse_uuid(item.productId, "Product")
        product = products_by_id[pid]
        sold_pieces = calculate_sold_pieces(item.model_dump())
        pdata = product_dict(product)
        patch = compute_stock_deduction(pdata, sold_pieces)
        product.stock_qty = patch["stockQty"]
        change = -sold_pieces
        reason = "sale"
        session.add(
            StockLedger(
                shop_id=shop_id,
                product_id=pid,
                change=change,
                reason=reason,
                invoice_id=inv.id,
                timestamp=now,
            )
        )

    if customer is not None:
        if totals["amountPending"] > 0:
            customer.total_pending = round2(
                money(customer.total_pending) + totals["amountPending"]
            )
        if credit_used > 0:
            customer.store_credit = max(0, round2(money(customer.store_credit) - credit_used))
        if bool(customer.is_contractor) != is_contractor:
            customer.is_contractor = is_contractor
        if site_note and (customer.site_note or "") != site_note:
            customer.site_note = site_note
        if body.customerPhone and (customer.phone or "") != body.customerPhone:
            customer.phone = body.customerPhone

    await session.flush()
    inv = await load_invoice(session, shop_id, inv.id)

    logger.info(
        "Invoice %s created: type=%s, total=%s, shop=%s",
        invoice_no, body.type, totals["grandTotal"], shop_id,
    )
    return invoice_response(inv)
