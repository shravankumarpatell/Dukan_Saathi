from typing import Optional, List, Dict
"""Gemini proxy routes — keeps the API key server-side.

The frontend never touches the Gemini API directly. All AI requests
are proxied through these endpoints.
"""

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from app.dependencies import get_current_user, AuthenticatedUser
from app.config import settings
from app.common.errors import ValidationError
import httpx
import json
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/ai", tags=["ai"])

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


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
    mimeType: str = Field(..., min_length=1)


def _ensure_gemini():
    if not settings.GEMINI_API_KEY:
        raise ValidationError("Gemini API key not configured on the server")


@router.post("/chat")
async def chat_stream(
    body: ChatRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Stream a chat response from Gemini. Returns Server-Sent Events."""
    _ensure_gemini()

    url = f"{GEMINI_BASE}/{settings.GEMINI_MODEL}:streamGenerateContent?alt=sse&key={settings.GEMINI_API_KEY}"

    contents = []
    for msg in body.messages:
        role = "model" if msg.role == "assistant" else "user"
        contents.append({"role": role, "parts": [{"text": msg.content}]})

    payload = {"contents": contents}
    if body.systemContext:
        payload["systemInstruction"] = {"parts": [{"text": body.systemContext}]}

    async def event_stream():
        async with httpx.AsyncClient(timeout=60.0) as client:
            async with client.stream("POST", url, json=payload, headers={"Content-Type": "application/json"}) as resp:
                if resp.status_code != 200:
                    error_body = await resp.aread()
                    logger.error("Gemini error %d: %s", resp.status_code, error_body[:500])
                    yield f"data: {json.dumps({'error': 'Gemini API error'})}\n\n"
                    return

                async for line in resp.aiter_lines():
                    line = line.strip()
                    if line.startswith("data:"):
                        try:
                            j = json.loads(line[5:])
                            text = ""
                            candidates = j.get("candidates", [])
                            if candidates:
                                parts = candidates[0].get("content", {}).get("parts", [])
                                text = "".join(p.get("text", "") for p in parts)
                            if text:
                                yield f"data: {json.dumps({'text': text})}\n\n"
                        except json.JSONDecodeError:
                            pass

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/parse-command")
async def parse_command(
    body: NluRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Parse a voice command into a structured JSON intent using Gemini."""
    _ensure_gemini()

    system_instruction = """You are DukanSaathi, a voice assistant for an Indian tiles & sanitaryware shop.
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

    url = f"{GEMINI_BASE}/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
    payload = {
        "contents": [{"role": "user", "parts": [{"text": system_instruction + "\n\nCommand: " + body.transcript}]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1},
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, json=payload, headers={"Content-Type": "application/json"})
        if resp.status_code != 200:
            logger.error("Gemini NLU error: %d", resp.status_code)
            return {"intent": "unknown", "language": "en", "entities": {}, "error": "Gemini unavailable"}

        data = resp.json()
        text = ""
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts)

        try:
            cleaned = text.replace("```json", "").replace("```", "").strip()
            return json.loads(cleaned)
        except json.JSONDecodeError:
            return {"intent": "unknown", "language": "en", "entities": {}, "raw": text}


@router.post("/extract-stock")
async def extract_stock_sheet(
    body: StockExtractRequest,
    user: AuthenticatedUser = Depends(get_current_user),
):
    """Extract product line items from a supplier stock sheet image using Gemini vision."""
    _ensure_gemini()

    prompt = """Extract every product line from this supplier stock sheet image as a JSON array.
Each object: { "name": string, "code": string, "company": string, "size": string, "qty": number, "price": number, "lowConfidence": boolean }.
Set lowConfidence=true if the row is blurry/handwritten/uncertain. Return ONLY the JSON array."""

    url = f"{GEMINI_BASE}/{settings.GEMINI_MODEL}:generateContent?key={settings.GEMINI_API_KEY}"
    payload = {
        "contents": [{"role": "user", "parts": [
            {"text": prompt},
            {"inline_data": {"mime_type": body.mimeType, "data": body.base64}},
        ]}],
        "generationConfig": {"responseMimeType": "application/json", "temperature": 0.1},
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(url, json=payload, headers={"Content-Type": "application/json"})
        if resp.status_code != 200:
            logger.error("Gemini vision error: %d", resp.status_code)
            return {"rows": [], "error": "Gemini unavailable"}

        data = resp.json()
        text = ""
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            text = "".join(p.get("text", "") for p in parts)

        try:
            cleaned = text.replace("```json", "").replace("```", "").strip()
            rows = json.loads(cleaned)
            return {"rows": rows if isinstance(rows, list) else []}
        except json.JSONDecodeError:
            return {"rows": [], "error": "Failed to parse extraction"}
