"""Structured error handling for the application.

Every error that reaches the client has the same JSON shape::

    {"error": "<user-safe message>", "type": "<ErrorClass>", "requestId": "<id>"}

The frontend reads ``error`` (falls back to FastAPI's ``detail``) and shows
``requestId`` so a shopkeeper can quote it when reporting a problem.

Classification (``classify_exception``) turns infrastructure failures into
honest, retryable statuses instead of a blanket 500:

* DB pool exhausted / connection refused / pooler limit  → 503
* Upstream (Gemini / network) timeout                    → 504
* Anything else unexpected                               → 500

The server process itself never dies because of a request error — the
exception is logged with a stack trace and the request gets a response.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Optional

from fastapi import HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.common.logging import request_id_var

logger = logging.getLogger(__name__)

RETRY_LATER = "Server abhi busy hai. Thodi der baad dobara try karein."
UPSTREAM_TIMEOUT = "Jawab aane mein bahut der lagi. Dobara try karein."
INTERNAL = "Server mein kuch gadbad ho gayi. Thodi der baad dobara try karein."


class AppError(Exception):
    """Base application error with status code and user-safe message."""

    def __init__(self, message: str, status_code: int = 400, detail: Optional[str] = None):
        self.message = message
        self.status_code = status_code
        self.detail = detail or message
        super().__init__(message)


class ValidationError(AppError):
    """Input validation error (400)."""

    def __init__(self, message: str):
        super().__init__(message, status_code=status.HTTP_400_BAD_REQUEST)


class NotFoundError(AppError):
    """Resource not found (404)."""

    def __init__(self, resource: str, identifier: str = ""):
        msg = f"{resource} not found" + (f": {identifier}" if identifier else "")
        super().__init__(msg, status_code=status.HTTP_404_NOT_FOUND)


class ConflictError(AppError):
    """Conflict / duplicate (409)."""

    def __init__(self, message: str):
        super().__init__(message, status_code=status.HTTP_409_CONFLICT)


class InsufficientStockError(AppError):
    """Stock is insufficient for the requested operation (422)."""

    def __init__(self, product_name: str, available: int = None, requested: int = None, avail_label: str = None, req_label: str = None):
        if available is not None and requested is not None:
            a = avail_label if avail_label is not None else str(available)
            r = req_label if req_label is not None else str(requested)
            msg = f"Stock kam hai: {product_name} (available {a}, maanga {r})"
        else:
            msg = f"Insufficient stock for: {product_name}"
        super().__init__(msg, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)


class BusinessRuleError(AppError):
    """A business rule was violated (422)."""

    def __init__(self, message: str):
        super().__init__(message, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)


class ServiceUnavailableError(AppError):
    """A dependency (DB, Gemini, auth) is down or overloaded — retry later (503)."""

    def __init__(self, message: str = RETRY_LATER):
        super().__init__(message, status_code=status.HTTP_503_SERVICE_UNAVAILABLE)


class UpstreamTimeoutError(AppError):
    """An upstream call (Gemini, DB) took too long (504)."""

    def __init__(self, message: str = UPSTREAM_TIMEOUT):
        super().__init__(message, status_code=status.HTTP_504_GATEWAY_TIMEOUT)


# ── classification ────────────────────────────────────────────────────────────

_DB_UNAVAILABLE_MARKERS = (
    "queuepool limit",
    "connection timed out",
    "could not connect",
    "connection refused",
    "server closed the connection",
    "max client connections",
    "emaxconnsession",
    "too many connections",
    "remaining connection slots",
    "ssl syscall error",
    "connection reset",
    "name or service not known",
    "getaddrinfo failed",
    "network is unreachable",
    "timeout expired",
)


def _is_sqlalchemy_error(exc: BaseException) -> bool:
    try:
        from sqlalchemy import exc as sa_exc
    except ImportError:  # pragma: no cover
        return False
    return isinstance(exc, (sa_exc.TimeoutError, sa_exc.OperationalError, sa_exc.InterfaceError, sa_exc.DBAPIError))


def _is_gemini_error(exc: BaseException) -> bool:
    mod = type(exc).__module__ or ""
    return mod.startswith("google.genai") or mod.startswith("google.api_core")


def classify_exception(exc: BaseException) -> tuple[int, str, str]:
    """Return ``(status_code, user_message, type_name)`` for a raw exception."""
    if isinstance(exc, AppError):
        return exc.status_code, exc.detail, type(exc).__name__

    if isinstance(exc, (asyncio.TimeoutError, TimeoutError)):
        return status.HTTP_504_GATEWAY_TIMEOUT, UPSTREAM_TIMEOUT, "UpstreamTimeout"

    if _is_sqlalchemy_error(exc):
        text = str(exc).lower()
        from sqlalchemy import exc as sa_exc

        if isinstance(exc, sa_exc.TimeoutError) or any(m in text for m in _DB_UNAVAILABLE_MARKERS):
            return status.HTTP_503_SERVICE_UNAVAILABLE, RETRY_LATER, "DatabaseUnavailable"
        # Other DB errors (constraint, syntax) are bugs / bad input — still 500,
        # but never the raw SQL text.
        return status.HTTP_500_INTERNAL_SERVER_ERROR, INTERNAL, "DatabaseError"

    if isinstance(exc, (ConnectionError, OSError)):
        return status.HTTP_503_SERVICE_UNAVAILABLE, RETRY_LATER, "NetworkError"

    if _is_gemini_error(exc):
        code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
        if code == 429:
            return status.HTTP_503_SERVICE_UNAVAILABLE, "AI abhi bahut busy hai. Ek minute baad try karein.", "AIRateLimited"
        return status.HTTP_503_SERVICE_UNAVAILABLE, "AI service abhi available nahi hai. Thodi der baad try karein.", "AIUnavailable"

    return status.HTTP_500_INTERNAL_SERVER_ERROR, INTERNAL, "InternalError"


def _payload(message: str, type_name: str, extra: Optional[dict] = None) -> dict:
    body = {"error": message, "type": type_name, "requestId": request_id_var.get()}
    if extra:
        body.update(extra)
    return body


# ── handlers ─────────────────────────────────────────────────────────────────

async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Global handler for AppError — returns structured JSON."""
    if exc.status_code >= 500:
        logger.error("%s %s -> %s %s: %s", request.method, request.url.path, exc.status_code, type(exc).__name__, exc.detail)
    return JSONResponse(status_code=exc.status_code, content=_payload(exc.detail, type(exc).__name__))


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Keep FastAPI's ``detail`` (frontend/back-compat) and add ``error`` + request id."""
    detail = exc.detail
    if isinstance(detail, dict):
        message = detail.get("error") or detail.get("detail") or detail.get("message") or INTERNAL
        extra = {"detail": detail}
    else:
        message = str(detail) if detail else INTERNAL
        extra = {"detail": message}
    if exc.status_code >= 500:
        logger.error("%s %s -> %s: %s", request.method, request.url.path, exc.status_code, message)
    return JSONResponse(
        status_code=exc.status_code,
        content=_payload(message, "HTTPError", extra),
        headers=getattr(exc, "headers", None),
    )


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """422 with a readable one-line summary; never echoes the whole body."""
    errors = exc.errors()
    parts = []
    for e in errors[:3]:
        loc = ".".join(str(p) for p in e.get("loc", []) if p not in ("body", "query", "path"))
        parts.append(f"{loc}: {e.get('msg')}" if loc else str(e.get("msg")))
    message = "Input sahi nahi hai — " + "; ".join(parts) if parts else "Input sahi nahi hai."
    safe_errors = [{"loc": e.get("loc"), "msg": e.get("msg"), "type": e.get("type")} for e in errors[:10]]
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=_payload(message, "ValidationError", {"detail": safe_errors}),
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all — classify, log with stack trace, never leak internals, never crash."""
    status_code, message, type_name = classify_exception(exc)
    logger.error(
        "%s %s -> %s %s (%s: %s)",
        request.method,
        request.url.path,
        status_code,
        type_name,
        type(exc).__name__,
        str(exc)[:500],
        exc_info=exc,
    )
    return JSONResponse(status_code=status_code, content=_payload(message, type_name))
