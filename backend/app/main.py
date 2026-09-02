"""FastAPI application — main entry point.

Registers all routers, middleware, and error handlers.

Resilience model
----------------
* A request error is never fatal: exception handlers (``app.common.errors``)
  and ``RequestContextMiddleware`` turn it into a JSON response and log it
  with a request id + stack trace.
* Background task exceptions are logged by the event-loop exception handler
  instead of being swallowed or killing the loop.
* Startup does not require the database to be reachable (a cold Supabase
  pooler must not prevent the API from booting); ``/api/health?deep=1``
  reports live DB status for monitoring.
* Shutdown disposes the connection pool so the pooler frees our slots.
"""

from __future__ import annotations

import asyncio
import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from starlette.middleware.cors import CORSMiddleware

from app.common.errors import (
    AppError,
    app_error_handler,
    http_exception_handler,
    unhandled_error_handler,
    validation_error_handler,
)
from app.common.logging import configure_logging
from app.common.middleware import RequestContextMiddleware
from app.config import settings
from app.db import db_ping, init_db, reset_engine

configure_logging(settings.LOG_LEVEL)
logger = logging.getLogger(__name__)

# psycopg's async driver cannot run on Windows' default ProactorEventLoop
# ("Psycopg cannot use the 'ProactorEventLoop'"). uvicorn only switches to the
# selector loop when reload/workers are on, so `uvicorn app.main:app` without
# --reload would fail every DB call. Pin it here, before any loop is created.
if sys.platform == "win32":
    try:
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    except Exception:  # pragma: no cover - policy already fixed by the host
        pass


def _loop_exception_handler(loop: asyncio.AbstractEventLoop, context: dict) -> None:
    """Unhandled exception in a fire-and-forget task: log it, keep serving."""
    exc = context.get("exception")
    msg = context.get("message") or "unhandled asyncio exception"
    if exc is not None:
        logger.error("Background task failed: %s", msg, exc_info=exc)
    else:
        logger.error("Background task failed: %s", msg)


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    loop.set_exception_handler(_loop_exception_handler)

    await init_db()
    ok, detail = await db_ping(timeout_s=5.0)
    if ok:
        logger.info("Database reachable (%s)", detail)
    else:
        # Boot anyway: the pool reconnects on demand and /health?deep=1 exposes status.
        logger.error("Database NOT reachable at startup: %s — API will keep retrying per request", detail)
    logger.info("DukanSaathi API ready (model=%s)", settings.GEMINI_MODEL)
    try:
        yield
    finally:
        logger.info("Shutting down — disposing DB pool")
        try:
            await asyncio.wait_for(reset_engine(), timeout=10.0)
        except Exception as exc:  # never block shutdown
            logger.warning("Pool dispose during shutdown failed: %s", exc)


def create_app() -> FastAPI:
    """Application factory — creates and configures the FastAPI app."""

    app = FastAPI(
        title="DukanSaathi API",
        description="Backend API for DukanSaathi — stock, billing, and udhari for Indian retail",
        version="1.0.0",
        lifespan=lifespan,
    )

    # Outermost: request id + access log + last-resort 500 (pure ASGI, SSE-safe).
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[o.strip() for o in settings.CORS_ORIGINS if o.strip()],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID"],
    )

    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)

    from app.analytics.router import router as analytics_router
    from app.customers.router import router as customers_router
    from app.expenses.router import router as expenses_router
    from app.gemini.router import router as gemini_router
    from app.genai.router import router as new_genai_router
    from app.invoices.router import router as invoices_router
    from app.products.router import router as products_router
    from app.returns.router import router as returns_router
    from app.shops.router import router as shops_router

    api_prefix = "/api"
    app.include_router(shops_router, prefix=api_prefix)
    app.include_router(products_router, prefix=api_prefix)
    app.include_router(invoices_router, prefix=api_prefix)
    app.include_router(customers_router, prefix=api_prefix)
    app.include_router(returns_router, prefix=api_prefix)
    app.include_router(expenses_router, prefix=api_prefix)
    app.include_router(gemini_router, prefix=api_prefix)
    app.include_router(analytics_router, prefix=api_prefix)
    app.include_router(new_genai_router, prefix=api_prefix)

    @app.get("/api/health")
    async def health(deep: bool = False):
        body = {"status": "ok", "service": "DukanSaathi API"}
        if deep:
            ok, detail = await db_ping(timeout_s=5.0)
            body["database"] = {"ok": ok, "detail": detail}
            if not ok:
                body["status"] = "degraded"
        return body

    logger.info("DukanSaathi API initialized with %d routers", 9)
    return app


app = create_app()
