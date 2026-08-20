from app.common.tile_sizes import normalize_tile_size


class TestNormalizeTileSize:
    def test_bare_2x2_is_feet(self):
        assert normalize_tile_size("2*2") == "2x2 ft"
        assert normalize_tile_size("2x2") == "2x2 ft"
        assert normalize_tile_size("600x600") == "2x2 ft"

    def test_12x18_is_inches(self):
        assert normalize_tile_size("12*18") == "12x18 in"
        assert normalize_tile_size("12x18") == "12x18 in"
        assert normalize_tile_size("300x450") == "12x18 in"
        assert normalize_tile_size("1x1.5 ft") == "12x18 in"

    def test_60x120_is_2x4_ft(self):
        assert normalize_tile_size("60*120") == "2x4 ft"
        assert normalize_tile_size("60x120") == "2x4 ft"
        assert normalize_tile_size("60x60") == "2x2 ft"
        assert normalize_tile_size("80x160") == "800x1600 mm"
        assert normalize_tile_size("2x4") == "2x4 ft"
        assert normalize_tile_size("1x1") == "1x1 ft"
        assert normalize_tile_size("8x12") == "8x12 in"

    def test_unknown(self):
        assert normalize_tile_size("") == ""
        assert normalize_tile_size("basin") == ""
        assert normalize_tile_size("2x2 in") == ""
