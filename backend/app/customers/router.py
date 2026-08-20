"""Customer API routes — CRUD + payment allocation against pending bills."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.calc import (
    apply_payment_to_invoice,
    recompute_customer_total_pending,
    round2,
    today_iso,
)
from app.common.errors import ConflictError, NotFoundError, ValidationError
from app.customers.models import AllocatePaymentRequest, CustomerCreate, CustomerResponse
from app.db import get_session
from app.dependencies import AuthenticatedUser, get_current_user
from app.orm import Customer, Invoice
from app.persist import (
    INVOICE_LOAD,
    apply_payment_fields,
    invoice_calc_dict,
    money,
    parse_uuid,
    shop_uuid,
)
from app.shops.router import _get_or_create_shop
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/customers", tags=["customers"])


def _to_response(row: Customer) -> CustomerResponse:
    return CustomerResponse(
        id=str(row.id),
        name=row.name,
        phone=row.phone,
        isContractor=row.is_contractor,
        siteNote=row.site_note,
        totalPending=money(row.total_pending),
        storeCredit=money(row.store_credit),
    )


async def _list_customer_sales(
    session: AsyncSession, shop_id: UUID, customer_id: UUID
) -> list[Invoice]:
    stmt = (
        select(Invoice)
        .options(*INVOICE_LOAD)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.customer_id == customer_id,
            Invoice.type == "sale",
        )
        .order_by(Invoice.date.asc())
    )
    return list((await session.execute(stmt)).scalars().unique().all())


async def _list_customer_returns(
    session: AsyncSession, shop_id: UUID, customer_id: UUID
) -> list[Invoice]:
    stmt = (
        select(Invoice)
        .options(*INVOICE_LOAD)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.customer_id == customer_id,
            Invoice.type == "return",
        )
        .order_by(Invoice.date.asc())
    )
    return list((await session.execute(stmt)).scalars().unique().all())


@router.get("", response_model=List[CustomerResponse])
async def list_customers(
    role: Optional[str] = Query(
        None,
        pattern="^(all|customer|contractor)$",
        description="Filter: all (default), customer (retail), or contractor (contractor/dealer).",
    ),
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """List customers for the shop, optionally filtered by role."""
    shop_id = shop_uuid(user.uid)
    rows = (
        await session.execute(select(Customer).where(Customer.shop_id == shop_id))
    ).scalars().all()
    out = [_to_response(r) for r in rows]
    if role == "contractor":
        return [c for c in out if c.isContractor]
    if role == "customer":
        return [c for c in out if not c.isContractor]
    return out


@router.post("", response_model=CustomerResponse, status_code=201)
async def create_customer(
    body: CustomerCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Create a new customer. Names must be unique (case-insensitive)."""
    shop = await _get_or_create_shop(session, user)
    name = body.name.strip()
    existing = (
        await session.execute(
            select(Customer).where(
                Customer.shop_id == shop.id,
                func.lower(Customer.name) == name.lower(),
            )
        )
    ).scalar_one_or_none()
    if existing:
        raise ConflictError(f"Customer '{body.name}' already exists")

    row = Customer(
        shop_id=shop.id,
        name=name,
        phone=body.phone,
        is_contractor=body.isContractor,
        site_note=body.siteNote,
        total_pending=0,
        store_credit=0,
    )
    session.add(row)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise ConflictError(f"Customer '{body.name}' already exists") from exc
    return _to_response(row)


