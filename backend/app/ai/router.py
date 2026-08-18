"""AI proxy routes — OpenRouter (Nemotron VL). Key stays on the server."""

from typing import List

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from app.dependencies import get_current_user, AuthenticatedUser
from app.common.errors import ValidationError
from app.common.tile_sizes import normalize_tile_size, TILE_SIZE_PROMPT
from app.ai import openrouter
import httpx
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|assistant)$")
    content: str


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1)
    systemContext: str = ""


class NluRequest(BaseModel):
    transcript: str = Field(..., min_length=1)


class StockExtractRequest(BaseModel):
    base64: str = Field(..., min_length=1)
    mimeType: str = ""


@router.post("/chat")
async def chat_stream(
    body: ChatRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Stream a chat response. Returns Server-Sent Events `{text}` chunks."""
    openrouter.ensure_configured()

    messages = []
    if body.systemContext:
        messages.append({"role": "system", "content": body.systemContext})
    for msg in body.messages:
        messages.append({"role": msg.role, "content": msg.content})

    async def event_stream():
        try:
            async for text in openrouter.stream_chat(messages):
                yield f"data: {json.dumps({'text': text})}\n\n"
        except ValidationError as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        except httpx.HTTPError:
            yield f"data: {json.dumps({'error': 'AI service error'})}\n\n"
        except Exception:
            logger.exception("Chat stream failed")
            yield f"data: {json.dumps({'error': 'AI service error'})}\n\n"

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
    openrouter.ensure_configured()

    system = """You are DukanSaathi, a voice assistant for an Indian tiles & sanitaryware shop.
The owner speaks Hindi, English, or a mix. Convert the command into a single JSON object ONLY (no markdown).
Schema:
{
  "intent": "sale|purchase|return|payment|stock_query|udhari_query|buyers_query|topseller_query|unknown",
  "language": "hi|en",
  "entities": {
    "product": "string or null",
    "qty": number or null,
    "customer": "string or null",
    "amount": number or null,
    "mode": "cash|online|pending or null"
  }
}
Never invent data. If unsure, use null. Return ONLY the JSON."""

    text = ""
    try:
        text = await openrouter.chat_complete(
            [
                {"role": "system", "content": system},
                {"role": "user", "content": "Command: " + body.transcript},
            ],
            temperature=0.1,
            max_tokens=512,
            timeout=30.0,
        )
        parsed = openrouter.parse_json_payload(text)
        if isinstance(parsed, dict):
            return parsed
        return {"intent": "unknown", "language": "en", "entities": {}, "raw": text}
    except httpx.HTTPError:
        logger.exception("NLU OpenRouter error")
        return {"intent": "unknown", "language": "en", "entities": {}, "error": "AI unavailable"}
    except json.JSONDecodeError:
        return {"intent": "unknown", "language": "en", "entities": {}, "raw": text}


@router.post("/extract-stock")
async def extract_stock_sheet(
    body: StockExtractRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Extract product line items from a supplier stock sheet image."""
    openrouter.ensure_configured()

    prompt = f"""Extract every product line from this tiles & sanitaryware supplier stock sheet as a JSON array.
Each object: {{
  "name": string,
  "code": string,
  "company": string,
  "size": string,
  "unit": "box" or "piece",
  "piecesPerBox": number,
  "qty": number,
  "lowConfidence": boolean
}}.
Rules:
- Tiles / flooring / wall tiles → unit="box". size MUST be one of: {TILE_SIZE_PROMPT}.
  Never write a bare 2x2 or 12x18 without ft/in. 2x2 / 600x600 → "2x2 ft". 12x18 / 300x450 → "12x18 in".
  If size is unreadable, use "".
  piecesPerBox = pcs in one box if known else 1. qty = number of boxes.
- Sanitary / fittings / basins / closets / taps → unit="piece", size="", piecesPerBox=1, qty = number of pieces.
- Never guess selling price. Set lowConfidence=true if blurry/uncertain.
Return ONLY the JSON array."""

    messages = [{"role": "user", "content": openrouter.vision_content_parts(prompt, body.base64, body.mimeType)}]

    text = ""
    try:
        text = await openrouter.chat_complete(
            messages,
            temperature=0.1,
            max_tokens=4096,
            timeout=90.0,
        )
        parsed = openrouter.parse_json_payload(text)
        rows = parsed
        if isinstance(parsed, dict):
            rows = next((parsed[k] for k in ("rows", "items", "products", "data") if isinstance(parsed.get(k), list)), parsed)
        if not isinstance(rows, list):
            logger.warning("Stock extract was not a JSON array: %s", (text or "")[:240])
            return {"rows": [], "error": "Failed to parse extraction"}
        for row in rows:
            if not isinstance(row, dict):
                continue
            unit = str(row.get("unit") or "").lower()
            if unit in ("piece", "pcs", "pc", "sanitary"):
                row["unit"] = "piece"
                row["piecesPerBox"] = 1
                row["size"] = ""
            else:
                row["unit"] = "box"
                mapped = normalize_tile_size(row.get("size"))
                row["size"] = mapped or ""
        return {"rows": [r for r in rows if isinstance(r, dict)]}
    except httpx.HTTPError:
        logger.exception("Stock extract OpenRouter error")
        return {"rows": [], "error": "AI unavailable"}
    except json.JSONDecodeError:
        logger.warning("Stock extract JSON parse failed: %s", (text or "")[:240])
        return {"rows": [], "error": "Failed to parse extraction"}
