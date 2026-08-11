from typing import Optional, List, Dict
"""Analytics API routes — server-computed dashboard stats."""

from fastapi import APIRouter, Depends
from datetime import datetime, timezone
from app.dependencies import get_current_user, AuthenticatedUser
from app.database import get_db
from app.common.calc import round2

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/dashboard")
async def dashboard_stats(user: AuthenticatedUser = Depends(get_current_user)):
    """Compute dashboard summary stats server-side.

    Returns today's revenue, bill count, total udhari, low-stock count,
    and payment breakdown.
    """
    db = get_db()
    shop_ref = db.collection("shops").document(user.uid)
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Fetch all data (could be optimized with queries later)
    invoices = [d.to_dict() for d in shop_ref.collection("invoices").stream()]
    customers = [d.to_dict() for d in shop_ref.collection("customers").stream()]
    products = [d.to_dict() for d in shop_ref.collection("products").stream()]
    expenses = [d.to_dict() for d in shop_ref.collection("expenses").stream()]

    # Today's sales
    today_sales = [
        i for i in invoices
        if i.get("type") == "sale" and (i.get("date", "")[:10] == today_str)
    ]

    revenue = round2(sum(i.get("grandTotal", 0) or 0 for i in today_sales))
    today_count = len(today_sales)

    # Payment breakdown
    cash_collected = round2(sum(
        sum(p.get("amount", 0) for p in (i.get("payments") or []) if p.get("mode") == "cash")
        for i in today_sales
    ))
    online_collected = round2(sum(
        sum(p.get("amount", 0) for p in (i.get("payments") or []) if p.get("mode") == "online")
        for i in today_sales
    ))
    udhari_added = round2(sum(i.get("amountPending", 0) or 0 for i in today_sales))

    # Total udhari
    total_udhari = round2(sum(c.get("totalPending", 0) or 0 for c in customers))

    # Low stock
    low_stock_count = sum(
        1 for p in products
        if ((p.get("stockQty", 0) or 0) + (p.get("showroomQty", 0) or 0) + (p.get("godownQty", 0) or 0))
           <= (p.get("lowStockThreshold", 0) or 0)
    )

    # Today's expenses
    today_expenses = [
        e for e in expenses
        if (e.get("date", "")[:10] == today_str)
    ]
    expenses_total = round2(sum(e.get("amount", 0) or 0 for e in today_expenses))
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
