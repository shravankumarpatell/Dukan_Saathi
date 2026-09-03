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
    for key in ("category", "packQty", "allowedUnits"):
        if key in kwargs:
            body[key] = kwargs[key]
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


class TestMixedReturnThenCashConvert:
    def test_skp_udhari_capped_then_cash_refund_keeps_udhari(self, client):
        """Udhari 500, paid purchase 1500, return 1000 against udhari → 500+500 credit;
        cash convert mutates the same return to 500 udhari + 500 cash."""
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers, stockQty=40, sellPrice=100)
        customer = _create_customer(client, headers, name="SKP")
        udhari_sale = _sale(client, headers, product, customer=customer, qty=5, payments=[])
        paid_sale = _sale(
            client, headers, product, customer=customer, qty=15,
            payments=[{"mode": "cash", "amount": 1500}],
        )
        before = _get_customer(client, headers, customer["id"])
        assert before["totalPending"] == 500
        assert before["storeCredit"] == 0

        ret = _return(
            client, headers, paid_sale, product, qty=10, refund=1000,
            settlement="adjust_udhari", customer=customer,
        )
        assert ret["refundTotal"] == 1000
        assert ret["settlementDetail"]["udhariAdjusted"] == 500
        assert ret["settlementDetail"]["storeCredit"] == 500
        assert ret["settlementDetail"]["cash"] == 0
        after_ret = _get_customer(client, headers, customer["id"])
        assert after_ret["totalPending"] == 0
        assert after_ret["storeCredit"] == 500
        assert _get_invoice(client, headers, udhari_sale["id"])["amountPending"] == 0

        converted = client.post(
            f"/api/returns/{ret['id']}/convert-store-credit",
            json={"targetSettlement": "cash"},
            headers=headers,
        )
        assert converted.status_code == 200, converted.text
        body = converted.json()
        assert body["id"] == ret["id"]
        assert body["invoiceNo"] == ret["invoiceNo"]
        assert body["refundTotal"] == 1000
        assert body["settlementDetail"]["udhariAdjusted"] == 500
        assert body["settlementDetail"]["cash"] == 500
        assert body["settlementDetail"]["storeCredit"] == 0
        assert body["settlementConvertedAmount"] == 500
        assert body["settlementConvertedTo"] == "cash"
        assert body["settlementConvertedAt"]
        after_cash = _get_customer(client, headers, customer["id"])
        assert after_cash["storeCredit"] == 0
        assert after_cash["totalPending"] == 0
        # Prior udhari clear must not reopen.
        assert _get_invoice(client, headers, udhari_sale["id"])["amountPending"] == 0

    def test_store_credit_to_udhari_records_conversion_receipt_fields(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers, stockQty=20, sellPrice=100)
        customer = _create_customer(client, headers, name="Udhari Convert")
        open_sale = _sale(client, headers, product, customer=customer, qty=2, payments=[])
        paid_sale = _sale(
            client, headers, product, customer=customer, qty=2,
            payments=[{"mode": "cash", "amount": 200}],
        )
        ret = _return(
            client, headers, paid_sale, product, qty=1, refund=100,
            settlement="store_credit", customer=customer,
        )
        assert ret["settlementDetail"]["storeCredit"] == 100
        before = _get_customer(client, headers, customer["id"])
        assert before["storeCredit"] == 100
        assert before["totalPending"] == 200

        converted = client.post(
            f"/api/returns/{ret['id']}/convert-store-credit",
            json={"targetSettlement": "adjust_udhari"},
            headers=headers,
        )
        assert converted.status_code == 200, converted.text
        body = converted.json()
        assert body["settlementConvertedAmount"] == 100
        assert body["settlementConvertedTo"] == "adjust_udhari"
        assert body["settlementConvertedAt"]
        assert body["settlementDetail"]["udhariAdjusted"] == 100
        assert body["settlementDetail"]["storeCredit"] == 0
        after = _get_customer(client, headers, customer["id"])
        assert after["storeCredit"] == 0
        assert after["totalPending"] == 100
        assert _get_invoice(client, headers, open_sale["id"])["amountPending"] == 100

    def test_udhari_convert_records_only_absorbed_amount_keeps_leftover_credit(self, client):
        """Store credit 1000 vs open udhari 100 → receipt is 100, credit left 900."""
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers, stockQty=40, sellPrice=100)
        customer = _create_customer(client, headers, name="Leftover Convert")
        open_sale = _sale(client, headers, product, customer=customer, qty=1, payments=[])
        paid_sale = _sale(
            client, headers, product, customer=customer, qty=10,
            payments=[{"mode": "cash", "amount": 1000}],
        )
        ret = _return(
            client, headers, paid_sale, product, qty=10, refund=1000,
            settlement="store_credit", customer=customer,
        )
        assert ret["settlementDetail"]["storeCredit"] == 1000
        before = _get_customer(client, headers, customer["id"])
        assert before["storeCredit"] == 1000
        assert before["totalPending"] == 100

        converted = client.post(
            f"/api/returns/{ret['id']}/convert-store-credit",
            json={"targetSettlement": "adjust_udhari"},
            headers=headers,
        )
        assert converted.status_code == 200, converted.text
        body = converted.json()
        assert body["settlementConvertedAmount"] == 100
        assert body["settlementConvertedTo"] == "adjust_udhari"
        assert body["settlementDetail"]["udhariAdjusted"] == 100
        assert body["settlementDetail"]["storeCredit"] == 900
        after = _get_customer(client, headers, customer["id"])
        assert after["storeCredit"] == 900
        assert after["totalPending"] == 0
        assert _get_invoice(client, headers, open_sale["id"])["amountPending"] == 0


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
        assert body["mode"] == "cash"
        assert body["paidAt"]
        assert body["allocations"] == [{
            "invoiceId": sale["id"],
            "invoiceNo": sale["invoiceNo"],
            "amount": 80,
            "amountPending": 120,
        }]
        original = _get_invoice(client, headers, sale["id"])
        assert original["amountPending"] == 120
        assert original["paymentStatus"] == "partial"

    def test_allocate_payment_across_bills_shares_timestamp(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers)
        customer = _create_customer(client, headers)
        first = _sale(client, headers, product, customer=customer, payments=[])
        second = _sale(client, headers, product, customer=customer, payments=[])
        res = client.post(
            f"/api/customers/{customer['id']}/payment",
            json={
                "allocations": [
                    {"invoiceId": first["id"], "amount": 50},
                    {"invoiceId": second["id"], "amount": 30},
                ],
                "mode": "online",
            },
            headers=headers,
        )
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["totalPaid"] == 80
        assert body["mode"] == "online"
        assert body["totalPending"] == 320
        assert [row["amount"] for row in body["allocations"]] == [50, 30]
        first_pay = _get_invoice(client, headers, first["id"])["payments"][-1]
        second_pay = _get_invoice(client, headers, second["id"])["payments"][-1]
        assert first_pay["mode"] == "online"
        assert first_pay["date"] == second_pay["date"]
        assert (first_pay["date"] or "")[:19] == (body["paidAt"] or "")[:19]
        after = _get_customer(client, headers, customer["id"])
        assert after["totalPending"] == 320

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


