"""Request-scoped logging: request id in every line, secrets scrubbed.

Wire once from ``app.main`` via :func:`configure_logging`. Anything logged
through the stdlib ``logging`` module — including uvicorn and SQLAlchemy —
passes through :class:`RedactingFilter`, so tokens / API keys / DB passwords
never reach the terminal even when a library formats them into a message.
"""

from __future__ import annotations

import contextvars
import logging
import re
import sys
import uuid

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

# Order matters: longer / more specific patterns first.
_SECRET_PATTERNS: tuple[tuple[re.Pattern[str], str], ...] = (
    # Authorization: Bearer <jwt>
    (re.compile(r"(?i)(bearer\s+)[a-z0-9\-_\.=]+"), r"\1[REDACTED]"),
    # Raw JWTs (three base64url segments)
    (re.compile(r"\beyJ[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+\.[a-zA-Z0-9\-_]+"), "[REDACTED_JWT]"),
    # Supabase keys and Google AI Studio keys
    (re.compile(r"\bsb_(?:secret|publishable)_[A-Za-z0-9\-_]+"), "sb_[REDACTED]"),
    (re.compile(r"\bAIza[0-9A-Za-z\-_]{20,}"), "[REDACTED_API_KEY]"),
    (re.compile(r"\bAQ\.[A-Za-z0-9\-_]{20,}"), "[REDACTED_API_KEY]"),
    # postgres://user:password@host  →  postgres://user:***@host
    (re.compile(r"(?i)((?:postgres(?:ql)?(?:\+\w+)?|mysql|redis)://[^:/\s]+:)([^@\s]+)@"), r"\1***@"),
    # key=value style: password=…, secret=…, api_key=…, token=…
    (
        re.compile(r"(?i)\b(password|passwd|pwd|secret|api[_-]?key|access[_-]?token|refresh[_-]?token|token)\b(\s*[=:]\s*)([^\s,;&\"']+)"),
        r"\1\2[REDACTED]",
    ),
)


def redact(text: str) -> str:
    """Scrub secrets from a string. Safe on non-strings (returns as-is)."""
    if not isinstance(text, str) or not text:
        return text
    out = text
    for pattern, repl in _SECRET_PATTERNS:
        out = pattern.sub(repl, out)
    return out


class RedactingFilter(logging.Filter):
    """Adds ``request_id`` to every record and scrubs secrets from the message."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        try:
            msg = record.getMessage()
        except Exception:
            msg = str(record.msg)
        scrubbed = redact(msg)
        if scrubbed != msg:
            record.msg = scrubbed
            record.args = ()
        if record.exc_text:
            record.exc_text = redact(record.exc_text)
        return True


class RedactingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        if not hasattr(record, "request_id"):
            record.request_id = request_id_var.get()
        return redact(super().format(record))

    def formatException(self, ei) -> str:  # noqa: N802 (stdlib name)
        return redact(super().formatException(ei))


LOG_FORMAT = "%(asctime)s %(levelname)-7s [%(request_id)s] %(name)s: %(message)s"


def configure_logging(level: str = "INFO") -> None:
    """Root logging with timestamp + request id + redaction. Idempotent."""
    root = logging.getLogger()
    lvl = getattr(logging, (level or "INFO").upper(), logging.INFO)
    root.setLevel(lvl)

    handler = None
    for h in root.handlers:
        if getattr(h, "_ds_handler", False):
            handler = h
            break
    if handler is None:
        handler = logging.StreamHandler(sys.stderr)
        handler._ds_handler = True  # type: ignore[attr-defined]
        root.addHandler(handler)
    handler.setFormatter(RedactingFormatter(LOG_FORMAT))

    # Filters must sit on *handlers*: a logger-level filter only sees records
    # created on that logger, not records propagated from children.
    flt = RedactingFilter()
    if not any(isinstance(f, RedactingFilter) for f in handler.filters):
        handler.addFilter(flt)
    # Uvicorn installs its own handlers; route them through our filter too.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        for h in logging.getLogger(name).handlers:
            if not any(isinstance(f, RedactingFilter) for f in h.filters):
                h.addFilter(flt)
    # SQLAlchemy pool GC warnings are noisy but useful; keep at WARNING.
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)


def new_request_id() -> str:
    return uuid.uuid4().hex[:12]
