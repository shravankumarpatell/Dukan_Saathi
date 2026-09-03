"""Slab / stone area math — lockstep with frontend/src/lib/slab.test.js."""

from app.common.calc import item_amount, round2
from app.common.slab import (
    apply_measurements_to_line,
    is_slab_product,
    measurements_payload,
    row_area_sqft,
    slab_line_qty_rate,
    total_area,
)
from app.common.uom import SQM_TO_SQFT

SHEET_ROWS = [
    {"length": 8, "width": 8.25},
    {"length": 9.5, "width": 9.75},
    {"length": 10, "width": 10},
]


class TestRowAreaFeet:
    def test_sheet_cells(self):
        assert row_area_sqft(8, 8.25, "ft") == 66
        assert row_area_sqft(9.5, 9.75, "ft") == 92.625
        assert row_area_sqft(10, 10, "ft") == 100


class TestSheetTotal:
    def test_area_and_cost_inputs(self):
        area = total_area(SHEET_ROWS, "ft", "sqft")
        assert area == 258.625
        assert abs(area * 45 - 11638.125) < 1e-9
        # Frontend Math.round half-up is 11638.13; Python round() may banker.
        # Persist uses item_amount; UI/PDF use the JS twin.
        amount = item_amount({
            "qty": area, "rate": 45, "unit": "sqft", "productUnit": "sqft",
        })
        assert amount in (11638.12, 11638.13)
        assert abs(amount - 11638.125) < 0.01


class TestCmToSqft:
    def test_small_slab(self):
        a = row_area_sqft(8.25, 9.75, "cm")
        assert abs(a - (8.25 * 9.75) / 929.0304) < 1e-12
        assert round(a, 3) == 0.087


class TestAreaUnit:
    def test_sqm_total(self):
        sqft = total_area(SHEET_ROWS, "ft", "sqft")
        sqm = total_area(SHEET_ROWS, "ft", "sqm")
        assert abs(sqm - sqft / SQM_TO_SQFT) < 1e-12

    def test_sqm_rate_on_sqft_sku(self):
        product = {"unit": "sqft", "category": "natural_stone"}
        out = slab_line_qty_rate(
            SHEET_ROWS, "ft", "sqm", product, 45 * SQM_TO_SQFT,
        )
        assert out["unit"] == "sqft"
        assert abs(out["qty"] - 258.625) < 1e-4
        amount = item_amount({
            "qty": out["qty"], "rate": out["rate"],
            "unit": out["unit"], "productUnit": "sqft",
        })
        assert abs(amount - 11638.13) < 0.02


class TestIsSlab:
    def test_categories(self):
        assert is_slab_product({"category": "natural_stone"}) is True
        assert is_slab_product({"category": "engineered_stone"}) is True
        assert is_slab_product({"category": "stone"}) is True
        assert is_slab_product({"category": "tiles"}) is False
        assert is_slab_product({"unit": "sqft"}) is False


class TestApplyMeasurements:
    def test_ignores_typed_qty(self):
        product = {"unit": "sqft", "category": "natural_stone"}
        line = apply_measurements_to_line(
            {
                "qty": 1,
                "unit": "sqft",
                "measureUnit": "ft",
                "areaUnit": "sqft",
                "measurements": SHEET_ROWS,
            },
            product,
        )
        assert line["qty"] == 258.625
        assert len(line["measurements"]) == 3

    def test_payload_drops_empty(self):
        payload = measurements_payload(
            [*SHEET_ROWS, {"length": "", "width": ""}, {"length": 0, "width": 4}],
            "ft",
        )
        assert len(payload) == 3
        assert payload[0] == {"length": 8.0, "width": 8.25, "area": 66.0}


def test_round2_sheet_cost_js_half_up():
    """Document JS-equivalent half-up for the printed sheet."""
    n = 11638.125
    js_half_up = int(n * 100 + 0.5) / 100
    assert js_half_up == 11638.13
    assert abs(round2(n) - 11638.13) < 0.02
