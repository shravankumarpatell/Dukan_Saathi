"""OpenRouter OpenAI-compatible client (Nemotron VL for chat + vision)."""

import json
import logging
from typing import Any, AsyncIterator, Optional

import httpx

from app.config import settings
from app.common.errors import ValidationError

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"


def ensure_configured():
    if not (settings.OPENROUTER_API_KEY or "").strip():
        raise ValidationError("OpenRouter API key not configured on the server")


def model_id() -> str:
    return (settings.OPENROUTER_MODEL or "nvidia/nemotron-nano-12b-v2-vl:free").strip()


# Never pay: block provider failover onto billed endpoints of the same model.
_FREE_ONLY_PROVIDER = {
    "allow_fallbacks": False,
    "max_price": {
        "prompt": 0,
        "completion": 0,
        "request": 0,
        "image": 0,
    },
}


def request_payload(
    messages: list,
    *,
    temperature: float,
    max_tokens: int,
    stream: bool = False,
    extra: Optional[dict] = None,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "model": model_id(),
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "provider": dict(_FREE_ONLY_PROVIDER),
    }
    if stream:
        payload["stream"] = True
    if extra:
        payload.update(extra)
    payload["provider"] = dict(_FREE_ONLY_PROVIDER)
    # Keep the visible answer in `content`; do not bill extra for thinking tokens.
    payload["reasoning"] = {"enabled": False, "exclude": True}
    return payload


def request_headers() -> dict:
    return {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY.strip()}",
        "Content-Type": "application/json",
        "HTTP-Referer": settings.OPENROUTER_SITE_URL or "https://dukansaathi.app",
        "X-Title": settings.OPENROUTER_APP_NAME or "DukanSaathi",
    }


def _content_to_text(content) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for p in content:
            if isinstance(p, str):
                parts.append(p)
            elif isinstance(p, dict) and p.get("type") == "text":
                parts.append(p.get("text") or "")
        return "".join(parts)
    return ""


def _reasoning_to_text(value) -> str:
    if not value:
        return ""
    text = _content_to_text(value)
    if text:
        return text
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                parts.append(item.get("text") or item.get("content") or "")
        return "".join(parts)
    return ""


def _message_text(msg: dict) -> str:
    text = _content_to_text(msg.get("content"))
    if (text or "").strip():
        return text
    return (
        _reasoning_to_text(msg.get("reasoning"))
        or _reasoning_to_text(msg.get("reasoning_content"))
        or _reasoning_to_text(msg.get("reasoning_details"))
    )


def _extract_text(data: dict) -> str:
    choices = data.get("choices") or []
    if not choices:
        return ""
    choice = choices[0] or {}
    msg = choice.get("message") or {}
    text = _message_text(msg)
    if (text or "").strip():
        return text
    return _content_to_text((choice.get("delta") or {}).get("content"))


def parse_json_payload(text: str):
    cleaned = (text or "").replace("```json", "").replace("```", "").strip()
    if not cleaned:
        raise json.JSONDecodeError("empty", "", 0)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        start = cleaned.find("[")
        end = cleaned.rfind("]")
        if start != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end > start:
            return json.loads(cleaned[start : end + 1])
        raise


def vision_content_parts(prompt: str, image_base64: str, mime_type: str) -> list:
    """OpenAI-compatible multimodal user content (image or PDF)."""
    mime = (mime_type or "image/jpeg").split(";")[0].strip().lower()
    if mime in ("image/jpg", "image/pjpeg"):
        mime = "image/jpeg"
    mime = mime or "image/jpeg"
    raw = (image_base64 or "").strip()
    if "," in raw and raw.lower().startswith("data:"):
        raw = raw.split(",", 1)[1]
    data_url = f"data:{mime};base64,{raw}"
    if mime == "application/pdf":
        return [
            {"type": "text", "text": prompt},
            {"type": "file", "file": {"filename": "stock-sheet.pdf", "file_data": data_url}},
        ]
    return [
        {"type": "text", "text": prompt},
        {"type": "image_url", "image_url": {"url": data_url}},
    ]


async def chat_complete(
    messages: list,
    *,
    temperature: float = 0.2,
    max_tokens: int = 4096,
    timeout: float = 60.0,
    extra: Optional[dict] = None,
) -> str:
    ensure_configured()
    payload = request_payload(
        messages,
        temperature=temperature,
        max_tokens=max_tokens,
        extra=extra,
    )

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(OPENROUTER_URL, headers=request_headers(), json=payload)
        if resp.status_code != 200:
            logger.error("OpenRouter error %d: %s", resp.status_code, resp.text[:500])
            resp.raise_for_status()
        return _extract_text(resp.json())


async def stream_chat(
    messages: list,
    *,
    temperature: float = 0.3,
    max_tokens: int = 2048,
    timeout: float = 90.0,
) -> AsyncIterator[str]:
    """Yield OpenAI-style content deltas as they arrive."""
    ensure_configured()
    payload = request_payload(
        messages,
        temperature=temperature,
        max_tokens=max_tokens,
        stream=True,
    )
    yielded = False
    reasoning_bits: list[str] = []
    async with httpx.AsyncClient(timeout=timeout) as client:
        async with client.stream("POST", OPENROUTER_URL, headers=request_headers(), json=payload) as resp:
            if resp.status_code != 200:
                body = (await resp.aread())[:500]
                logger.error("OpenRouter stream error %d: %s", resp.status_code, body)
                raise httpx.HTTPStatusError(
                    "OpenRouter stream failed",
                    request=resp.request,
                    response=resp,
                )
            async for line in resp.aiter_lines():
                line = (line or "").strip()
                if not line.startswith("data:"):
                    continue
                raw = line[5:].strip()
                if raw == "[DONE]":
                    break
                try:
                    chunk = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                choices = chunk.get("choices") or []
                if not choices:
                    continue
                choice = choices[0] or {}
                delta = choice.get("delta") or {}
                text = _content_to_text(delta.get("content"))
                if not (text or "").strip():
                    text = _message_text(choice.get("message") or {})
                if (text or "").strip():
                    yielded = True
                    yield text
                    continue
                thought = (
                    _reasoning_to_text(delta.get("reasoning"))
                    or _reasoning_to_text(delta.get("reasoning_content"))
                    or _reasoning_to_text(delta.get("reasoning_details"))
                )
                if thought:
                    reasoning_bits.append(thought)

    if yielded:
        return
    leftover = "".join(reasoning_bits).strip()
    if leftover:
        yield leftover
        return
    logger.warning("OpenRouter stream had no content; falling back to non-stream")
    text = await chat_complete(
        messages,
        temperature=temperature,
        max_tokens=max_tokens,
        timeout=timeout,
    )
    if text:
        yield text
