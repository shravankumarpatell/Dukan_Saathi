"""Gemini proxy routes — Vertex AI + ADC. Prompts and schemas live in genai/."""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.dependencies import get_current_user, AuthenticatedUser
from app.db import get_session
from app.gemini.client import ensure_configured
from app.genai.schemas import ChatRequest, NluRequest, ExtractRequest
from app.genai.services import ExtractionService, NluService
from app.common.errors import ValidationError
from app.genai.exceptions import ApplicationError
from app.persist import shop_uuid
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


def _ensure_gemini():
    ensure_configured()


def _dialect_from_session(session: AsyncSession) -> str:
    bind = session.get_bind()
    name = bind.dialect.name if bind is not None else "sqlite"
    return "postgres" if name == "postgresql" else "sqlite"


@router.post("/chat")
async def chat_stream(
    body: ChatRequest,
    user: AuthenticatedUser = Depends(get_current_user),
    session: AsyncSession = Depends(get_session),
):
    """Stream a shop-analyst answer. Returns Server-Sent Events."""
    from app.analyst.service import GeminiAnalystLLM, stream_analyst_answer

    _ensure_gemini()
    shop_id = shop_uuid(user.uid)
    user_msgs = [m.content for m in body.messages if m.role == "user" and (m.content or "").strip()]
    last_user = user_msgs[-1] if user_msgs else ""
    prior = user_msgs[:-1][-6:]
    dialect = _dialect_from_session(session)

    async def event_stream():
        try:
            async for payload in stream_analyst_answer(
                shop_id=shop_id,
                question=last_user,
                session=session,
                llm=GeminiAnalystLLM(),
                dialect=dialect,
                prior_questions=prior,
            ):
                yield f"data: {json.dumps(payload)}\n\n"
        except ValidationError as exc:
            yield f"data: {json.dumps({'error': exc.message})}\n\n"
        except Exception:
            logger.exception("Analyst chat stream failed")
            yield f"data: {json.dumps({'error': 'Gemini API error'})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")


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
    except Exception:
        logger.exception("Gemini NLU error")
        return {"intent": "unknown", "language": "en", "entities": {}, "error": "Gemini unavailable"}


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
    except json.JSONDecodeError:
        return {"rows": [], "error": "Failed to parse extraction"}
    except ApplicationError:
        logger.exception("Gemini vision error")
        return {"rows": [], "error": "Gemini unavailable"}
    except Exception:
        logger.exception("Gemini vision error")
        return {"rows": [], "error": "Gemini unavailable"}
