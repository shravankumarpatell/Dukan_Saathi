"""Analytics API routes — server-computed dashboard stats."""

from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.calc import round2
from app.db import get_session
from app.dependencies import AuthenticatedUser, get_current_user
from app.orm import Customer, Expense, Invoice, Product
from app.persist import INVOICE_LOAD, invoice_calc_dict, money, shop_uuid

router = APIRouter(prefix="/analytics", tags=["analytics"])

IST = ZoneInfo("Asia/Kolkata")


@router.get("/dashboard")
async def dashboard_stats(
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Compute dashboard summary stats server-side."""
    shop_id = shop_uuid(user.uid)
    today_str = datetime.now(IST).strftime("%Y-%m-%d")

    invoices = (
        await session.execute(
            select(Invoice).options(*INVOICE_LOAD).where(Invoice.shop_id == shop_id)
        )
    ).scalars().unique().all()
    customers = (
        await session.execute(select(Customer).where(Customer.shop_id == shop_id))
    ).scalars().all()
    products = (
        await session.execute(select(Product).where(Product.shop_id == shop_id))
    ).scalars().all()
    expenses = (
        await session.execute(select(Expense).where(Expense.shop_id == shop_id))
    ).scalars().all()

    today_sales = []
    for inv in invoices:
        if inv.type != "sale":
            continue
        local_day = inv.date.astimezone(IST).strftime("%Y-%m-%d") if inv.date else ""
        if local_day == today_str:
            today_sales.append(invoice_calc_dict(inv))

    revenue = round2(sum(i.get("grandTotal", 0) or 0 for i in today_sales))
    today_count = len(today_sales)

    cash_collected = round2(sum(
        sum(p.get("amount", 0) for p in (i.get("payments") or []) if p.get("mode") == "cash")
        for i in today_sales
    ))
    online_collected = round2(sum(
        sum(p.get("amount", 0) for p in (i.get("payments") or []) if p.get("mode") == "online")
        for i in today_sales
    ))
    udhari_added = round2(sum(i.get("amountPending", 0) or 0 for i in today_sales))
    total_udhari = round2(sum(money(c.total_pending) for c in customers))
    low_stock_count = sum(
        1 for p in products
        if money(p.stock_qty) <= (p.low_stock_threshold or 0)
    )

    today_expenses = [
        e for e in expenses
        if e.date and e.date.astimezone(IST).strftime("%Y-%m-%d") == today_str
    ]
    expenses_total = round2(sum(money(e.amount) for e in today_expenses))
    net_cash = round2(cash_collected - expenses_total)

    return {
        "revenue": revenue,
        "todayCount": today_count,
        "totalUdhari": total_udhari,
        "lowStockCount": low_stock_count,
        "cashCollected": cash_collected,
        "onlineCollected": online_collected,
        "udhariAdded": udhari_added,
        "expensesTotal": expenses_total,
        "netCash": net_cash,
    }
