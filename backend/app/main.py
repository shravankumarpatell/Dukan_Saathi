from typing import Optional, List, Dict
"""FastAPI application — main entry point.

Registers all routers, middleware, and error handlers.
"""

from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_firebase
from app.common.errors import AppError, app_error_handler, unhandled_error_handler
import logging

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL, logging.INFO),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def create_app() -> FastAPI:
    """Application factory — creates and configures the FastAPI app."""

    app = FastAPI(
        title="DukanSaathi API",
        description="Backend API for DukanSaathi — voice-first stock & billing assistant for Indian retail",
        version="1.0.0",
    )

    # ── Initialize Firebase ──
    init_firebase()

    # ── CORS ──
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
    )

    # ── Error handlers ──
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(Exception, unhandled_error_handler)

    # ── Register routers ──
    from app.shops.router import router as shops_router
    from app.products.router import router as products_router
    from app.invoices.router import router as invoices_router
    from app.customers.router import router as customers_router
    from app.returns.router import router as returns_router
    from app.expenses.router import router as expenses_router
    from app.gemini.router import router as gemini_router
    from app.analytics.router import router as analytics_router
    from app.genai.router import router as new_genai_router

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

    # ── Health check ──
    @app.get("/api/health")
    async def health():
        return {"status": "ok", "service": "DukanSaathi API"}

    logger.info("DukanSaathi API initialized with %d routers", 9)
    return app


app = create_app()
