"""Uvicorn entry point for the DukanSaathi backend.

* ``RELOAD=1`` (default when not in production) enables auto-reload for local
  development. Reload spawns a second process — each holds its own DB pool —
  so it is off by default when ``APP_ENV=production``.
* Unhandled exceptions at import/startup are logged (with secrets scrubbed)
  and the process exits non-zero so systemd / docker restarts it. Request
  errors never reach this level — see ``app.main`` and ``app.common``.
"""

from __future__ import annotations

import logging
import os
import sys

import uvicorn


def _bool_env(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in ("1", "true", "yes", "on")


def _install_excepthook() -> None:
    from app.common.logging import configure_logging

    configure_logging(os.environ.get("LOG_LEVEL", "INFO"))
    log = logging.getLogger("server")

    def hook(exc_type, exc, tb):
        if issubclass(exc_type, KeyboardInterrupt):
            log.info("Interrupted — shutting down")
            return
        log.critical("Fatal error — process exiting", exc_info=(exc_type, exc, tb))

    sys.excepthook = hook


def _windows_event_loop() -> None:
    """psycopg async needs a selector loop; uvicorn only sets one when reload=True."""
    if sys.platform == "win32":
        import asyncio

        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())


if __name__ == "__main__":
    _windows_event_loop()
    _install_excepthook()
    production = os.environ.get("APP_ENV", "").lower() == "production"
    reload_enabled = _bool_env("RELOAD", default=not production)

    try:
        uvicorn.run(
            "app.main:app",
            host=os.environ.get("HOST", "0.0.0.0"),
            port=int(os.environ.get("PORT", "8000")),
            reload=reload_enabled,
            log_level=os.environ.get("LOG_LEVEL", "info").lower(),
            # Let in-flight requests (e.g. a streaming chat answer) finish.
            timeout_graceful_shutdown=15,
            # Do not restart the worker on an application exception.
            lifespan="on",
        )
    except KeyboardInterrupt:
        pass
    except Exception:
        logging.getLogger("server").critical("uvicorn failed to start", exc_info=True)
        sys.exit(1)
