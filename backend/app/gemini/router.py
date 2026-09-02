"""Gemini proxy routes — Vertex AI + ADC. Prompts and schemas live in genai/."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from app.common.errors import UPSTREAM_TIMEOUT, AppError, ValidationError, classify_exception
from app.common.logging import request_id_var
from app.config import settings
from app.db import sql_dialect
from app.dependencies import AuthenticatedUser, get_current_user
from app.gemini.client import ensure_configured
from app.genai.exceptions import ApplicationError
from app.genai.schemas import ChatRequest, ExtractRequest, NluRequest
from app.genai.services import ExtractionService, NluService
from app.persist import shop_uuid

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


def _ensure_gemini():
    ensure_configured()


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


@router.post("/chat")
async def chat_stream(
    body: ChatRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Stream a shop-analyst answer. Returns Server-Sent Events.

    * No request-scoped DB session: Gemini waits used to leave Postgres
      *idle in transaction* (cache SELECT, then the model) and exhaust the pool.
    * Exceptions raised inside a streaming generator bypass FastAPI's exception
      handlers, so the generator catches everything itself and emits a final
      ``{"error": ..., "requestId": ...}`` event instead of dropping the
      connection mid-stream.
    * The whole answer is bounded by ``CHAT_TIMEOUT_S``.
    """
    from app.analyst.service import GeminiAnalystLLM, stream_analyst_answer

    _ensure_gemini()
    shop_id = shop_uuid(user.uid)
    user_msgs = [m.content for m in body.messages if m.role == "user" and (m.content or "").strip()]
    last_user = user_msgs[-1] if user_msgs else ""
    prior = user_msgs[:-1][-6:]
    dialect = sql_dialect()
    request_id = request_id_var.get()

    async def event_stream():
        deadline = asyncio.get_running_loop().time() + float(settings.CHAT_TIMEOUT_S)
        try:
            it = stream_analyst_answer(
                shop_id=shop_id,
                question=last_user,
                llm=GeminiAnalystLLM(),
                dialect=dialect,
                prior_questions=prior,
            ).__aiter__()
            while True:
                remaining = deadline - asyncio.get_running_loop().time()
                if remaining <= 0:
                    raise asyncio.TimeoutError()
                try:
                    payload = await asyncio.wait_for(it.__anext__(), timeout=remaining)
                except StopAsyncIteration:
                    break
                yield _sse(payload)
        except asyncio.TimeoutError:
            logger.error("Analyst chat timed out after %.0fs", settings.CHAT_TIMEOUT_S)
            yield _sse({"error": UPSTREAM_TIMEOUT, "type": "UpstreamTimeout", "requestId": request_id})
        except ValidationError as exc:
            yield _sse({"error": exc.message, "type": "ValidationError", "requestId": request_id})
        except Exception as exc:
            status_code, message, type_name = classify_exception(exc)
            logger.error(
                "Analyst chat stream failed -> %s %s (%s: %s)",
                status_code,
                type_name,
                type(exc).__name__,
                str(exc)[:300],
                exc_info=exc,
            )
            yield _sse({"error": message, "type": type_name, "requestId": request_id})

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/parse-command")
async def parse_command(
    body: NluRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Parse a voice command into a structured JSON intent."""
    _ensure_gemini()
    try:
        result = await NluService.parse_command(body.transcript)
        return result.model_dump()
    except Exception as exc:
        # Soft-fail by contract: the caller falls back to manual entry.
        _status, message, type_name = classify_exception(exc)
        logger.error("Gemini NLU error (%s: %s)", type(exc).__name__, str(exc)[:300], exc_info=exc)
        return {"intent": "unknown", "language": "en", "entities": {}, "error": message, "type": type_name}


@router.post("/extract-stock")
async def extract_stock_sheet(
    body: ExtractRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Extract product line items from a supplier stock sheet image."""
    _ensure_gemini()
    try:
        result = await ExtractionService.extract_stock(body.resolved_base64(), body.resolved_mime())
        return {"rows": [r.model_dump() for r in result.rows]}
    except AppError:
        # Bad/empty file (400) or Gemini timeout (504) → AppError handler.
        raise
    except json.JSONDecodeError as exc:
        logger.error("Gemini returned invalid JSON for stock sheet", exc_info=exc)
        raise HTTPException(
            status_code=503,
            detail="AI ne sheet sahi se padh nahi paayi. Saaf photo ke saath dobara try karein.",
        )
    except ApplicationError as exc:
        # LLMError / FallbackError from app.genai — both models failed.
        logger.error("Gemini vision error: %s %s", exc.message, exc.details, exc_info=exc)
        raise HTTPException(
            status_code=503,
            detail=(exc.message or "AI abhi available nahi hai. Thodi der baad try karein.")[:300],
        )
    except Exception as exc:
        status_code, message, type_name = classify_exception(exc)
        logger.error(
            "Gemini vision error -> %s %s (%s: %s)",
            status_code,
            type_name,
            type(exc).__name__,
            str(exc)[:300],
            exc_info=exc,
        )
        raise HTTPException(status_code=status_code if status_code >= 500 else 503, detail=message)
