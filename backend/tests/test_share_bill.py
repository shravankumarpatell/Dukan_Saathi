"""Public invoice link: token only, no stored PDF, no internal ids."""

from tests.conftest import auth_header
from tests.test_routers_transactions import _create_product, _create_shop, _sale


def test_shared_bill_is_public_and_hides_ids(client):
    headers, _ = auth_header()
    _create_shop(client, headers)
    product = _create_product(client, headers, stockQty=5)
    sale = _sale(
        client, headers, product,
        payments=[{"mode": "cash", "amount": 200}],
    )
    token = sale["shareToken"]
    assert isinstance(token, str) and len(token) >= 20
    assert sale["id"] not in token
    assert sale["invoiceNo"] not in token

    opened = client.get(f"/api/b/{token}")
    assert opened.status_code == 200, opened.text
    assert opened.headers["cache-control"] == "private, no-store"
    body = opened.json()
    invoice = body["invoice"]
    assert invoice["invoiceNo"] == sale["invoiceNo"]
    assert invoice["grandTotal"] == sale["grandTotal"]
    assert "id" not in invoice
    assert "customerId" not in invoice
    assert "shareToken" not in invoice
    assert "productId" not in invoice["items"][0]
    assert set(body["shop"]) == {"name", "address", "phone", "gstEnabled", "gstin"}

    pdf = client.get(f"/api/b/{token}/invoice.pdf")
    assert pdf.status_code == 200, pdf.text
    assert pdf.headers["content-type"].startswith("application/pdf")
    assert pdf.content.startswith(b"%PDF")

    assert client.get(f"/api/b/{sale['id']}").status_code == 404
    assert client.get("/api/b/short").status_code == 404
    assert client.get("/api/b/" + ("a" * 24)).status_code == 404

    other_headers, _ = auth_header()
    hidden = client.get(f"/api/invoices/{sale['id']}", headers=other_headers)
    assert hidden.status_code == 404
