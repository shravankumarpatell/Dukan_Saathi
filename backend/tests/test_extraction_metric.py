from app.genai.schemas import StockExtractRow
from eval.extraction.metric import score_rows


def _row(**kwargs) -> StockExtractRow:
    defaults = dict(
        name="Kajaria Dura",
        code="2130",
        company="Kajaria",
        size="2x2 ft",
        unit="box",
        piecesPerBox=4,
        qty=50,
    )
    defaults.update(kwargs)
    return StockExtractRow(**defaults)


def test_metric_perfect_match():
    gold = [_row(), _row(name="Cera Basin", code="B-101", company="Cera", size="", unit="piece", piecesPerBox=1, qty=12)]
    pred = [
        _row(),
        dict(name="Cera Basin", code="B-101", company="Cera", size="", unit="piece", piecesPerBox=1, qty=12),
    ]
    result = score_rows(gold, pred)
    assert result.exact is True
    assert result.score == 1.0
    assert "Perfect match" in result.feedback


def test_metric_normalizes_bare_size():
    gold = [_row(size="2x2 ft", unit="box", qty=10)]
    pred = [
        StockExtractRow(
            name="Kajaria Dura",
            code="2130",
            company="Kajaria",
            size="2x2",
            unit="box",
            piecesPerBox=4,
            qty=10,
        )
    ]
    result = score_rows(gold, pred)
    assert result.exact is True


def test_metric_maps_60x120_and_ignores_finish_prefix():
    gold = [_row(name="PERLATO SAHARA", code="", company="SATYAM CERAMIC", size="800x1600 mm", qty=45)]
    pred = [_row(name="CARVING PERLATO SAHARA", code="", company="SATYAM CERAMIC", size="800X1600", qty=45)]
    result = score_rows(gold, pred)
    assert result.exact is True


def test_metric_collapses_duplicated_name():
    gold = [_row(name="1852 F", code="", company="AVENGER", size="1x1 ft", piecesPerBox=8, qty=29)]
    pred = [_row(name="1852 F 1852 F", code="", company="AVENGER", size="12x12", piecesPerBox=8, qty=29)]
    result = score_rows(gold, pred)
    assert result.exact is True


def test_metric_60x120_size_matches_2x4():
    gold = [_row(name="CARVING 60*120", code="", company="", size="60*120", piecesPerBox=1, qty=655)]
    pred = [_row(name="CARVING 60*120", code="", company="", size="2x4 ft", piecesPerBox=1, qty=655)]
    result = score_rows(gold, pred)
    assert result.exact is True


def test_metric_wrong_qty_is_not_exact():
    gold = [_row(qty=50)]
    pred = [_row(qty=48)]
    result = score_rows(gold, pred)
    assert result.exact is False
    assert result.score == 0.0
    assert "qty" in result.feedback


def test_metric_extra_total_row_fails():
    gold = [_row()]
    pred = [_row(), _row(name="Grand Total", code="", company="", size="", qty=50)]
    result = score_rows(gold, pred)
    # totals are dropped before compare, so this should still be exact
    assert result.exact is True


def test_metric_extra_product_fails():
    gold = [_row()]
    pred = [_row(), _row(name="Other Tile", code="9999", qty=1)]
    result = score_rows(gold, pred)
    assert result.exact is False
    assert result.extra
    assert "9999" in result.feedback


def test_metric_missing_row_fails():
    gold = [_row(), _row(name="Other", code="9999", qty=1)]
    pred = [_row()]
    result = score_rows(gold, pred)
    assert result.exact is False
    assert result.missing
    assert "9999" in result.feedback


def test_metric_aligns_by_name_when_pred_omits_code():
    gold = [_row(name="ANTICO CAMEL(CROWN)", code="14 S-1", size="2x4 ft")]
    pred = [_row(name="ANTICO CAMEL(CROWN)", code="", size="2x4 ft")]
    result = score_rows(gold, pred)
    assert not result.missing
    assert not result.extra
    assert result.exact is False
    assert "code" in result.feedback


def test_metric_aligns_duplicate_codes_by_name():
    gold = [
        _row(name="EXPERIO NERO(RICHI)", code="11 S-1", size="2x4 ft", qty=200),
        _row(name="STONELLA WHITE", code="11 S-1", size="2x4 ft", qty=195),
    ]
    pred = [
        _row(name="STONELLA WHITE", code="11 S-1", size="2x4 ft", qty=195),
        _row(name="EXPERIO NERO(RICHI)", code="11 S-1", size="2x4 ft", qty=200),
    ]
    result = score_rows(gold, pred)
    assert result.exact is True


def test_metric_splits_series_prefix_out_of_name():
    gold = [_row(name="ANTICO CAMEL(CROWN)", code="14 S-1", size="2x4 ft")]
    pred = [_row(name="14 S-1 ANTICO CAMEL(CROWN)", code="", size="2x4 ft")]
    result = score_rows(gold, pred)
    assert result.exact is True


def test_metric_aligns_by_code_when_name_differs_slightly():
    gold = [_row(name="Kajaria Dura Gloss")]
    pred = [_row(name="Kajaria Dura")]
    result = score_rows(gold, pred)
    assert result.exact is False
    assert "name" in result.feedback


def test_gepa_metric_returns_float_for_evaluate():
    from eval.extraction.metric import gepa_metric

    gold = type("G", (), {"rows": [_row()]})()
    pred = type("P", (), {"rows": [_row()]})()
    out = gepa_metric(gold, pred)
    assert out == 1.0


def test_gepa_metric_returns_feedback_when_named():
    from eval.extraction.metric import gepa_metric

    gold = type("G", (), {"rows": [_row()]})()
    pred = type("P", (), {"rows": [_row(qty=1)]})()
    out = gepa_metric(gold, pred, pred_name="extract")
    assert isinstance(out, dict) or hasattr(out, "feedback")
    score = out["score"] if not isinstance(out, float) else out
    assert score == 0.0
    feedback = out["feedback"] if not isinstance(out, float) else ""
    assert "qty" in feedback


def test_clean_pred_rows_drops_totals():
    from eval.extraction.program import clean_pred_rows

    rows = clean_pred_rows(
        [
            {"name": "Kajaria Dura", "code": "2130", "company": "Kajaria", "size": "2x2", "unit": "box", "piecesPerBox": 4, "qty": 10},
            {"name": "Grand Total", "qty": 10},
        ]
    )
    assert len(rows) == 1
    assert rows[0]["size"] == "2x2 ft"


def test_clean_pred_rows_collapses_duplicate_name():
    from eval.extraction.program import clean_pred_rows

    rows = clean_pred_rows(
        [{"name": "3303 3303", "code": "", "company": "", "size": "2x4 ft", "unit": "box", "qty": 200}]
    )
    assert rows[0]["name"] == "3303"
