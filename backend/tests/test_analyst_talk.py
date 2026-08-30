"""Local greeting / identity routing."""

from app.analyst.talk import (
    TALK_GREET,
    TALK_OWNER_ROLE,
    TALK_WHO,
    classify_local,
    identity_sql,
    planner_down_local,
    talk_text,
)


def test_greetings_are_talk():
    assert classify_local("hi") == "greet"
    assert classify_local("hello") == "greet"
    assert classify_local("namaste") == "greet"
    assert classify_local("Hi, ap kon h?") == "who"
    assert classify_local("ap kaun ho") == "who"
    assert classify_local("kya kar sakte ho") == "who"


def test_talk_copy():
    assert "help" in talk_text("greet").lower()
    assert "DukanSaathi" in talk_text("who")
    assert talk_text("greet") == TALK_GREET
    assert talk_text("who") == TALK_WHO
    assert "shopkeeper" in talk_text("owner_role").lower()
    assert talk_text("owner_role") == TALK_OWNER_ROLE


def test_ledger_questions_are_not_talk():
    assert classify_local("aaj ki kamai") is None
    assert classify_local("Meena ka last bill") is None


def test_owner_vs_shop_name():
    assert classify_local("mera naam kia he") == "owner_name"
    assert classify_local("to owner ka kya naam he fir?") == "owner_name"
    assert classify_local("me kon") == "owner_name"
    assert classify_local("main kaun hoon") == "owner_name"
    assert classify_local("who am i") == "owner_name"
    assert classify_local("mere shop ka kya naam he") == "shop_name"
    assert classify_local("dukaan ka naam") == "shop_name"
    assert identity_sql("owner_name") == "SELECT owner_name FROM shops"
    assert identity_sql("shop_name") == "SELECT name FROM shops"


def test_owner_role_is_not_bot_intro():
    assert classify_local("mera kya kaam he") == "owner_role"
    assert classify_local("are mera kya kaam he?") == "owner_role"
    assert classify_local("mera kaam kya hai") == "owner_role"
    assert classify_local("ap kon") == "who"
    assert "malik" in talk_text("owner_role").lower() or "shopkeeper" in talk_text("owner_role").lower()
    assert "analyst AI chatbot" not in talk_text("owner_role")


def test_product_count_vs_list():
    assert classify_local("stock me kitne products he?") == "product_count"
    assert classify_local("mujhe products ki list do") == "product_list"
    assert classify_local("stock kitna he") == "product_list"
    assert classify_local("stock list dikhao") == "product_list"
    assert classify_local("kitna stock hai") == "product_list"
    assert classify_local("stock dikhao") == "product_list"
    assert classify_local("Pearl White ka stock kitna") is None
    assert classify_local("konse konse") is None
    assert classify_local("konse konse", ["stock me kitne products he"]) == "product_list"
    assert identity_sql("product_count") == "SELECT COUNT(*) AS products FROM products"
    assert "stock_qty" in (identity_sql("product_list") or "")


def test_alert_vs_least_stock():
    assert classify_local("inme se kiska stock kam he") == "product_alert"
    assert classify_local("mene poocha 9 products mese konsa low stock he") == "product_alert"
    assert classify_local("sabse kam stock") == "product_least"
    alert = identity_sql("product_alert") or ""
    assert "low_stock_threshold" in alert
    assert "<=" in alert
    least = identity_sql("product_least") or ""
    assert "ORDER BY stock_qty ASC" in least
    assert "low_stock_threshold" not in least
    assert classify_local("aaj ki kamai") is None


def test_planner_down_local_stock_and_profit():
    kind, sql = planner_down_local("stock kitna he")
    assert kind == "product_list"
    assert sql and "FROM products" in sql
    kind, sql = planner_down_local("is mahine ka profit kitna")
    assert kind == "no_profit"
    assert sql is None
    kind, sql = planner_down_local("aaj ki kamai")
    assert kind is None
    assert sql is None
