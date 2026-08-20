"""Integration tests for transactional invoice / return / payment routers."""

from __future__ import annotations

from tests.conftest import auth_header


def _create_shop(client, headers):
    res = client.get("/api/shops/me", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def _create_product(client, headers, **kwargs):
    body = {
        "name": kwargs.get("name", "White Tile"),
        "code": kwargs.get("code", "WT-1"),
        "company": kwargs.get("company", "Kajaria"),
        "size": kwargs.get("size", ""),
        "unit": kwargs.get("unit", "piece"),
        "piecesPerBox": kwargs.get("piecesPerBox", 1),
        "sellPrice": kwargs.get("sellPrice", 100),
        "stockQty": kwargs.get("stockQty", 10),
        "lowStockThreshold": 2,
    }
    res = client.post("/api/products", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def _create_customer(client, headers, name="Sharma Ji"):
    res = client.post(
        "/api/customers",
        json={"name": name, "phone": "9999999999", "isContractor": False, "siteNote": ""},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    return res.json()


def _sale(client, headers, product, customer=None, qty=2, rate=100, payments=None):
    body = {
        "type": "sale",
        "items": [{
            "productId": product["id"],
            "name": product["name"],
            "qty": qty,
            "pieces": 0,
            "unit": product["unit"],
            "rate": rate,
            "piecesPerBox": product["piecesPerBox"],
            "size": product.get("size") or "",
        }],
        "gstEnabled": False,
        "gstRate": 0,
        "payments": payments if payments is not None else [],
        "customerId": customer["id"] if customer else None,
        "customerName": customer["name"] if customer else "Walk-in",
    }
    res = client.post("/api/invoices", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def _return(client, headers, original, product, qty, refund, settlement, customer=None):
    body = {
        "originalInvoiceNo": original["invoiceNo"],
        "items": [{
            "productId": product["id"],
            "name": product["name"],
            "qty": qty,
            "pieces": 0,
            "unit": product["unit"],
            "rate": 100,
            "piecesPerBox": product["piecesPerBox"],
        }],
        "refundTotal": refund,
        "settlement": settlement,
        "customerId": customer["id"] if customer else original.get("customerId"),
        "customerName": (customer["name"] if customer else original.get("customerName")) or "",
    }
    res = client.post("/api/returns", json=body, headers=headers)
    assert res.status_code == 201, res.text
    return res.json()


def _get_product(client, headers, product_id):
    res = client.get(f"/api/products/{product_id}", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def _get_customer(client, headers, customer_id):
    res = client.get(f"/api/customers/{customer_id}", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


def _get_invoice(client, headers, invoice_id):
    res = client.get(f"/api/invoices/{invoice_id}", headers=headers)
    assert res.status_code == 200, res.text
    return res.json()


class TestInvoiceCreation:
    def test_sale_decrements_stock_and_assigns_unique_numbers(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers, stockQty=10)
        first = _sale(
            client, headers, product,
            payments=[{"mode": "cash", "amount": 200}],
        )
        second = _sale(
            client, headers, product, qty=1,
            payments=[{"mode": "cash", "amount": 100}],
        )
        assert first["invoiceNo"] != second["invoiceNo"]
        assert first["grandTotal"] == 200
        assert first["paymentStatus"] == "paid"
        stock = _get_product(client, headers, product["id"])
        assert stock["stockQty"] == 7

    def test_unpaid_sale_increments_customer_udhari(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers)
        customer = _create_customer(client, headers)
        inv = _sale(client, headers, product, customer=customer, payments=[])
        assert inv["amountPending"] == 200
        assert inv["paymentStatus"] == "pending"
        cust = _get_customer(client, headers, customer["id"])
        assert cust["totalPending"] == 200

    def test_insufficient_stock_is_rejected(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers, stockQty=1)
        res = client.post("/api/invoices", json={
            "type": "sale",
            "items": [{
                "productId": product["id"],
                "name": product["name"],
                "qty": 5,
                "pieces": 0,
                "unit": "piece",
                "rate": 100,
                "piecesPerBox": 1,
            }],
            "gstEnabled": False,
            "payments": [],
        }, headers=headers)
        assert res.status_code == 422
        stock = _get_product(client, headers, product["id"])
        assert stock["stockQty"] == 1


class TestReturnSettlements:
    def test_cash_return_restores_stock(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers, stockQty=10)
        customer = _create_customer(client, headers)
        sale = _sale(
            client, headers, product, customer=customer,
            payments=[{"mode": "cash", "amount": 200}],
        )
        ret = _return(client, headers, sale, product, qty=1, refund=100, settlement="cash", customer=customer)
        assert ret["type"] == "return"
        assert ret["settlement"] == "cash"
        assert ret["settlementDetail"]["cash"] == 100
        stock = _get_product(client, headers, product["id"])
        assert stock["stockQty"] == 9

    def test_adjust_udhari_clears_original_pending(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers)
        customer = _create_customer(client, headers)
        sale = _sale(client, headers, product, customer=customer, payments=[])
        ret = _return(
            client, headers, sale, product, qty=1, refund=100,
            settlement="adjust_udhari", customer=customer,
        )
        assert ret["settlement"] == "adjust_udhari"
        assert ret["settlementDetail"]["udhariAdjusted"] == 100
        original = _get_invoice(client, headers, sale["id"])
        assert original["amountPending"] == 100
        cust = _get_customer(client, headers, customer["id"])
        assert cust["totalPending"] == 100

    def test_store_credit_on_paid_bill(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers)
        customer = _create_customer(client, headers)
        sale = _sale(
            client, headers, product, customer=customer,
            payments=[{"mode": "cash", "amount": 200}],
        )
        ret = _return(
            client, headers, sale, product, qty=1, refund=100,
            settlement="store_credit", customer=customer,
        )
        assert ret["settlement"] == "store_credit"
        assert ret["settlementDetail"]["storeCredit"] == 100
        cust = _get_customer(client, headers, customer["id"])
        assert cust["storeCredit"] == 100
        assert cust["totalPending"] == 0


class TestPaymentsAndReconcile:
    def test_allocate_payment_reduces_pending(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers)
        customer = _create_customer(client, headers)
        sale = _sale(client, headers, product, customer=customer, payments=[])
        res = client.post(
            f"/api/customers/{customer['id']}/payment",
            json={"allocations": [{"invoiceId": sale["id"], "amount": 80}], "mode": "cash"},
            headers=headers,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["totalPaid"] == 80
        assert body["totalPending"] == 120
        original = _get_invoice(client, headers, sale["id"])
        assert original["amountPending"] == 120
        assert original["paymentStatus"] == "partial"

    def test_reconcile_applies_unallocated_return_to_open_sale(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers, stockQty=20)
        customer = _create_customer(client, headers, name="Reconcile Customer")
        paid = _sale(
            client, headers, product, customer=customer, qty=2,
            payments=[{"mode": "cash", "amount": 200}],
        )
        open_sale = _sale(client, headers, product, customer=customer, qty=2, payments=[])
        _return(
            client, headers, paid, product, qty=1, refund=100,
            settlement="cash", customer=customer,
        )
        res = client.post(
            f"/api/customers/{customer['id']}/reconcile",
            json={},
            headers=headers,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["amountAppliedToInvoices"] == 100
        original = _get_invoice(client, headers, open_sale["id"])
        assert original["amountPending"] == 100
        cust = _get_customer(client, headers, customer["id"])
        assert cust["totalPending"] == 100

    def test_duplicate_customer_name_conflict(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        _create_customer(client, headers, name="Sharma")
        res = client.post(
            "/api/customers",
            json={"name": "sharma", "phone": "", "isContractor": False, "siteNote": ""},
            headers=headers,
        )
        assert res.status_code == 409

    def test_missing_token_is_401(self, client):
        res = client.get("/api/shops/me")
        assert res.status_code == 401