@router.get("/{customer_id}", response_model=CustomerResponse)
async def get_customer(
    customer_id: str,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Get a single customer."""
    shop_id = shop_uuid(user.uid)
    cid = parse_uuid(customer_id, "Customer")
    row = await session.get(Customer, cid)
    if row is None or row.shop_id != shop_id:
        raise NotFoundError("Customer", customer_id)
    return _to_response(row)


@router.post("/{customer_id}/payment", response_model=dict)
async def allocate_payment(
    customer_id: str,
    body: AllocatePaymentRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Record a payment allocated across specific pending invoices."""
    shop_id = shop_uuid(user.uid)
    cid = parse_uuid(customer_id, "Customer")
    customer = await session.get(Customer, cid)
    if customer is None or customer.shop_id != shop_id:
        raise NotFoundError("Customer", customer_id)

    if not body.allocations:
        raise ValidationError("Kam se kam ek bill ke against amount daaliye")

    total_paid = 0.0

    for alloc in body.allocations:
        amount = round2(alloc.amount)
        if amount <= 0:
            continue

        iid = parse_uuid(alloc.invoiceId, "Invoice")
        stmt = (
            select(Invoice)
            .options(*INVOICE_LOAD)
            .where(Invoice.shop_id == shop_id, Invoice.id == iid)
            .with_for_update()
        )
        inv = (await session.execute(stmt)).scalar_one_or_none()
        if inv is None:
            raise NotFoundError("Invoice", alloc.invoiceId)

        inv_data = invoice_calc_dict(inv)
        if inv.type != "sale":
            raise ValidationError("Sirf sale invoices par payment allocate ho sakti hai")
        if str(inv.customer_id or "") != str(cid):
            raise ValidationError("Ye bill is customer ka nahi hai")

        pending = round2(inv_data.get("amountPending", 0) or 0)
        if pending <= 0.5:
            raise ValidationError(
                f"{inv.invoice_no or alloc.invoiceId} pe koi pending nahi hai"
            )

        capped = round2(min(amount, pending))
        if capped + 0.01 < amount:
            amount = capped

        fields = apply_payment_to_invoice(
            inv_data,
            amount,
            {"mode": body.mode or "cash", "date": today_iso()},
        )
        applied = round2(fields.pop("_applied", 0) or 0)
        if applied <= 0:
            continue

        apply_payment_fields(inv, shop_id, fields)
        total_paid = round2(total_paid + applied)

    sales = await _list_customer_sales(session, shop_id, cid)
    new_pending = recompute_customer_total_pending([invoice_calc_dict(s) for s in sales])
    customer.total_pending = new_pending

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
    session: AsyncSession = Depends(get_session),
):
    """Repair desynced udhari: attribute historic returns onto sale invoices."""
    shop_id = shop_uuid(user.uid)
    cid = parse_uuid(customer_id, "Customer")
    customer = await session.get(Customer, cid)
    if customer is None or customer.shop_id != shop_id:
        raise NotFoundError("Customer", customer_id)

    sales = await _list_customer_sales(session, shop_id, cid)
    sales_by_id = {str(s.id): s for s in sales}
    sales_by_no = {s.invoice_no: s for s in sales if s.invoice_no}
    returns = await _list_customer_returns(session, shop_id, cid)

    adjusted_returns = 0
    applied_total = 0.0
    working = {str(s.id): invoice_calc_dict(s) for s in sales}

    for ret in returns:
        ret_no = ret.invoice_no or ""
        refund = round2(money(ret.refund_total) or money(ret.grand_total) or 0)
        if refund <= 0 or not ret_no:
            continue

        already = False
        for data in working.values():
            for p in data.get("payments") or []:
                if (p.get("mode") or "") == "return_adjust" and (p.get("returnInvoiceNo") or "") == ret_no:
                    already = True
                    break
            if already:
                break
        if already:
            continue

        remaining = refund
        order_ids = []
        orig_no = (ret.original_invoice_no or "").strip()
        if orig_no and orig_no in sales_by_no:
            order_ids.append(str(sales_by_no[orig_no].id))
        for s in sorted(sales, key=lambda i: i.date.isoformat() if i.date else ""):
            if orig_no and s.invoice_no == orig_no:
                continue
            order_ids.append(str(s.id))

        for sid in order_ids:
            if remaining <= 0.01:
                break
            sale_data = working[sid]
            pending = round2(sale_data.get("amountPending", 0) or 0)
            if pending <= 0.5:
                continue
            fields = apply_payment_to_invoice(
                sale_data,
                remaining,
                {"mode": "return_adjust", "returnInvoiceNo": ret_no, "date": today_iso()},
            )
            applied = round2(fields.pop("_applied", 0) or 0)
            if applied <= 0:
                continue
            apply_payment_fields(sales_by_id[sid], shop_id, fields)
            sale_data.update(fields)
            working[sid] = sale_data
            remaining = round2(remaining - applied)
            applied_total = round2(applied_total + applied)

        adjusted_returns += 1

    new_pending = recompute_customer_total_pending(list(working.values()))
    old_pending = round2(money(customer.total_pending))
    customer.total_pending = new_pending

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
