"""Return API routes — process return invoices with stock restoration and settlement."""

from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.calc import (
    allocate_return_across_invoices,
    apply_store_credit_conversion,
    compute_stock_after_qty,
    conversion_recorded_amount,
    enrich_line,
    format_stock_pieces_label,
    gen_invoice_no,
    item_amount,
    line_consumed_qty,
    line_return_qty,
    recompute_customer_total_pending,
    remaining_returnable_amount,
    remaining_returnable_by_product,
    round2,
    settlement_label_from_detail,
)
from app.common.errors import NotFoundError, ValidationError
from app.db import get_session
from app.dependencies import AuthenticatedUser, get_current_user
from app.invoices.models import InvoiceResponse
from app.orm import Customer, Invoice, InvoiceItem, Product, Shop, StockLedger
from app.persist import (
    INVOICE_LOAD,
    apply_payment_fields,
    invoice_calc_dict,
    invoice_response,
    load_invoice,
    money,
    parse_uuid,
    product_dict,
    set_settlement,
    shop_uuid,
)
from app.returns.models import ConvertStoreCreditRequest, CreateReturnRequest
from app.shops.router import _get_or_create_shop
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


def _detail_of(inv: Invoice) -> dict:
    stored = invoice_calc_dict(inv).get("settlementDetail")
    if isinstance(stored, dict):
        return {**_empty_detail(), **stored}
    refund = round2(money(inv.refund_total) or 0)
    detail = _empty_detail()
    settlement = inv.settlement or "cash"
    if settlement == "adjust_udhari":
        detail["udhariAdjusted"] = refund
    elif settlement == "store_credit":
        detail["storeCredit"] = refund
    else:
        detail["cash"] = refund
    return detail


async def _find_sale_by_invoice_no(
    session: AsyncSession, shop_id: UUID, invoice_no: str
) -> Optional[Invoice]:
    stmt = (
        select(Invoice)
        .options(*INVOICE_LOAD)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.invoice_no == invoice_no,
            Invoice.type == "sale",
        )
    )
    return (await session.execute(stmt)).scalars().unique().one_or_none()


async def _list_prior_returns(
    session: AsyncSession,
    shop_id: UUID,
    original_invoice_no: str,
    exclude_invoice_no: str | None = None,
) -> list[Invoice]:
    stmt = (
        select(Invoice)
        .options(*INVOICE_LOAD)
        .where(
            Invoice.shop_id == shop_id,
            Invoice.original_invoice_no == original_invoice_no,
            Invoice.type == "return",
        )
    )
    rows = list((await session.execute(stmt)).scalars().unique().all())
    if exclude_invoice_no:
        rows = [r for r in rows if r.invoice_no != exclude_invoice_no]
    return rows


async def _list_customer_sales(
    session: AsyncSession, shop_id: UUID, customer_id: Optional[UUID]
) -> list[Invoice]:
    if not customer_id:
        return []
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


def _validate_settlement(settlement: str, customer: Optional[Customer], open_pending: float = None) -> None:
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
            else round2(money(customer.total_pending))
        )
        if pending <= 0:
            raise ValidationError(
                "This customer has no udhari to adjust. Use cash refund or store credit instead."
            )


def _validate_return_qty(original_items: list, prior_returns: list[Invoice], new_items: list) -> None:
    prior_items = []
    for ret in prior_returns:
        prior_items.extend(invoice_calc_dict(ret).get("items") or [])
    remaining = remaining_returnable_by_product(original_items, prior_items)
    original_ids = {it.get("productId") for it in (original_items or []) if it.get("productId")}

    for it in new_items:
        pid = it.get("productId")
        if not pid:
            raise ValidationError("Return item me productId zaroori hai")
        if pid not in original_ids:
            raise ValidationError(f"'{it.get('name') or pid}' is original bill me nahi tha")
        want = line_return_qty(it)
        left = remaining.get(pid, 0)
        if want > float(left) + 1e-6:
            label = format_stock_pieces_label(it, int(left) if float(left) == int(left) else left)
            raise ValidationError(
                f"'{it.get('name') or pid}' me sirf {label} return ho sakta hai (pehle se return ho chuka / sold se zyada)"
            )
        remaining[pid] = float(left) - want


def _apply_patches(sales_by_id: dict[str, Invoice], shop_id: UUID, patches: list) -> None:
    for patch in patches:
        pid = patch.get("id")
        inv = sales_by_id.get(str(pid) if pid is not None else "")
        if inv is None or not patch.get("fields"):
            continue
        apply_payment_fields(inv, shop_id, patch["fields"])


