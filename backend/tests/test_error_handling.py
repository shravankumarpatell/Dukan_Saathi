"""Global error handling: a request error never takes the server down."""

from __future__ import annotations

import asyncio
import logging

import pytest
from sqlalchemy import exc as sa_exc

from app.common.errors import classify_exception
from app.common.logging import redact
from tests.conftest import auth_header
from tests.test_routers_transactions import _create_shop


def _install_probe_routes(app):
    @app.get("/api/_probe/boom")
    async def _boom():
        raise RuntimeError("kaboom secret=abc123")

    @app.get("/api/_probe/pool")
    async def _pool():
        raise sa_exc.TimeoutError("QueuePool limit of size 2 overflow 1 reached, connection timed out")

    @app.get("/api/_probe/slow")
    async def _slow():
        raise asyncio.TimeoutError()

    @app.get("/api/_probe/db-down")
    async def _db_down():
        raise sa_exc.OperationalError("SELECT 1", {}, Exception("connection refused"))


@pytest.fixture
def probe_client(client):
    _install_probe_routes(client.app)
    return client


def test_unhandled_exception_returns_json_500_and_server_survives(probe_client):
    res = probe_client.get("/api/_probe/boom")
    assert res.status_code == 500
    body = res.json()
    assert body["type"] == "InternalError"
    assert body["requestId"]
    assert "kaboom" not in body["error"]  # never leak internals
    assert res.headers.get("x-request-id") == body["requestId"]

    # Next request on the same process still works.
    ok = probe_client.get("/api/health")
    assert ok.status_code == 200
    assert ok.json()["status"] == "ok"


def test_request_id_is_propagated_from_client(probe_client):
    res = probe_client.get("/api/_probe/boom", headers={"X-Request-ID": "abc-123"})
    assert res.headers.get("x-request-id") == "abc-123"
    assert res.json()["requestId"] == "abc-123"


def test_pool_exhaustion_is_503_retry_later(probe_client):
    res = probe_client.get("/api/_probe/pool")
    assert res.status_code == 503
    assert res.json()["type"] == "DatabaseUnavailable"


def test_db_connection_refused_is_503(probe_client):
    res = probe_client.get("/api/_probe/db-down")
    assert res.status_code == 503


def test_upstream_timeout_is_504(probe_client):
    res = probe_client.get("/api/_probe/slow")
    assert res.status_code == 504
    assert res.json()["type"] == "UpstreamTimeout"


def test_validation_error_has_readable_message(client):
    headers, _uid = auth_header()
    _create_shop(client, headers)
    res = client.post("/api/expenses", json={"amount": -5}, headers=headers)
    assert res.status_code == 422
    body = res.json()
    assert body["type"] == "ValidationError"
    assert "amount" in body["error"]
    assert body["requestId"]


def test_http_exception_keeps_detail_and_adds_error(client):
    res = client.get("/api/expenses")  # no token
    assert res.status_code == 401
    body = res.json()
    assert body["detail"] == "Invalid or expired authentication token" or "Missing" in body["detail"]
    assert body["error"] == body["detail"]
    assert body["requestId"]


def test_health_deep_reports_database(client):
    res = client.get("/api/health?deep=1")
    assert res.status_code == 200
    body = res.json()
    assert body["database"]["ok"] is True


def test_chat_stream_emits_error_event_instead_of_dropping(client, monkeypatch):
    headers, _uid = auth_header()
    _create_shop(client, headers)

    async def exploding_stream(**kwargs):
        yield {"text": "Soch "}
        raise RuntimeError("planner died")

    monkeypatch.setattr("app.gemini.router.ensure_configured", lambda: None)
    monkeypatch.setattr("app.analyst.service.stream_analyst_answer", exploding_stream)

    res = client.post(
        "/api/ai/chat",
        json={"messages": [{"role": "user", "content": "aaj ki kamai"}]},
        headers=headers,
    )
    assert res.status_code == 200
    events = [line for line in res.text.split("\n") if line.startswith("data:")]
    assert any('"text"' in e for e in events)
    last = events[-1]
    assert '"error"' in last and '"requestId"' in last
    assert "planner died" not in last


