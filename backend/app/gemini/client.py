"""Gemini via Vertex AI + Application Default Credentials (no API key)."""

from __future__ import annotations

import base64
import json
import logging
import asyncio
from typing import Any, AsyncIterator, Optional

from app.config import settings
from app.common.errors import ValidationError

logger = logging.getLogger(__name__)

_client = None
_adc_ok = False

_ADC_HELP = (
    "Google Application Default Credentials not found. "
    "On Windows with Git Bash or WSL run: "
    "bash <(curl -sSL https://storage.googleapis.com/cloud-samples-data/adc/setup_adc.sh) "
    "Or: gcloud auth application-default login. "
    "On a VM set GOOGLE_APPLICATION_CREDENTIALS to a service-account JSON path."
)


def is_configured() -> bool:
    return bool(settings.GOOGLE_CLOUD_PROJECT)


def ensure_configured() -> None:
    """Require a GCP project and ADC. Raises ValidationError if missing."""
    global _adc_ok
    if not settings.GOOGLE_CLOUD_PROJECT:
        raise ValidationError(
            "GOOGLE_CLOUD_PROJECT is not set. Gemini uses Vertex AI with Application Default Credentials."
        )
    if _adc_ok:
        return
    try:
        import google.auth
        from google.auth.exceptions import DefaultCredentialsError
    except ImportError as exc:
        raise ValidationError(_ADC_HELP) from exc

    try:
        creds, _project = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        if creds is None:
            raise ValidationError(_ADC_HELP)
        _adc_ok = True
    except ValidationError:
        raise
    except DefaultCredentialsError:
        raise ValidationError(_ADC_HELP)
    except Exception as exc:
        logger.warning("ADC check failed: %s", exc)
        raise ValidationError(_ADC_HELP) from exc


def get_client():
    """Cached google-genai client using Vertex AI + ADC (never an API key)."""
    global _client
    if _client is not None:
        return _client

    ensure_configured()

    import os
    from google import genai

    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "true"
    os.environ.setdefault("GOOGLE_CLOUD_PROJECT", settings.GOOGLE_CLOUD_PROJECT)
    os.environ.setdefault("GOOGLE_CLOUD_LOCATION", settings.GOOGLE_CLOUD_LOCATION)

    _client = genai.Client(
        vertexai=True,
        project=settings.GOOGLE_CLOUD_PROJECT,
        location=settings.GOOGLE_CLOUD_LOCATION,
    )
    return _client


def parse_json_text(text: str) -> Any:
    cleaned = (text or "").replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


def _strip_data_uri(b64: str) -> str:
    if b64.startswith("data:") and "," in b64:
        return b64.split(",", 1)[1]
    return b64


def _image_part(image_base64: str, mime: str):
    from google.genai import types

    raw = base64.b64decode(_strip_data_uri(image_base64))
    mime = (mime or "image/jpeg").split(";")[0].strip() or "image/jpeg"
    if hasattr(types.Part, "from_bytes"):
        return types.Part.from_bytes(data=raw, mime_type=mime)
    return types.Part(inline_data=types.Blob(data=raw, mime_type=mime))


def _chunk_text(chunk) -> str:
    try:
        text = getattr(chunk, "text", None)
    except Exception:
        return ""
    return text or ""


async def _aiter_stream(stream) -> AsyncIterator:
    if hasattr(stream, "__aiter__"):
        async for item in stream:
            yield item
        return
    resolved = await stream
    async for item in resolved:
        yield item


def _build_contents(
    *,
    user_text: Optional[str] = None,
    messages: Optional[list] = None,
    image_base64: Optional[str] = None,
    image_mime: str = "image/jpeg",
):
    from google.genai import types

    if messages:
        contents = []
        for msg in messages:
            role = "model" if msg.get("role") == "assistant" else "user"
            contents.append(
                types.Content(
                    role=role,
                    parts=[types.Part.from_text(text=msg.get("content") or "")],
                )
            )
        return contents

    parts = []
    if user_text:
        parts.append(types.Part.from_text(text=user_text))
    if image_base64:
        parts.append(_image_part(image_base64, image_mime))
    if not parts:
        parts.append(types.Part.from_text(text="Extract information from the context."))
    return [types.Content(role="user", parts=parts)]


def _gen_config(
    *,
    system_instruction: Optional[str] = None,
    temperature: float = 0.3,
    json_mode: bool = False,
    response_schema: Optional[dict] = None,
):
    from google.genai import types

    kwargs: dict = {"temperature": temperature}
    if system_instruction:
        kwargs["system_instruction"] = system_instruction
    if json_mode:
        kwargs["response_mime_type"] = "application/json"
    if response_schema:
        kwargs["response_mime_type"] = "application/json"
        kwargs["response_schema"] = response_schema
    # Vertex Interactions `store` is not on every google-genai GenerateContentConfig.
    if not settings.GEMINI_STORE_PROMPTS:
        fields = getattr(types.GenerateContentConfig, "model_fields", None) or {}
        if "store" in fields:
            kwargs["store"] = False
    return types.GenerateContentConfig(**kwargs)


async def generate_content(
    *,
    model: Optional[str] = None,
    user_text: Optional[str] = None,
    messages: Optional[list] = None,
    system_instruction: Optional[str] = None,
    image_base64: Optional[str] = None,
    image_mime: str = "image/jpeg",
    temperature: float = 0.3,
    json_mode: bool = False,
    response_schema: Optional[dict] = None,
) -> str:
    """Non-streaming generate. Returns concatenated text."""
    client = get_client()
    timeout_s = 90.0
    try:
        response = await asyncio.wait_for(
            client.aio.models.generate_content(
                model=model or settings.GEMINI_MODEL,
                contents=_build_contents(
                    user_text=user_text,
                    messages=messages,
                    image_base64=image_base64,
                    image_mime=image_mime,
                ),
                config=_gen_config(
                    system_instruction=system_instruction,
                    temperature=temperature,
                    json_mode=json_mode,
                    response_schema=response_schema,
                ),
            ),
            timeout=timeout_s,
        )
    except asyncio.TimeoutError:
        logger.error("Gemini generate_content timed out after %.0fs", timeout_s)
        return ""
    try:
        return response.text or ""
    except Exception:
        return ""


async def stream_content(
    *,
    model: Optional[str] = None,
    messages: Optional[list] = None,
    user_text: Optional[str] = None,
    system_instruction: Optional[str] = None,
    temperature: float = 0.3,
) -> AsyncIterator[str]:
    """Yield text deltas from Vertex Gemini."""
    client = get_client()
    stream = client.aio.models.generate_content_stream(
        model=model or settings.GEMINI_MODEL,
        contents=_build_contents(user_text=user_text, messages=messages),
        config=_gen_config(
            system_instruction=system_instruction,
            temperature=temperature,
        ),
    )
    async for chunk in _aiter_stream(stream):
        text = _chunk_text(chunk)
        if text:
            yield text
