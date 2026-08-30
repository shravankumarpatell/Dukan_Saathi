"""Hinglish dates and name tokenization."""

from datetime import date

from app.analyst.resolvers import (
    DateWindow,
    EntityHit,
    is_shop_aggregate_question,
    resolve_dates,
    tokenize_question,
    wants_phone,
)


def test_aaj_and_pichle_mahine():
    today = date(2026, 8, 22)
    assert resolve_dates("aaj ki kamai", today).start == today
    w = resolve_dates("pichle mahine ki kamai", today)
    assert w.start == date(2026, 7, 1)
    assert w.end == date(2026, 7, 31)


def test_year_is_calendar_jan_dec():
    today = date(2026, 8, 22)
    w = resolve_dates("is saal ki kamai", today)
    assert w.start == date(2026, 1, 1)
    assert w.end == today
    ly = resolve_dates("pichle saal ka stock", today)
    assert ly.start == date(2025, 1, 1)
    assert ly.end == date(2025, 12, 31)


def test_unspecified_is_full_history():
    today = date(2026, 8, 22)
    w = resolve_dates("sabse zyada udhari kiska", today)
    assert w.assumed is True
    assert w.start == date(2000, 1, 1)
    assert w.end == today


def test_follow_up_previous_month_uses_memory():
    today = date(2026, 8, 22)
    mem = DateWindow(date(2026, 7, 1), date(2026, 7, 31), "pichle mahine")
    w = resolve_dates("aur pehle wale mahine?", today, memory_window=mem)
    assert w.start == date(2026, 6, 1)
    assert w.end == date(2026, 6, 30)


def test_tokenize_strips_full_name_and_parts():
    ent = EntityHit(kind="customer", token=":c1", id="abc", display="Meena Quarries", score=0.9)
    q = tokenize_question("Meena Quarries ka last bill, Meena ji", [ent])
    assert "Meena" not in q
    assert "Quarries" not in q
    assert ":c1" in q


def test_wants_phone():
    assert wants_phone("uska phone number do") is True
    assert wants_phone("last bill kitna tha") is False


def test_shop_aggregate_skips_customer_pick():
    assert is_shop_aggregate_question("aaj kitni sale hui") is True
    assert is_shop_aggregate_question("aaj kitna kamaya") is True
    assert is_shop_aggregate_question("pichle mahine ki kamai") is True
    assert is_shop_aggregate_question("azad ka last bill") is False
    assert is_shop_aggregate_question("azad ki udhari kitni hai") is False

def test_product_deixis_and_focus_from_ranked_rows():
    from app.analyst.resolvers import (
        focus_from_result_rows,
        merge_focus_product,
        refers_to_prior_product,
    )

    assert refers_to_prior_product("is product se hamari kitni kamai hui")
    assert refers_to_prior_product("uski kamai kitni")
    assert refers_to_prior_product("yeh product ka stock")
    assert not refers_to_prior_product("sabse jada selling product konsa tha")

    focus = focus_from_result_rows(
        ["product_id", "product_name", "qty_sold"],
        [
            {
                "product_id": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
                "product_name": "1002 LL WHITE",
                "qty_sold": 186.0,
            },
            {
                "product_id": "11111111-2222-3333-4444-555555555555",
                "product_name": "1108 LL JAZZ",
                "qty_sold": 80.0,
            },
        ],
        question="sabse jada selling product konsa tha",
    )
    assert focus is not None
    assert focus.display == "1002 LL WHITE"
    assert focus.id.startswith("aaaaaaaa")

    assert (
        focus_from_result_rows(
            ["name", "code", "stock_qty"],
            [{"name": "A", "code": "1", "stock_qty": 1}, {"name": "B", "code": "2", "stock_qty": 2}],
            question="stock list dikhao",
        )
        is None
    )

    merged = merge_focus_product([], focus, "is product se kitni kamai")
    assert len(merged) == 1
    assert merged[0].display == "1002 LL WHITE"
    assert merge_focus_product([], focus, "aaj ki kamai") == []
