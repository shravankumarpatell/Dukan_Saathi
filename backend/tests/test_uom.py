"""Unit master conversion — Kajaria / pipe / bag worked examples."""

from app.common.calc import item_amount, line_consumed_qty, round2
from app.common.uom import (
    SQM_TO_SQFT,
    default_allowed_units,
    from_product_unit,
    normalize_unit_code,
    sqft_per_box,
    sqft_per_piece,
    to_product_unit,
    uses_piece_stock,
)


KAJARIA = {
    "unit": "box",
    "size": "2x2 ft",
    "piecesPerBox": 4,
    "category": "tiles",
}


class TestNormalize:
    def test_aliases(self):
        assert normalize_unit_code("pcs") == "piece"
        assert normalize_unit_code("sft") == "sqft"
        assert normalize_unit_code("m") == "mtr"
        assert normalize_unit_code("bags") == "bag"

    def test_tiles_suggestions_include_sqft(self):
        assert default_allowed_units("tiles", "box")[:3] == ["box", "piece", "sqft"]

    def test_stone_suggestions_are_area(self):
        assert default_allowed_units("natural_stone", "sqft")[:2] == ["sqft", "sqm"]
        from app.common.uom import is_slab_product, category_meta
        assert is_slab_product({"category": "engineered_stone"})
        assert category_meta("natural_stone")["needsSize"] is False
        assert category_meta("natural_stone")["needsSlab"] is True


class TestKajariaArea:
    def test_nominal_2x2_is_4_sqft_not_600mm(self):
        assert sqft_per_piece(KAJARIA) == 4
        assert sqft_per_box(KAJARIA) == 16

    def test_20_box_at_800(self):
        item = {**KAJARIA, "qty": 20, "rate": 800, "unit": "box", "pieces": 0}
        assert item_amount(item) == 16000

    def test_8_piece_at_800_box(self):
        item = {**KAJARIA, "qty": 8, "rate": 800, "unit": "piece", "productUnit": "box"}
        assert item_amount(item) == 1600

    def test_16_sqft_is_one_box(self):
        item = {**KAJARIA, "qty": 16, "rate": 800, "unit": "sqft", "productUnit": "box"}
        assert item_amount(item) == 800
        assert to_product_unit(KAJARIA, "sqft", 16) == 1

    def test_150_sqft(self):
        item = {**KAJARIA, "qty": 150, "rate": 800, "unit": "sqft", "productUnit": "box"}
        assert item_amount(item) == 7500
        assert to_product_unit(KAJARIA, "sqft", 150) == 9.375


class TestPipeAndBag:
    def test_10_ft_to_meters(self):
        pipe = {"unit": "mtr", "category": "plumbing_construction", "packQty": 1}
        qty_m = to_product_unit(pipe, "ft", 10)
        assert round(qty_m, 6) == round(10 / 3.280839895, 6)
        assert item_amount({"qty": 10, "unit": "ft", "rate": 100, "productUnit": "mtr"}) == round2(qty_m * 100)

    def test_10_kg_of_20kg_bag(self):
        adhesive = {"unit": "bag", "packQty": 20, "category": "tile_installation"}
        assert to_product_unit(adhesive, "kg", 10) == 0.5
        assert item_amount(
            {"qty": 10, "unit": "kg", "rate": 400, "productUnit": "bag", "packQty": 20}
        ) == 200

    def test_sanitary_qty_times_rate(self):
        item = {"qty": 5, "rate": 100, "unit": "piece"}
        assert item_amount(item) == 500


class TestRoundTrip:
    def test_sqft_from_boxes(self):
        assert from_product_unit(KAJARIA, "sqft", 1) == 16

    def test_consumed_qty_sqft(self):
        item = {**KAJARIA, "qty": 150, "unit": "sqft", "productUnit": "box"}
        assert line_consumed_qty(item, KAJARIA) == 9.375


class TestSi:
    def test_sqm(self):
        assert abs(to_product_unit({"unit": "sqft"}, "sqm", 1) - SQM_TO_SQFT) < 1e-9


class TestPieceStock:
    def test_sqft_line_uses_product_unit(self):
        line = {**KAJARIA, "unit": "sqft", "productUnit": "box", "qty": 16}
        assert uses_piece_stock(line) is True
        assert uses_piece_stock({"unit": "mtr"}) is False
