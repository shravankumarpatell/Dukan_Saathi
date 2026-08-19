"""Gemini proxy routes — Vertex AI + ADC. Prompts and schemas live in genai/."""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from app.dependencies import get_current_user, AuthenticatedUser
from app.config import settings
from app.common.errors import ValidationError
from app.gemini.client import ensure_configured, stream_content
from app.genai.schemas import ChatRequest, NluRequest, ExtractRequest
from app.genai.services import ExtractionService, NluService, ChatService
from app.genai.exceptions import ApplicationError
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


def _ensure_gemini():
    ensure_configured()


@router.post("/chat")
async def chat_stream(
    body: ChatRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Stream a chat response from Gemini. Returns Server-Sent Events."""
    _ensure_gemini()

    messages = [{"role": msg.role, "content": msg.content} for msg in body.messages]
    system_instruction = ChatService.system_prompt(body.systemContext)

    async def event_stream():
        try:
            async for text in stream_content(
                model=settings.GEMINI_MODEL,
                messages=messages,
                system_instruction=system_instruction,
                temperature=0.3,
            ):
                yield f"data: {json.dumps({'text': text})}\n\n"
        except ValidationError as exc:
            yield f"data: {json.dumps({'error': exc.message})}\n\n"
        except Exception:
            logger.exception("Gemini chat stream failed")
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
