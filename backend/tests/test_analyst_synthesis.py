"""Minimal shopkeeper-facing answers — no assumption footnotes, no 1-cell tables."""

from app.analyst.sqlgen import AnalystTemplate
from app.analyst.synthesis import drop_blank_columns, interpret_empty, render_answer
from app.analyst.synthesis import EMPTY_ALERT, EMPTY_GENERIC, EMPTY_WINDOW


def test_one_cell_is_bare_value_no_table_no_assumptions():
    tpl = AnalystTemplate(template="The user is asking for the name {{owner_name}}")
    text = render_answer(
        tpl,
        ["owner_name"],
        [{"owner_name": "Shravan Kumar"}],
        "maine 2000-01-01 se 2026-08-22 maana (signup se aaj tak)",
    )
    assert text == "Shravan Kumar"
    assert "|" not in text
    assert "NAME" not in text
    assert "assum" not in text.lower()
    assert "maine" not in text


def test_two_facts_joined_without_table():
    text = render_answer(
        None,
        ["name", "phone"],
        [{"name": "Meena Quarries", "phone": "9876501234"}],
        "ignored",
    )
    assert text == "Meena Quarries — 9876501234"
    assert "|" not in text


def test_empty_rows_uses_shop_aware_message():
    text = render_answer(None, ["kamai"], [], "signup se aaj tak", empty_message=EMPTY_WINDOW)
    assert text == EMPTY_WINDOW
    assert "signup" not in text
    generic = render_answer(None, ["kamai"], [])
    assert generic == EMPTY_GENERIC
    assert interpret_empty(kind="product_alert") == EMPTY_ALERT
    assert interpret_empty(metric="kamai") == EMPTY_WINDOW
    assert "match nahi" in interpret_empty(had_customer=True)


def test_multi_row_keeps_markdown_table():
    text = render_answer(
        AnalystTemplate(template=""),
        ["name", "udhari"],
        [
            {"name": "A", "udhari": 10.0},
            {"name": "B", "udhari": 5.0},
        ],
        "",
        question="udhari list dikhao",
    )
    assert "Sabse upar A" in text
    assert "| name |" in text
    assert "| udhari |" in text
    assert "A" in text
    assert "B" in text
    assert text.count("|") >= 6


def test_top_seller_gets_clear_lead_line():
    text = render_answer(
        None,
        ["product_name", "total_qty_sold"],
        [
            {"product_name": "1882 LL WHITE", "total_qty_sold": 186.0},
            {"product_name": "1887 LL BEIGE", "total_qty_sold": 181.0},
        ],
        question="sabse jada selling product konsa tha",
    )
    assert "1882 LL WHITE" in text.split("\n")[0]
    assert "186" in text.split("\n")[0]
    # Singular "konsa" → answer only, no full table dump
    assert "|" not in text


def test_hides_internal_ids_from_table():
    text = render_answer(
        None,
        ["shop_id", "product_id", "product_name", "qty_sold"],
        [
            {
                "shop_id": "b4532e8f-2425-43c1-a8b9-49a90af26271",
                "product_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                "product_name": "1002 LL WHITE",
                "qty_sold": 186.0,
            },
            {
                "shop_id": "b4532e8f-2425-43c1-a8b9-49a90af26271",
                "product_id": "11111111-2222-3333-4444-555555555555",
                "product_name": "1108 LL JAZZ",
                "qty_sold": 80.0,
            },
        ],
        question="top products list dikhao",
    )
    assert "shop_id" not in text.lower()
    assert "product_id" not in text.lower()
    assert "b4532e8f" not in text
    assert "1002 LL WHITE" in text
    assert "| product_name |" in text


def test_kamai_single_cell_is_labeled():
    text = render_answer(None, ["kamai"], [{"kamai": 1200.5}])
    assert text == "Kamai ₹1200.50"


def test_drop_blank_columns():
    cols, rows = drop_blank_columns(
        ["name", "company", "stock_qty"],
        [
            {"name": "A", "company": "", "stock_qty": 100},
            {"name": "B", "company": None, "stock_qty": 5},
        ],
    )
    assert cols == ["name", "stock_qty"]
    assert "company" not in rows[0]
