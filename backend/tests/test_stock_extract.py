from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from app.genai.schemas import StockExtractResult, StockExtractRow
from app.genai.stock_extract import (
    drop_non_product_rows,
    enrich_rows_from_sheet_text,
    extract_pdf_text,
    infer_header_company,
    is_non_product_row,
    load_extraction_prompt,
    normalize_row,
    sheet_user_text,
)


def test_drop_totals_and_blank_rows():
    rows = [
        StockExtractRow(name="Kajaria Dura", code="2130", qty=10),
        StockExtractRow(name="Grand Total", qty=10),
        StockExtractRow(name="GST", qty=18),
        StockExtractRow(name="", code="", qty=0),
        StockExtractRow(name="CGST 9%", qty=1),
    ]
    kept = drop_non_product_rows(rows)
    assert [r.code for r in kept] == ["2130"]


def test_is_non_product_subtotal():
    assert is_non_product_row(StockExtractRow(name="Sub Total"))
    assert is_non_product_row(StockExtractRow(name="Amount in words"))
    assert not is_non_product_row(StockExtractRow(name="Kajaria Dura", code="1"))


def test_normalize_row_sanitary():
    row = normalize_row(StockExtractRow(name="Basin", unit="pcs", size="2x2 ft", piecesPerBox=4, qty=2))
    assert row.unit == "piece"
    assert row.size == ""
    assert row.piecesPerBox == 1


def test_sheet_user_text_includes_tables():
    text = sheet_user_text("| Name | Qty |\n| Dura | 50 |")
    assert "SHEET TEXT" in text
    assert "Dura" in text
    assert "boxes" in text


def test_sheet_user_text_without_pdf():
    text = sheet_user_text("")
    assert "SHEET TEXT" not in text
    assert "boxes" in text


def test_extract_pdf_text_skips_non_pdf():
    assert extract_pdf_text(b"\x89PNG") == ""
    assert extract_pdf_text(b"") == ""
    assert extract_pdf_text(b"%PDF-1.4 not a real pdf") == ""


def test_extract_pdf_text_uses_tables(monkeypatch):
    class FakePage:
        def extract_tables(self):
            return [[["Name", "Qty"], ["Kajaria Dura", "50"], [None, None]]]

        def extract_text(self):
            return ""

    class FakePdf:
        pages = [FakePage()]

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr("app.genai.stock_extract._open_pdfplumber", lambda *_a, **_k: FakePdf())
    text = extract_pdf_text(b"%PDF-1.4 fake")
    assert "Page 1 table" in text
    assert "Kajaria Dura" in text
    assert "50" in text


def test_extract_pdf_text_keeps_letterhead_with_tables(monkeypatch):
    class FakePage:
        def extract_tables(self):
            return [[["Name", "Qty"], ["PERLATO SAHARA", "45"]]]

        def extract_text(self):
            return "SATYAM CERAMIC\nStock list"

    class FakePdf:
        pages = [FakePage()]

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

    monkeypatch.setattr("app.genai.stock_extract._open_pdfplumber", lambda *_a, **_k: FakePdf())
    text = extract_pdf_text(b"%PDF-1.4 fake")
    assert "Page 1 table" in text
    assert "PERLATO SAHARA" in text
    assert "SATYAM CERAMIC" in text


def test_infer_header_company_satyam():
    assert infer_header_company("GSTIN 24XXXX\nSATYAM CERAMICS\nStock") == "SATYAM CERAMIC"
    assert infer_header_company("| Name | Qty |") == ""


def test_enrich_fills_series_code_and_company():
    rows = [
        StockExtractRow(name="ANTICO CAMEL(CROWN)", code="", company="", size="2x4 ft", qty=200),
        StockExtractRow(name="STONELLA WHITE", code="", company="", size="2x4 ft", qty=195),
    ]
    text = (
        "ALFANSO TILES\n"
        "| 14 S-1 | ANTICO CAMEL(CROWN) | 200 |\n"
        "| 11 | S-1 | STONELLA WHITE | 195 |"
    )
    out = enrich_rows_from_sheet_text(rows, text)
    assert out[0].code == "14 S-1"
    assert out[1].code == "11 S-1"
    assert out[0].company == "ALFANSO"
    assert out[1].company == "ALFANSO"


def test_normalize_row_splits_series_prefix():
    row = normalize_row(
        StockExtractRow(name="14 S-1 ANTICO CAMEL(CROWN)", code="", size="2x4 ft", qty=200)
    )
    assert row.name == "ANTICO CAMEL(CROWN)"
    assert row.code == "14 S-1"


def test_load_extraction_prompt_prefers_optimized(tmp_path: Path):
    prompts = tmp_path / "prompts"
    prompts.mkdir()
    (prompts / "extraction.yaml").write_text(
        "system: seed\ninstructions: seed-ins\nconstraints:\n  - a\n",
        encoding="utf-8",
    )
    (prompts / "extraction.optimized.yaml").write_text(
        "system: seed\ninstructions: gepa-ins\nconstraints:\n  - a\n",
        encoding="utf-8",
    )
    cfg = load_extraction_prompt(tmp_path)
    assert cfg.instructions == "gepa-ins"


@pytest.mark.asyncio
async def test_extract_stock_sends_sheet_text_and_drops_totals():
    from app.genai.services import ExtractionService

    async def fake_gen(*args, **kwargs):
        input_text = kwargs.get("input_text") or ""
        assert "SHEET TEXT" in input_text
        assert kwargs.get("image_mime") == "application/pdf"
        return StockExtractResult(
            rows=[
                StockExtractRow(name="Kajaria Dura", code="2130", size="2x2", unit="box", qty=50),
                StockExtractRow(name="Grand Total", qty=50),
            ]
        )

    with patch("app.genai.services.LLMClient.generate_structured", new=AsyncMock(side_effect=fake_gen)), patch(
        "app.genai.services.extract_pdf_text",
        return_value="KAJARIA\n| Name | Qty |\n| Kajaria Dura | 50 |",
    ):
        result = await ExtractionService.extract_stock("AAAA", "application/pdf")
    assert len(result.rows) == 1
    assert result.rows[0].code == "2130"
    assert result.rows[0].size == "2x2 ft"
    assert result.rows[0].company == "KAJARIA"
