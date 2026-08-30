"""Unit tests for business math — the authoritative calc module.

These tests ensure GST calculations, bill totals, stock deduction logic,
and invoice number generation are correct.
"""

import pytest
from app.common.calc import (
    round2, item_amount, compute_bill_totals, gen_invoice_no,
    calculate_sold_pieces, validate_stock_availability,
    compute_stock_deduction, compute_stock_addition, sqft_calc,
    validate_payment_split, validate_bill_limits, cash_online_total, format_stock_pieces_label,
    payment_status, apply_payment_to_invoice, remove_return_adjust_payments,
    remaining_returnable_by_product, remaining_returnable_amount,
    recompute_customer_total_pending, allocate_return_across_invoices,
    apply_store_credit_conversion, settlement_label_from_detail,
    conversion_recorded_amount,
)
from app.common.errors import ValidationError


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

    def test_missing_unit_defaults_to_tiles(self):
        """Missing unit is tiles — loose pieces must count, matching frontend normalizer."""
        item = {"qty": 1, "pieces": 2, "rate": 400, "piecesPerBox": 4}
        assert item_amount(item) == 600.0

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

    def test_format_stock_pieces_label_tiles(self):
        product = {"piecesPerBox": 4}
        assert format_stock_pieces_label(product, 13) == "3b+1p"
        assert format_stock_pieces_label(product, 12) == "3b"

    def test_format_stock_pieces_label_sanitary(self):
        product = {"unit": "piece"}
        assert format_stock_pieces_label(product, 7) == "7 pcs"

    def test_piece_unit_stock(self):
        product = {"unit": "piece", "stockQty": 16}
        assert validate_stock_availability(product, 16) is True
        assert validate_stock_availability(product, 17) is False
        assert compute_stock_deduction(product, 5)["stockQty"] == 11.0


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


class TestPaymentSplit:
    def test_cash_online_sum(self):
        assert cash_online_total([
            {"mode": "cash", "amount": 100},
            {"mode": "online", "amount": 50},
            {"mode": "credit", "amount": 20},
        ]) == 150

    def test_overpay_cash_online_rejected(self):
        with pytest.raises(ValidationError):
            validate_payment_split(1000, [
                {"mode": "cash", "amount": 700},
                {"mode": "online", "amount": 400},
            ])

    def test_exact_total_allowed(self):
        validate_payment_split(1000, [
            {"mode": "cash", "amount": 600},
            {"mode": "online", "amount": 400},
        ])

    def test_total_with_credit_over_rejected(self):
        with pytest.raises(ValidationError):
            validate_payment_split(1000, [
                {"mode": "cash", "amount": 800},
                {"mode": "credit", "amount": 300},
            ])

    def test_compute_clamps_negative_pending(self):
        t = compute_bill_totals({
            "items": [{"qty": 1, "rate": 100, "unit": "box", "piecesPerBox": 1}],
            "gstEnabled": False,
            "payments": [{"mode": "cash", "amount": 500}],
        })
        assert t["grandTotal"] == 100
        assert t["amountPending"] == 0
        assert t["paymentStatus"] == "paid"


class TestBillLimits:
    def test_oversized_grand_total_rejected(self):
        totals = {"subtotal": 70_297_297_227, "grandTotal": 70_297_297_227, "amountPaid": 0, "amountPending": 70_297_297_227}
        with pytest.raises(ValidationError, match="bahut bada"):
            validate_bill_limits(totals, [{"name": "Tile", "qty": 1, "rate": 70_297_297_227, "unit": "box"}])

    def test_normal_total_allowed(self):
        items = [{"name": "Tile", "qty": 10, "rate": 450, "unit": "box", "piecesPerBox": 4}]
        totals = compute_bill_totals({"items": items, "gstEnabled": False, "payments": []})
        validate_bill_limits(totals, items)


