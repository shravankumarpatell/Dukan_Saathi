"""Unit tests for business math — the authoritative calc module.

These tests ensure GST calculations, bill totals, stock deduction logic,
and invoice number generation are correct.
"""

import pytest
from app.common.calc import (
    round2, item_amount, compute_bill_totals, gen_invoice_no,
    calculate_sold_pieces, validate_stock_availability,
    compute_stock_deduction, compute_stock_addition, sqft_calc,
)


class TestRound2:
    def test_normal(self):
        assert round2(10.456) == 10.46

    def test_none(self):
        assert round2(None) == 0

    def test_zero(self):
        assert round2(0) == 0

    def test_negative(self):
        assert round2(-3.141) == -3.14


class TestItemAmount:
    def test_simple_box(self):
        """1 box @ ₹500 = ₹500"""
        item = {"qty": 1, "rate": 500, "unit": "box", "piecesPerBox": 4}
        assert item_amount(item) == 500.0

    def test_box_with_loose_pieces(self):
        """2 boxes + 3 pieces @ ₹400/box, 4 per box = 2*400 + 3*(400/4) = 800 + 300 = 1100"""
        item = {"qty": 2, "pieces": 3, "rate": 400, "unit": "box", "piecesPerBox": 4}
        assert item_amount(item) == 1100.0

    def test_piece_unit(self):
        """5 pieces @ ₹100 = ₹500"""
        item = {"qty": 5, "rate": 100, "unit": "piece", "piecesPerBox": 1}
        assert item_amount(item) == 500.0

    def test_zero_qty(self):
        item = {"qty": 0, "pieces": 0, "rate": 100, "unit": "box"}
        assert item_amount(item) == 0

    def test_missing_fields(self):
        """Should handle missing/None fields gracefully."""
        assert item_amount({}) == 0


class TestComputeBillTotals:
    def test_simple_sale_no_gst(self):
        draft = {
            "items": [{"qty": 2, "rate": 500, "unit": "box", "piecesPerBox": 1}],
            "gstEnabled": False,
            "payments": [{"mode": "cash", "amount": 1000}],
        }
        t = compute_bill_totals(draft)
        assert t["subtotal"] == 1000
        assert t["gstAmount"] == 0
        assert t["grandTotal"] == 1000
        assert t["paymentStatus"] == "paid"

    def test_sale_with_gst_18(self):
        draft = {
            "items": [{"qty": 1, "rate": 1000, "unit": "box", "piecesPerBox": 1}],
            "gstEnabled": True,
            "gstRate": 18,
            "payments": [],
        }
        t = compute_bill_totals(draft)
        assert t["subtotal"] == 1000
        assert t["gstAmount"] == 180
        assert t["grandTotal"] == 1180
        assert t["paymentStatus"] == "pending"

    def test_partial_payment(self):
        draft = {
            "items": [{"qty": 1, "rate": 1000, "unit": "box", "piecesPerBox": 1}],
            "gstEnabled": True,
            "gstRate": 18,
            "payments": [{"mode": "cash", "amount": 500}],
        }
        t = compute_bill_totals(draft)
        assert t["grandTotal"] == 1180
        assert t["amountPaid"] == 500
        assert t["amountPending"] == 680
        assert t["paymentStatus"] == "partial"

    def test_flat_discount(self):
        draft = {
            "items": [{"qty": 1, "rate": 1000, "unit": "box", "piecesPerBox": 1}],
            "gstEnabled": True,
            "gstRate": 18,
            "discount": {"type": "flat", "value": 200},
            "payments": [],
        }
        t = compute_bill_totals(draft)
        assert t["subtotal"] == 1000
        assert t["discountOff"] == 200
        # Taxable = 1000 - 200 = 800, GST = 800 * 0.18 = 144
        assert t["gstAmount"] == 144
        assert t["grandTotal"] == 944

    def test_percent_discount(self):
        draft = {
            "items": [{"qty": 1, "rate": 1000, "unit": "box", "piecesPerBox": 1}],
            "gstEnabled": True,
            "gstRate": 18,
            "discount": {"type": "percent", "value": 10},
            "payments": [],
        }
        t = compute_bill_totals(draft)
        assert t["discountOff"] == 100  # 10% of 1000
        assert t["grandTotal"] == 1062  # (1000-100)*1.18

    def test_multiple_items(self):
        draft = {
            "items": [
                {"qty": 3, "rate": 200, "unit": "box", "piecesPerBox": 1},
                {"qty": 2, "pieces": 1, "rate": 400, "unit": "box", "piecesPerBox": 4},
            ],
            "gstEnabled": False,
            "payments": [],
        }
        t = compute_bill_totals(draft)
        # 3*200 = 600, 2*400 + 1*(400/4) = 800 + 100 = 900 → total 1500
        assert t["subtotal"] == 1500
        assert t["grandTotal"] == 1500

    def test_invalid_gst_rate_defaults(self):
        draft = {
            "items": [{"qty": 1, "rate": 100, "unit": "box"}],
            "gstEnabled": True,
            "gstRate": 99,  # invalid
            "payments": [],
        }
        t = compute_bill_totals(draft)
        assert t["gstRate"] == 18  # default


