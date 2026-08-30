"""Hostile SQL and tenant wrapping."""

from uuid import uuid4

import pytest

from app.analyst.guard import GuardError, guard_sql


SHOP = uuid4()


def _ok(sql: str) -> str:
    return guard_sql(sql, SHOP, dialect="sqlite")


def test_select_is_wrapped_with_shop_and_limit():
    out = _ok("SELECT name, udhari FROM v_customer_balance")
    assert str(SHOP) in out
    assert "shop_id" in out.lower() or "id =" in out.lower()
    assert "LIMIT" in out.upper()
    assert "v_customer_balance" in out.lower()


def test_cte_is_allowed():
    sql = """
    WITH x AS (
      SELECT kamai FROM v_daily WHERE bill_date >= :start_date
    )
    SELECT SUM(kamai) AS kamai FROM x
    """
    out = _ok(sql)
    assert "LIMIT" in out.upper()
    assert str(SHOP) in out


def test_postgres_binds_stay_colon_style():
    sql = "SELECT ROUND(SUM(kamai), 2) AS kamai FROM v_daily WHERE bill_date >= :start_date AND bill_date <= :end_date"
    out = guard_sql(sql, SHOP, dialect="postgres")
    assert ":start_date" in out
    assert ":end_date" in out
    assert "%(" not in out
    assert "%%" not in out


@pytest.mark.parametrize(
    "sql",
    [
        "DELETE FROM customers",
        "UPDATE invoices SET grand_total = 0",
        "DROP TABLE invoices",
        "INSERT INTO expenses (amount) VALUES (1)",
        "SELECT * FROM customers; SELECT * FROM invoices",
        "SELECT * FROM pg_catalog.pg_user",
        "SELECT * FROM sqlite_master",
        "SELECT * FROM customers WHERE 1=1",
        "SELECT pg_read_file('/etc/passwd')",
        "SELECT * FROM invoices FOR UPDATE",
        "COPY invoices TO STDOUT",
    ],
)
def test_hostile_sql_rejected(sql):
    with pytest.raises(GuardError):
        guard_sql(sql, SHOP, dialect="sqlite")


def test_limit_is_capped():
    out = _ok("SELECT * FROM v_sales LIMIT 5000")
    assert "5000" not in out
    assert "80" in out


def test_other_shop_predicate_still_gets_injected_shop():
    other = uuid4()
    out = _ok(f"SELECT * FROM customers WHERE shop_id = '{other}'")
    assert str(SHOP) in out