class TestLedgerHelpers:
    def test_payment_status_thresholds(self):
        assert payment_status(0, 100) == "pending"
        assert payment_status(40, 60) == "partial"
        assert payment_status(100, 0) == "paid"
        assert payment_status(100, 0.4) == "paid"

    def test_apply_payment_caps_at_pending(self):
        inv = {
            "grandTotal": 1000,
            "amountPaid": 200,
            "amountPending": 800,
            "payments": [{"mode": "cash", "amount": 200}],
        }
        fields = apply_payment_to_invoice(inv, 9999, {"mode": "return_adjust", "returnInvoiceNo": "RET1"})
        assert fields["_applied"] == 800
        assert fields["amountPending"] == 0
        assert fields["paymentStatus"] == "paid"
        assert fields["payments"][-1]["mode"] == "return_adjust"

    def test_remove_return_adjust_payments(self):
        inv = {
            "grandTotal": 1000,
            "amountPaid": 1000,
            "amountPending": 0,
            "payments": [
                {"mode": "cash", "amount": 200},
                {"mode": "return_adjust", "amount": 800, "returnInvoiceNo": "RET1"},
            ],
        }
        fields = remove_return_adjust_payments(inv, "RET1")
        assert fields["amountPaid"] == 200
        assert fields["amountPending"] == 800
        assert fields["paymentStatus"] == "partial"
        assert len(fields["payments"]) == 1

    def test_remaining_returnable_by_product(self):
        original = [
            {"productId": "a", "qty": 2, "pieces": 0, "piecesPerBox": 4, "unit": "box"},
            {"productId": "b", "qty": 5, "unit": "piece"},
        ]
        prior = [
            {"productId": "a", "qty": 1, "pieces": 1, "piecesPerBox": 4, "unit": "box"},
        ]
        rem = remaining_returnable_by_product(original, prior)
        assert rem["a"] == 3  # 8 - 5
        assert rem["b"] == 5

    def test_remaining_returnable_amount(self):
        original = {"grandTotal": 1000}
        prior = [{"refundTotal": 300}, {"refundTotal": 200}]
        assert remaining_returnable_amount(original, prior) == 500

    def test_recompute_customer_total_pending(self):
        sales = [
            {"type": "sale", "amountPending": 100},
            {"type": "sale", "amountPending": 50.5},
            {"type": "return", "amountPending": 999},
        ]
        assert recompute_customer_total_pending(sales) == 150.5

    def test_allocate_clears_original_then_store_credit(self):
        original = {
            "id": "s1",
            "invoiceNo": "INV1",
            "grandTotal": 1000,
            "amountPaid": 0,
            "amountPending": 1000,
            "payments": [],
        }
        patches, detail, leftover = allocate_return_across_invoices(
            1000, original, [], return_invoice_no="RET1", settlement="store_credit",
        )
        assert leftover == 0
        assert detail["udhariAdjusted"] == 1000
        assert detail["storeCredit"] == 0  # fully unpaid → no leftover credit
        assert patches[0]["fields"]["amountPending"] == 0
        assert patches[0]["fields"]["paymentStatus"] == "paid"

    def test_allocate_adjust_fifo_and_excess_credit(self):
        original = {
            "id": "s1",
            "invoiceNo": "INV1",
            "grandTotal": 500,
            "amountPaid": 0,
            "amountPending": 500,
            "payments": [],
        }
        other = {
            "id": "s2",
            "invoiceNo": "INV2",
            "grandTotal": 300,
            "amountPaid": 0,
            "amountPending": 300,
            "payments": [],
        }
        patches, detail, leftover = allocate_return_across_invoices(
            900, original, [other], return_invoice_no="RET2", settlement="adjust_udhari",
        )
        assert leftover == 0
        assert detail["udhariAdjusted"] == 800
        assert detail["storeCredit"] == 100
        assert len(patches) == 2
        assert original["amountPending"] == 0
        assert other["amountPending"] == 0

    def test_allocate_cash_leftover_after_clearing_partial(self):
        # Paid 400 of 1000; return full 1000 → clear 600 pending, cash leftover 400
        original = {
            "id": "s1",
            "invoiceNo": "INV1",
            "grandTotal": 1000,
            "amountPaid": 400,
            "amountPending": 600,
            "payments": [{"mode": "cash", "amount": 400}],
        }
        patches, detail, leftover = allocate_return_across_invoices(
            1000, original, [], return_invoice_no="RET3", settlement="cash",
        )
        assert leftover == 0
        assert detail["udhariAdjusted"] == 600
        assert detail["cash"] == 400
        assert patches[0]["fields"]["amountPending"] == 0

    def test_convert_credit_slice_to_cash_keeps_udhari(self):
        old = {
            "cash": 0,
            "udhariAdjusted": 500,
            "storeCredit": 500,
            "invoiceAllocations": [{"invoiceNo": "INV-UDH", "amount": 500}],
        }
        detail = apply_store_credit_conversion(old, "cash")
        assert detail["udhariAdjusted"] == 500
        assert detail["cash"] == 500
        assert detail["storeCredit"] == 0
        assert detail["invoiceAllocations"] == old["invoiceAllocations"]
        assert settlement_label_from_detail(detail) == "cash"

    def test_convert_credit_slice_to_udhari_merges(self):
        old = {
            "cash": 0,
            "udhariAdjusted": 500,
            "storeCredit": 400,
            "invoiceAllocations": [{"invoiceNo": "INV1", "amount": 500}],
        }
        extra = {
            "cash": 0,
            "udhariAdjusted": 300,
            "storeCredit": 100,
            "invoiceAllocations": [{"invoiceNo": "INV2", "amount": 300}],
        }
        detail = apply_store_credit_conversion(old, "adjust_udhari", extra)
        assert detail["udhariAdjusted"] == 800
        assert detail["storeCredit"] == 100
        assert detail["cash"] == 0
        assert len(detail["invoiceAllocations"]) == 2

    def test_conversion_recorded_amount_is_absorbed_udhari_not_full_credit(self):
        extra = {"udhariAdjusted": 100, "storeCredit": 900, "cash": 0}
        assert conversion_recorded_amount("adjust_udhari", 1000, extra) == 100
        assert conversion_recorded_amount("cash", 1000, extra) == 1000