class TestProductUom:
    def test_piece_product_is_sanitaryware(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(client, headers, unit="piece")
        assert product["category"] == "sanitaryware"
        assert product["unit"] == "piece"
        assert "piece" in product["allowedUnits"]

    def test_box_product_allows_sqft(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(
            client, headers, unit="box", size="2x2 ft", piecesPerBox=4, stockQty=20, sellPrice=800,
        )
        assert product["category"] == "tiles"
        assert "sqft" in product["allowedUnits"]

    def test_sqft_line_converts_to_box_rate(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(
            client, headers,
            name="Kajaria 2x2", unit="box", size="2x2 ft", piecesPerBox=4,
            stockQty=20, sellPrice=800,
        )
        res = client.post("/api/invoices", json={
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
        }, headers=headers)
        assert res.status_code == 201, res.text
        inv = res.json()
        assert inv["grandTotal"] == 7500
        stock = _get_product(client, headers, product["id"])
        assert stock["stockQty"] == 10.625  # 20 - 9.375

    def test_pipe_ft_decrements_meters(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(
            client, headers,
            name="PVC 1 inch", unit="mtr", category="plumbing_construction",
            stockQty=10, sellPrice=50, piecesPerBox=1,
        )
        res = client.post("/api/invoices", json={
            "type": "sale",
            "items": [{
                "productId": product["id"],
                "name": product["name"],
                "qty": 10,
                "pieces": 0,
                "unit": "ft",
                "rate": 50,
                "piecesPerBox": 1,
            }],
            "gstEnabled": False,
            "payments": [],
        }, headers=headers)
        assert res.status_code == 201, res.text
        inv = res.json()
        meters = 10 / 3.280839895
        assert abs(inv["grandTotal"] - round(meters * 50, 2)) < 0.02
        stock = _get_product(client, headers, product["id"])
        assert abs(stock["stockQty"] - (10 - meters)) < 0.01

    def test_bag_kg_line(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(
            client, headers,
            name="Adhesive", unit="bag", category="tile_installation",
            packQty=20, stockQty=5, sellPrice=400, piecesPerBox=1,
        )
        res = client.post("/api/invoices", json={
            "type": "sale",
            "items": [{
                "productId": product["id"],
                "name": product["name"],
                "qty": 10,
                "pieces": 0,
                "unit": "kg",
                "rate": 400,
                "piecesPerBox": 1,
            }],
            "gstEnabled": False,
            "payments": [{"mode": "cash", "amount": 200}],
        }, headers=headers)
        assert res.status_code == 201, res.text
        assert res.json()["grandTotal"] == 200
        stock = _get_product(client, headers, product["id"])
        assert stock["stockQty"] == 4.5


class TestSlabMeasurements:
    def test_recomputes_qty_from_grid_and_decrements_remaining_sqft(self, client):
        headers, _ = auth_header()
        _create_shop(client, headers)
        product = _create_product(
            client, headers,
            name="S-White",
            unit="sqft",
            category="natural_stone",
            allowedUnits=["sqft", "sqm"],
            stockQty=1000,
            sellPrice=45,
            piecesPerBox=1,
            size="",
        )
        rows = [
            {"length": 8, "width": 8.25},
            {"length": 9.5, "width": 9.75},
            {"length": 10, "width": 10},
        ]
        res = client.post("/api/invoices", json={
            "type": "sale",
            "vehicleNo": "GJ-01-AB-1234",
            "items": [{
                "productId": product["id"],
                "name": product["name"],
                "qty": 1,
                "pieces": 0,
                "unit": "sqft",
                "rate": 45,
                "piecesPerBox": 1,
                "lotNo": "L-12",
                "measureUnit": "ft",
                "areaUnit": "sqft",
                "measurements": rows,
            }],
            "gstEnabled": False,
            "payments": [],
        }, headers=headers)
        assert res.status_code == 201, res.text
        inv = res.json()
        assert inv["vehicleNo"] == "GJ-01-AB-1234"
        line = inv["items"][0]
        assert line["qty"] == 258.625
        assert line["lotNo"] == "L-12"
        assert len(line["measurements"]) == 3
        assert abs(inv["grandTotal"] - 11638.13) < 0.02
        stock = _get_product(client, headers, product["id"])
        assert abs(stock["stockQty"] - (1000 - 258.625)) < 1e-6

