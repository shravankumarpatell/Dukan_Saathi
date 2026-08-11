"""Structured error handling for the application."""

from fastapi import HTTPException, status
from fastapi.responses import JSONResponse
from fastapi import Request
import logging

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base application error with status code and user-safe message."""

    def __init__(self, message: str, status_code: int = 400, detail: str | None = None):
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

    def __init__(self, product_name: str):
        super().__init__(
            f"Insufficient stock for: {product_name}",
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        )


class BusinessRuleError(AppError):
    """A business rule was violated (422)."""

    def __init__(self, message: str):
        super().__init__(message, status_code=status.HTTP_422_UNPROCESSABLE_ENTITY)


async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    """Global handler for AppError — returns structured JSON."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "type": type(exc).__name__},
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch-all for unexpected errors — never leak internals."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "An unexpected error occurred", "type": "InternalError"},
    )
