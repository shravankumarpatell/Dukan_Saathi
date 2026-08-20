"""Helpers to map ORM rows to the existing camelCase API / calc.py dicts."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.errors import NotFoundError
from app.invoices.models import InvoiceResponse
from app.orm import Invoice, InvoiceItem, Payment, Product, ReturnAllocation, Shop


def money(value: Any) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value)


def iso(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return str(value)


def parse_uuid(value: str, resource: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (ValueError, TypeError, AttributeError):
        raise NotFoundError(resource, str(value))


def shop_uuid(user_uid: str) -> uuid.UUID:
    return parse_uuid(user_uid, "Shop")


def product_dict(product: Product) -> dict:
    return {
        "id": str(product.id),
        "name": product.name,
        "code": product.code,
        "company": product.company,
        "size": product.size,
        "unit": product.unit,
        "piecesPerBox": product.pieces_per_box,
        "sellPrice": money(product.sell_price),
        "stockQty": money(product.stock_qty),
        "lowStockThreshold": product.low_stock_threshold,
    }


def item_dict(item: InvoiceItem) -> dict:
    return {
        "productId": str(item.product_id),
        "name": item.name,
        "qty": money(item.qty),
        "pieces": money(item.pieces),
        "unit": item.unit,
        "rate": money(item.rate),
        "piecesPerBox": item.pieces_per_box,
        "size": item.size,
    }


def payment_dict(pay: Payment) -> dict:
    out = {
        "mode": pay.mode,
        "amount": money(pay.amount),
        "date": iso(pay.date),
    }
    if pay.return_invoice_no:
        out["returnInvoiceNo"] = pay.return_invoice_no
    return out


def settlement_detail(inv: Invoice) -> Optional[dict]:
    if inv.type != "return" and inv.settlement is None:
        return None
    allocations = [
        {
            "invoiceId": str(a.sale_invoice_id) if a.sale_invoice_id else None,
            "invoiceNo": a.sale_invoice_no,
            "amount": money(a.amount),
        }
        for a in (inv.allocations or [])
    ]
    return {
        "cash": money(inv.settlement_cash),
        "udhariAdjusted": money(inv.settlement_udhari),
        "storeCredit": money(inv.settlement_store_credit),
        "invoiceAllocations": allocations,
    }


def invoice_calc_dict(inv: Invoice) -> dict:
    """Shape expected by app.common.calc helpers."""
    discount = None
    if inv.discount_type and inv.discount_value is not None:
        discount = {"type": inv.discount_type, "value": money(inv.discount_value)}
    return {
        "id": str(inv.id),
        "invoiceNo": inv.invoice_no,
        "date": iso(inv.date),
        "type": inv.type,
        "customerId": str(inv.customer_id) if inv.customer_id else None,
        "customerName": inv.customer_name,
        "customerPhone": inv.customer_phone,
        "isContractor": inv.is_contractor,
        "siteNote": inv.site_note,
        "items": [item_dict(it) for it in inv.items],
        "discount": discount,
        "gstEnabled": inv.gst_enabled,
        "gstRate": money(inv.gst_rate),
        "subtotal": money(inv.subtotal),
        "discountOff": money(inv.discount_off),
        "gstAmount": money(inv.gst_amount),
        "grandTotal": money(inv.grand_total),
        "payments": [payment_dict(p) for p in inv.payments],
        "amountPaid": money(inv.amount_paid),
        "amountPending": money(inv.amount_pending),
        "paymentStatus": inv.payment_status,
        "createdVia": inv.created_via,
        "settlement": inv.settlement,
        "settlementDetail": settlement_detail(inv),
        "settlementConvertedAt": iso(inv.settlement_converted_at) or None,
        "originalInvoiceNo": inv.original_invoice_no,
        "refundTotal": money(inv.refund_total) if inv.refund_total is not None else None,
    }


def invoice_response(inv: Invoice) -> InvoiceResponse:
    data = invoice_calc_dict(inv)
    return InvoiceResponse(id=str(inv.id), **{k: data[k] for k in data if k != "id"})


INVOICE_LOAD = (
    selectinload(Invoice.items),
    selectinload(Invoice.payments),
    selectinload(Invoice.allocations),
)


async def load_invoice(session: AsyncSession, shop_id: uuid.UUID, invoice_id: uuid.UUID) -> Invoice:
    stmt = select(Invoice).options(*INVOICE_LOAD).where(
        Invoice.shop_id == shop_id, Invoice.id == invoice_id
    )
    inv = (await session.execute(stmt)).scalar_one_or_none()
    if inv is None:
        raise NotFoundError("Invoice", str(invoice_id))
    return inv


async def get_shop_for_update(session: AsyncSession, shop_id: uuid.UUID) -> Shop:
    stmt = select(Shop).where(Shop.id == shop_id).with_for_update()
    shop = (await session.execute(stmt)).scalar_one_or_none()
    if shop is None:
        raise NotFoundError("Shop", str(shop_id))
    return shop


def replace_payments(inv: Invoice, shop_id: uuid.UUID, payments: list[dict]) -> None:
    inv.payments.clear()
    for p in payments:
        date_raw = p.get("date")
        if isinstance(date_raw, str) and date_raw:
            try:
                date = datetime.fromisoformat(date_raw.replace("Z", "+00:00"))
            except ValueError:
                date = datetime.now(timezone.utc)
        elif isinstance(date_raw, datetime):
            date = date_raw
        else:
            date = datetime.now(timezone.utc)
        inv.payments.append(
            Payment(
                shop_id=shop_id,
                mode=p.get("mode") or "cash",
                amount=p.get("amount") or 0,
                date=date,
                return_invoice_no=p.get("returnInvoiceNo"),
            )
        )


def apply_payment_fields(inv: Invoice, shop_id: uuid.UUID, fields: dict) -> None:
    inv.amount_paid = fields["amountPaid"]
    inv.amount_pending = fields["amountPending"]
    inv.payment_status = fields["paymentStatus"]
    replace_payments(inv, shop_id, fields.get("payments") or [])


def set_settlement(inv: Invoice, shop_id: uuid.UUID, detail: dict, settlement: str) -> None:
    inv.settlement = settlement
    inv.settlement_cash = detail.get("cash") or 0
    inv.settlement_udhari = detail.get("udhariAdjusted") or 0
    inv.settlement_store_credit = detail.get("storeCredit") or 0
    inv.allocations.clear()
    for alloc in detail.get("invoiceAllocations") or []:
        sale_id = alloc.get("invoiceId")
        inv.allocations.append(
            ReturnAllocation(
                shop_id=shop_id,
                sale_invoice_id=uuid.UUID(sale_id) if sale_id else None,
                sale_invoice_no=alloc.get("invoiceNo"),
                amount=alloc.get("amount") or 0,
            )
        )
