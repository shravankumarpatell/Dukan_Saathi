"""Pure-ASGI request middleware: request id, access log, last-resort error JSON.

Written as raw ASGI (not ``BaseHTTPMiddleware``) so it works with
``StreamingResponse`` (SSE chat) and never buffers bodies.

Order of defence for an exception raised while handling a request:
1. ``AppError`` / ``HTTPException`` / validation errors → FastAPI handlers in
   ``app.common.errors`` (inside Starlette's ExceptionMiddleware).
2. Any other exception propagates out of ExceptionMiddleware to *this*
   middleware. It is classified (pool exhaustion → 503, timeout → 504,
   unknown → 500), logged with request id + stack trace, and — if no bytes
   have been sent yet — answered with the same JSON shape. It is not
   re-raised, so the worker keeps serving and uvicorn does not print a second
   traceback.
"""

from __future__ import annotations

import json
import logging
import time

from app.common.logging import new_request_id, request_id_var

logger = logging.getLogger("app.request")

REQUEST_ID_HEADER = b"x-request-id"


class RequestContextMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        incoming = None
        for k, v in scope.get("headers") or []:
            if k == REQUEST_ID_HEADER:
                incoming = v.decode("latin-1")[:64]
                break
        request_id = incoming or new_request_id()
        token = request_id_var.set(request_id)

        method = scope.get("method", "-")
        path = scope.get("path", "-")
        started = time.perf_counter()
        state = {"status": None, "response_started": False}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                state["status"] = message.get("status")
                state["response_started"] = True
                headers = list(message.get("headers") or [])
                headers.append((REQUEST_ID_HEADER, request_id.encode("latin-1")))
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as exc:
            # Starlette's ExceptionMiddleware (inside us) only handles HTTPException
            # and specific registered classes; generic exceptions surface here.
            from app.common.errors import classify_exception

            status_code, message, type_name = classify_exception(exc)
            elapsed_ms = (time.perf_counter() - started) * 1000
            logger.error(
                "UNHANDLED %s %s -> %s %s (%.0f ms) %s: %s",
                method,
                path,
                status_code,
                type_name,
                elapsed_ms,
                type(exc).__name__,
                str(exc)[:500],
                exc_info=exc,
            )
            if not state["response_started"]:
                body = json.dumps(
                    {"error": message, "type": type_name, "requestId": request_id}
                ).encode("utf-8")
                await send(
                    {
                        "type": "http.response.start",
                        "status": status_code,
                        "headers": [
                            (b"content-type", b"application/json"),
                            (b"content-length", str(len(body)).encode()),
                            (REQUEST_ID_HEADER, request_id.encode("latin-1")),
                        ],
                    }
                )
                await send({"type": "http.response.body", "body": body})
            # Do not re-raise: the response (or as much of it as possible) is
            # on the wire and the exception is logged. Re-raising only makes
            # uvicorn print a second traceback.
        else:
            elapsed_ms = (time.perf_counter() - started) * 1000
            status = state["status"] or 0
            if path.endswith("/health"):
                return
            level = logging.INFO if status < 500 else logging.ERROR
            logger.log(level, "%s %s -> %s (%.0f ms)", method, path, status, elapsed_ms)
        finally:
            request_id_var.reset(token)