def test_chat_stream_times_out_cleanly(client, monkeypatch):
    headers, _uid = auth_header()
    _create_shop(client, headers)

    async def hanging_stream(**kwargs):
        await asyncio.sleep(5)
        yield {"text": "never"}

    monkeypatch.setattr("app.gemini.router.ensure_configured", lambda: None)
    monkeypatch.setattr("app.analyst.service.stream_analyst_answer", hanging_stream)
    monkeypatch.setattr("app.gemini.router.settings.CHAT_TIMEOUT_S", 0.2)

    res = client.post(
        "/api/ai/chat",
        json={"messages": [{"role": "user", "content": "aaj ki kamai"}]},
        headers=headers,
    )
    assert res.status_code == 200
    assert '"UpstreamTimeout"' in res.text


def test_extract_stock_rejects_bad_file_with_400(client, monkeypatch):
    headers, _uid = auth_header()
    _create_shop(client, headers)
    monkeypatch.setattr("app.gemini.router.ensure_configured", lambda: None)
    res = client.post(
        "/api/ai/extract-stock",
        json={"base64": "", "mimeType": "image/png"},
        headers=headers,
    )
    assert res.status_code == 400
    assert "dobara" in res.json()["error"]


def test_extract_stock_gemini_failure_is_503_not_500(client, monkeypatch):
    from app.genai.exceptions import FallbackError

    headers, _uid = auth_header()
    _create_shop(client, headers)
    monkeypatch.setattr("app.gemini.router.ensure_configured", lambda: None)

    async def failing(*args, **kwargs):
        raise FallbackError("Gemini extract failed: 429 quota")

    monkeypatch.setattr("app.gemini.router.ExtractionService.extract_stock", failing)
    res = client.post(
        "/api/ai/extract-stock",
        json={"base64": "AAAA", "mimeType": "image/png"},
        headers=headers,
    )
    assert res.status_code == 503
    assert res.json()["requestId"]


def test_auth_service_unreachable_is_503_not_401(client, monkeypatch):
    from app.dependencies import AuthUnavailable

    def unreachable(token):
        raise AuthUnavailable("JWKS fetch failed")

    monkeypatch.setattr("app.dependencies.decode_supabase_token", unreachable)
    headers, _uid = auth_header()
    res = client.get("/api/expenses", headers=headers)
    assert res.status_code == 503
    assert res.json()["type"] == "ServiceUnavailableError"


# ── classification + redaction units ─────────────────────────────────────────

def test_classify_gemini_429_is_rate_limited():
    class FakeGeminiError(Exception):
        code = 429

    FakeGeminiError.__module__ = "google.genai.errors"
    status, _msg, name = classify_exception(FakeGeminiError("quota"))
    assert status == 503
    assert name == "AIRateLimited"


def _redact_cases():
    """Build lookalike secrets at runtime so the file never contains scanner bait."""
    jwt = ".".join(("eyJ" + "hbGciOiJIUzI1NiJ9", "eyJ" + "zdWIiOiIxIn0", "abcDEF"))
    sb = "sb_" + "secret_" + ("x" * 32)
    gcp = "AQ" + "." + ("z" * 40)
    return [
        (f"Authorization: Bearer {jwt}", "eyJhbGciOiJIUzI1NiJ9"),
        (
            "postgresql+psycopg://postgres.abc:SuperSecret123@aws-0.pooler.supabase.com:6543/postgres",
            "SuperSecret123",
        ),
        (f"key {sb} leaked", "x" * 16),
        (f"GEMINI_API_KEY={gcp}", "z" * 16),
        ("password=hunter2 user=bob", "hunter2"),
    ]


@pytest.mark.parametrize("raw, must_not_contain", _redact_cases())
def test_redact_scrubs_secrets(raw, must_not_contain):
    out = redact(raw)
    assert must_not_contain not in out
    assert "REDACTED" in out or "***" in out


def test_logging_filter_redacts_records(caplog):
    from app.common.logging import RedactingFilter

    log = logging.getLogger("redact.test")
    log.addFilter(RedactingFilter())
    with caplog.at_level(logging.INFO, logger="redact.test"):
        log.info("token=%s", ".".join(("eyJ" + "hbGciOiJIUzI1NiJ9", "eyJ" + "zdWIiOiIxIn0", "abcDEF")))
    assert "eyJhbGciOiJIUzI1NiJ9" not in caplog.text
    assert "REDACTED" in caplog.text