@router.post("", response_model=InvoiceResponse, status_code=201)
async def create_return(
    body: CreateReturnRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Process a return invoice with ledger-consistent settlement."""
    shop = await _get_or_create_shop(session, user)
    shop = (
        await session.execute(select(Shop).where(Shop.id == shop.id).with_for_update())
    ).scalar_one()
    shop_id = shop.id

    if not (body.originalInvoiceNo or "").strip():
        raise ValidationError("Original invoice number zaroori hai")

    for item in body.items:
        pid = parse_uuid(item.productId, "Product")
        product = await session.get(Product, pid)
        if product is None or product.shop_id != shop_id:
            raise NotFoundError("Product", item.productId)

    original = await _find_sale_by_invoice_no(session, shop_id, body.originalInvoiceNo.strip())
    if original is None:
        raise NotFoundError("Invoice", body.originalInvoiceNo)

    prior = await _list_prior_returns(session, shop_id, body.originalInvoiceNo.strip())
    items_data = [it.model_dump() for it in body.items]
    _validate_return_qty(invoice_calc_dict(original).get("items") or [], prior, items_data)

    subtotal = round2(sum(item_amount(it) for it in items_data))
    max_refund = remaining_returnable_amount(invoice_calc_dict(original), [invoice_calc_dict(r) for r in prior])
    requested = round2(body.refundTotal if body.refundTotal is not None else subtotal)
    if requested > max_refund + 0.01:
        raise ValidationError(
            f"Refund ₹{requested:.2f} is bill se zyada returnable nahi (max ₹{max_refund:.2f})"
        )
    refund = requested if requested > 0 else min(subtotal, max_refund)
    refund = round2(min(refund, max_refund))
    if refund <= 0:
        raise ValidationError("Refund amount 0 nahi ho sakta")
    from app.common.calc import validate_money_limit
    validate_money_limit(refund, "Refund amount")

    customer = None
    customer_id = None
    raw_cid = body.customerId or (str(original.customer_id) if original.customer_id else None)
    if raw_cid:
        customer_id = parse_uuid(raw_cid, "Customer")
        customer = await session.get(Customer, customer_id)
        if customer is None or customer.shop_id != shop_id:
            customer = None
            customer_id = None

    sales = await _list_customer_sales(session, shop_id, customer_id)
    sales_by_id = {str(s.id): s for s in sales}
    sales_by_id[str(original.id)] = original
    sales = sorted(sales_by_id.values(), key=lambda i: i.date.isoformat() if i.date else "")
    open_pending = recompute_customer_total_pending([invoice_calc_dict(s) for s in sales])
    _validate_settlement(body.settlement, customer, open_pending=open_pending)

    seq = shop.invoice_seq or 1
    shop.invoice_seq = seq + 1
    invoice_no = gen_invoice_no(seq, False, "RET")

    working_original = invoice_calc_dict(original)
    others = [invoice_calc_dict(s) for s in sales if s.id != original.id]
    patches, detail, _ = allocate_return_across_invoices(
        refund,
        working_original,
        others if body.settlement == "adjust_udhari" else [],
        return_invoice_no=invoice_no,
        settlement=body.settlement,
    )
    _apply_patches(sales_by_id, shop_id, patches)
    for patch in patches:
        sid = patch.get("id")
        if sid and sid in sales_by_id:
            # keep in-memory calc dicts in sync via ORM
            pass
    sales = list(sales_by_id.values())

    if customer is not None:
        credit_add = round2(detail.get("storeCredit", 0) or 0)
        if credit_add > 0:
            customer.store_credit = max(0, round2(money(customer.store_credit) + credit_add))
        customer.total_pending = recompute_customer_total_pending(
            [invoice_calc_dict(s) for s in sales]
        )

    now = datetime.now(timezone.utc)
    inv = Invoice(
        shop_id=shop_id,
        invoice_no=invoice_no,
        date=now,
        type="return",
        customer_id=customer_id,
        customer_name=body.customerName or original.customer_name or "Walk-in",
        is_contractor=bool((customer.is_contractor if customer else original.is_contractor)),
        site_note=(customer.site_note if customer else original.site_note) or "",
        gst_enabled=False,
        gst_rate=0,
        subtotal=subtotal,
        discount_off=0,
        gst_amount=0,
        grand_total=refund,
        amount_paid=0,
        amount_pending=0,
        payment_status="return",
        created_via="manual",
        original_invoice_id=original.id,
        original_invoice_no=body.originalInvoiceNo.strip(),
        refund_total=refund,
    )
    for idx, item in enumerate(body.items):
        pid = parse_uuid(item.productId, "Product")
        product = (
            await session.execute(
                select(Product).where(Product.shop_id == shop_id, Product.id == pid)
            )
        ).scalar_one()
        pdata = product_dict(product)
        enriched = enrich_line(item.model_dump(), pdata)
        price_qty = line_consumed_qty(enriched, pdata)
        inv.items.append(
            InvoiceItem(
                shop_id=shop_id,
                line_no=idx,
                product_id=pid,
                name=item.name,
                qty=item.qty,
                pieces=item.pieces,
                unit=enriched.get("unit") or item.unit,
                rate=item.rate,
                pieces_per_box=item.piecesPerBox,
                size=enriched.get("size") or "",
                product_unit=enriched.get("productUnit") or pdata.get("unit") or "box",
                pack_qty=enriched.get("packQty") if enriched.get("packQty") is not None else 1,
                price_qty=price_qty,
            )
        )
    set_settlement(inv, shop_id, detail, body.settlement)
    session.add(inv)
    await session.flush()

    for item in body.items:
        pid = parse_uuid(item.productId, "Product")
        product = (
            await session.execute(
                select(Product).where(Product.shop_id == shop_id, Product.id == pid).with_for_update()
            )
        ).scalar_one()
        pdata = product_dict(product)
        enriched = enrich_line(item.model_dump(), pdata)
        add_qty = line_consumed_qty(enriched, pdata)
        if add_qty > 0:
            patch = compute_stock_after_qty(pdata, add_qty)
            product.stock_qty = patch["stockQty"]
            session.add(
                StockLedger(
                    shop_id=shop_id,
                    product_id=pid,
                    change=add_qty,
                    reason="return",
                    invoice_id=inv.id,
                    timestamp=now,
                )
            )

    await session.flush()
    inv = await load_invoice(session, shop_id, inv.id)
    logger.info("Return %s created against %s", invoice_no, body.originalInvoiceNo)
    return invoice_response(inv)


@router.post("/{invoice_id}/convert-store-credit", response_model=InvoiceResponse)
async def convert_store_credit_return(
    invoice_id: str,
    body: ConvertStoreCreditRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Payout or re-apply only the store-credit slice. Prior udhari stays on this return."""
    shop_id = shop_uuid(user.uid)
    inv = await load_invoice(session, shop_id, parse_uuid(invoice_id, "Return"))
    if inv.type != "return":
        raise ValidationError("Only return invoices can be converted")

    old_detail = _detail_of(inv)
    old_credit = round2(old_detail.get("storeCredit", 0) or 0)
    current_settlement = (inv.settlement or "").strip()
    if current_settlement != "store_credit" and old_credit <= 0.01:
        raise ValidationError("Sirf store-credit return convert ho sakta hai")

    target = body.targetSettlement
    if target not in ("cash", "adjust_udhari"):
        raise ValidationError("Target settlement cash ya adjust_udhari hona chahiye")

    return_no = inv.invoice_no or ""
    original_no = (inv.original_invoice_no or "").strip()

    original = None
    if original_no:
        original = await _find_sale_by_invoice_no(session, shop_id, original_no)

    customer = None
    if inv.customer_id:
        customer = await session.get(Customer, inv.customer_id)
        if customer is not None and customer.shop_id != shop_id:
            customer = None

    extra_detail = None
    leftover_credit = 0.0
    sales = await _list_customer_sales(session, shop_id, inv.customer_id)
    if original is not None and str(original.id) not in {str(s.id) for s in sales}:
        sales.append(original)

    if target == "adjust_udhari":
        open_pending = recompute_customer_total_pending([invoice_calc_dict(s) for s in sales])
        _validate_settlement(target, customer, open_pending=open_pending)
        if customer is None or old_credit <= 0.01:
            raise ValidationError(
                "Store credit se koi udhari clear nahi hui. Pending bill check karein."
            )
        sales_by_id = {str(s.id): s for s in sales}
        if original is not None:
            sales_by_id[str(original.id)] = original
        working_original = invoice_calc_dict(original) if original is not None else {}
        orig_id = str(original.id) if original is not None else None
        others = [
            invoice_calc_dict(s)
            for s in sales_by_id.values()
            if orig_id is None or str(s.id) != orig_id
        ]
        patches, extra_detail, _ = allocate_return_across_invoices(
            old_credit,
            working_original,
            others,
            return_invoice_no=return_no,
            settlement="adjust_udhari",
        )
        absorbed = round2(extra_detail.get("udhariAdjusted", 0) or 0)
        leftover_credit = round2(extra_detail.get("storeCredit", 0) or 0)
        if absorbed <= 0.01:
            raise ValidationError(
                "Store credit se koi udhari clear nahi hui. Pending bill check karein."
            )
        _apply_patches(sales_by_id, shop_id, patches)
        if customer is not None:
            customer.total_pending = recompute_customer_total_pending(
                [invoice_calc_dict(s) for s in sales_by_id.values()]
            )
    else:
        _validate_settlement("cash", customer)
        leftover_credit = 0.0
        if customer is not None:
            customer.total_pending = recompute_customer_total_pending(
                [invoice_calc_dict(s) for s in sales]
            )

    if customer is not None and old_credit > 0:
        customer.store_credit = max(
            0.0, round2(money(customer.store_credit) - old_credit + leftover_credit)
        )

    detail = apply_store_credit_conversion(old_detail, target, extra_detail)
    inv.settlement_converted_at = datetime.now(timezone.utc)
    inv.settlement_converted_amount = conversion_recorded_amount(target, old_credit, extra_detail)
    inv.settlement_converted_to = target
    set_settlement(inv, shop_id, detail, settlement_label_from_detail(detail, target))
    await session.flush()
    inv = await load_invoice(session, shop_id, inv.id)

    logger.info(
        "Return %s store-credit converted to %s (moved %s of %s credit)",
        return_no, target, inv.settlement_converted_amount, old_credit,
    )
    return invoice_response(inv)