class TestInvoiceNo:
    def test_gst_enabled(self):
        no = gen_invoice_no(42, True)
        assert no.startswith("GST")
        assert "0042" in no

    def test_gst_disabled(self):
        no = gen_invoice_no(1, False)
        assert no.startswith("INV")

    def test_custom_prefix(self):
        no = gen_invoice_no(7, True, "RET")
        assert no.startswith("RET")
        assert "0007" in no


class TestStockOperations:
    def test_calculate_sold_pieces_box(self):
        """2 boxes of 4 + 3 loose = 11 pieces"""
        item = {"qty": 2, "pieces": 3, "piecesPerBox": 4}
        assert calculate_sold_pieces(item) == 11

    def test_validate_stock_sufficient(self):
        product = {"stockQty": 15, "piecesPerBox": 4}
        assert validate_stock_availability(product, 60) is True  # 15 boxes * 4 = 60

    def test_validate_stock_insufficient(self):
        product = {"stockQty": 15, "piecesPerBox": 4}
        assert validate_stock_availability(product, 61) is False

    def test_validate_stock_legacy_fields(self):
        """Legacy showroomQty/godownQty should still be counted."""
        product = {"showroomQty": 5, "godownQty": 10, "piecesPerBox": 4}
        assert validate_stock_availability(product, 60) is True
        assert validate_stock_availability(product, 61) is False

    def test_deduction_unified(self):
        """stockQty=15 boxes (60pc). Sell 50 pieces. → 10pc left = 2.5 boxes."""
        product = {"stockQty": 15, "piecesPerBox": 4}
        result = compute_stock_deduction(product, 50)
        assert result["stockQty"] == 2.5

    def test_deduction_legacy_consolidation(self):
        """Legacy fields should be consolidated into stockQty and zeroed out."""
        product = {"showroomQty": 5, "godownQty": 10, "piecesPerBox": 4}
        result = compute_stock_deduction(product, 20)
        assert result["stockQty"] == 10.0  # 60 - 20 = 40pc = 10 boxes
        assert result["godownQty"] == 0
        assert result["showroomQty"] == 0

    def test_stock_addition(self):
        """Add 8 pieces to stock (currently 10 boxes of 4 = 40pc). → 48pc = 12 boxes."""
        product = {"stockQty": 10, "piecesPerBox": 4}
        result = compute_stock_addition(product, 8)
        assert result["stockQty"] == 12.0

    def test_stock_addition_legacy(self):
        """Legacy fields should be consolidated on addition too."""
        product = {"godownQty": 10, "piecesPerBox": 4}
        result = compute_stock_addition(product, 8)
        assert result["stockQty"] == 12.0
        assert result["godownQty"] == 0


class TestSqftCalc:
    def test_basic(self):
        result = sqft_calc(
            room_length_ft=10, room_width_ft=10,
            tile_len_inch=24, tile_wid_inch=24,
            pieces_per_box=4, wastage_pct=5,
        )
        assert result["roomArea"] == 100
        assert result["tilesNeeded"] > 0
        assert result["boxesNeeded"] >= 0

    def test_direct_area(self):
        result = sqft_calc(
            room_area=100,
            tile_len_inch=12, tile_wid_inch=12,
            pieces_per_box=1, wastage_pct=0,
        )
        assert result["roomArea"] == 100
        assert result["tilesNeeded"] == 100  # 1 sqft tiles, 100 sqft room

    def test_zero_tile_area(self):
        result = sqft_calc(room_area=100, tile_len_inch=0, tile_wid_inch=0)
        assert result["tilesNeeded"] == 0
