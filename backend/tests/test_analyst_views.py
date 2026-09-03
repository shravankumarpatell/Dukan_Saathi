"""Certified views vs daybook math, line_amount, tenant wrap."""

from __future__ import annotations

import asyncio
from datetime import date
from uuid import UUID

from app.analyst.executor import execute_select
from app.analyst.guard import guard_sql
from app.analyst.metrics import compile_metric
from app.analyst.resolvers import DateWindow
from app.persist import shop_uuid
from tests.conftest import auth_header
from tests.test_routers_transactions import (
    _create_customer,
    _create_product,
    _create_shop,
    _return,
    _sale,
)


def _run(coro):
    return asyncio.run(coro)


def _query(sql: str, shop_id: UUID, params: dict | None = None):
    guarded = guard_sql(sql, shop_id, dialect="sqlite")
    return _run(execute_select(guarded, shop_id, params or {}))


def test_line_amount_matches_item_amount(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    product = _create_product(
        client, headers, name="Pearl White", unit="box", piecesPerBox=4, stockQty=20, sellPrice=400
    )
    customer = _create_customer(client, headers, name="Meena Quarries")
    _sale(
        client, headers, product, customer=customer, qty=1, rate=400,
        payments=[{"mode": "cash", "amount": 400}],
    )
    # pieces=2 on a box line: 1*400 + 2*(400/4) = 500. Sale helper doesn't send pieces;
    # item_amount for qty=1 box rate=400 pieces=0 is 400.
    shop_id = shop_uuid(uid)
    cols, rows = _query(
        "SELECT product_name, line_amount FROM v_invoice_lines WHERE invoice_type = 'sale'",
        shop_id,
    )
    assert rows
    assert float(rows[0]["line_amount"]) == 400.0


def test_kamai_ignores_store_credit_return_and_subtracts_cash(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    product = _create_product(client, headers, stockQty=50)
    paid = _create_customer(client, headers, name="Cash Buyer")
    credit = _create_customer(client, headers, name="Credit Buyer")
    sale_cash = _sale(
        client, headers, product, customer=paid, qty=2, rate=100,
        payments=[{"mode": "cash", "amount": 200}],
    )
    sale_udhari = _sale(client, headers, product, customer=credit, qty=2, rate=100, payments=[])
    _return(client, headers, sale_cash, product, qty=1, refund=100, settlement="cash", customer=paid)
    _return(
        client, headers, sale_udhari, product, qty=1, refund=100,
        settlement="store_credit", customer=credit,
    )
    client.post(
        "/api/expenses",
        json={"amount": 40, "note": "diesel", "mode": "cash"},
        headers=headers,
    )

    shop_id = shop_uuid(uid)
    window = DateWindow(date(2000, 1, 1), date(2099, 12, 31), "all")
    sql, params = compile_metric("kamai", window, [])
    _, kamai_rows = _query(sql, shop_id, params)
    sql_b, params_b = compile_metric("bachat", window, [])
    _, bachat_rows = _query(sql_b, shop_id, params_b)

    # sales_gross 400, cash return 100 → kamai 300; karcha 40 → bachat 260
    assert kamai_rows
    assert float(kamai_rows[0]["kamai"]) == 300.0
    assert float(kamai_rows[0]["returns_total"]) == 100.0
    assert bachat_rows
    assert float(bachat_rows[0]["karcha"]) == 40.0
    assert float(bachat_rows[0]["bachat"]) == 260.0


def test_other_shop_rows_are_invisible(client):
    h1, uid1 = auth_header()
    h2, uid2 = auth_header()
    _create_shop(client, h1)
    _create_shop(client, h2)
    _create_customer(client, h1, name="Meena Quarries")
    _create_customer(client, h2, name="Other Secret")
    sid1 = shop_uuid(uid1)
    _, rows = _query("SELECT name FROM v_customer_balance", sid1)
    names = {r["name"] for r in rows}
    assert "Meena Quarries" in names
    assert "Other Secret" not in names


def test_sqft_line_amount_uses_price_qty(client):
    headers, uid = auth_header()
    _create_shop(client, headers)
    product = _create_product(
        client, headers, name="Kajaria 2x2", unit="box", size="2x2 ft",
        piecesPerBox=4, stockQty=20, sellPrice=800,
    )
    customer = _create_customer(client, headers, name="Area Buyer")
    client.post("/api/invoices", json={
        "type": "sale",
        "items": [{
            "productId": product["id"],
            "name": product["name"],
            "qty": 150,
            "pieces": 0,
            "unit": "sqft",
            "rate": 800,
            "piecesPerBox": 4,
            "size": "2x2 ft",
        }],
        "gstEnabled": False,
        "payments": [{"mode": "cash", "amount": 7500}],
        "customerId": customer["id"],
        "customerName": customer["name"],
    }, headers=headers)
    shop_id = shop_uuid(uid)
    _, rows = _query(
        "SELECT qty, unit, price_qty, line_amount FROM v_invoice_lines WHERE invoice_type = 'sale'",
        shop_id,
    )
    assert rows
    assert float(rows[0]["qty"]) == 150
    assert rows[0]["unit"] == "sqft"
    assert float(rows[0]["price_qty"]) == 9.375
    assert float(rows[0]["line_amount"]) == 7500.0


def test_catalog_documents_price_qty_and_categories():
    from app.analyst.catalog import SCHEMA_PREFIX

    assert "price_qty" in SCHEMA_PREFIX
    assert "category" in SCHEMA_PREFIX
    assert "v_invoice_lines.line_amount" in SCHEMA_PREFIX
    assert "unit[box|piece]" not in SCHEMA_PREFIX
