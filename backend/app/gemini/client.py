"""Gemini client — Google AI Studio API key, or Vertex AI + ADC."""

from __future__ import annotations

import base64
import binascii
import json
import logging
import asyncio
from typing import Any, AsyncIterator, Optional

from app.config import settings
from app.common.errors import UpstreamTimeoutError, ValidationError

logger = logging.getLogger(__name__)

_client = None
_adc_ok = False

_ADC_HELP = (
    "Google Application Default Credentials not found. "
    "On a VM either set GEMINI_API_KEY (Google AI Studio) in backend/.env, "
    "or set GOOGLE_APPLICATION_CREDENTIALS to a Vertex service-account JSON. "
    "On Windows: gcloud auth application-default login."
)
_GENAI_HELP = (
    "Package google-genai is missing. On the VM use Python 3.10+ "
    "(venv312) and pip install -r requirements.txt."
)


def _api_key() -> str:
    return (settings.GEMINI_API_KEY or "").strip()


def is_configured() -> bool:
    return bool(_api_key() or settings.GOOGLE_CLOUD_PROJECT)


def _import_genai():
    try:
        from google import genai
    except ImportError as exc:
        raise ValidationError(_GENAI_HELP) from exc
    return genai


def ensure_configured() -> None:
    """Require a Gemini API key or Vertex ADC. Raises ValidationError if missing."""
    global _adc_ok
    if _api_key():
        _import_genai()
        return
    if not settings.GOOGLE_CLOUD_PROJECT:
        raise ValidationError(
            "Gemini is not configured. Set GEMINI_API_KEY in backend/.env "
            "(Google AI Studio), or set GOOGLE_CLOUD_PROJECT plus Vertex ADC."
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
    """Cached google-genai client: API key if set, otherwise Vertex + ADC."""
    global _client
    if _client is not None:
        return _client

    ensure_configured()
    genai = _import_genai()

    import os

    key = _api_key()
    if key:
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "false"
        _client = genai.Client(api_key=key)
        return _client

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

    try:
        raw = base64.b64decode(_strip_data_uri(image_base64), validate=False)
    except (ValueError, binascii.Error) as exc:
        raise ValidationError("File padh nahi paya — image/PDF dobara select karein.") from exc
    if not raw:
        raise ValidationError("File khali hai — image/PDF dobara select karein.")
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


def _is_gemini_3(model: Optional[str]) -> bool:
    return "gemini-3" in (model or "").lower()


def _thinking_config(level: str):
    from google.genai import types

    thinking_cls = getattr(types, "ThinkingConfig", None)
    if thinking_cls is None:
        return None
    for value in (level.lower(), level.upper(), level):
        try:
            return thinking_cls(thinking_level=value)
        except Exception:
            continue
    return None


def _gen_config(
    *,
    model: Optional[str] = None,
    system_instruction: Optional[str] = None,
    temperature: float = 0.3,
    json_mode: bool = False,
    response_schema: Optional[dict] = None,
    include_thinking: bool = True,
):
    from google.genai import types

    model_id = model or settings.GEMINI_MODEL
    kwargs: dict = {}
    # Gemini 3.x ignores / will reject sampling params — use thinking_level instead.
    if include_thinking and _is_gemini_3(model_id):
        thinking = _thinking_config("minimal" if json_mode else "medium")
        if thinking is not None:
            kwargs["thinking_config"] = thinking
    elif not _is_gemini_3(model_id):
        kwargs["temperature"] = temperature
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
    """Non-streaming generate. Returns concatenated text.

    Raises :class:`UpstreamTimeoutError` (504) when Gemini does not answer
    within ``GEMINI_TIMEOUT_S``; other SDK errors propagate and are classified
    by the global handler (429 → 503 "AI busy", etc.).
    """
    client = get_client()
    timeout_s = float(settings.GEMINI_TIMEOUT_S)
    model_id = model or settings.GEMINI_MODEL
    contents = _build_contents(
        user_text=user_text,
        messages=messages,
        image_base64=image_base64,
        image_mime=image_mime,
    )

    async def _call(*, include_thinking: bool, schema: Optional[dict]):
        return await client.aio.models.generate_content(
            model=model_id,
            contents=contents,
            config=_gen_config(
                model=model_id,
                system_instruction=system_instruction,
                temperature=temperature,
                json_mode=json_mode,
                response_schema=schema,
                include_thinking=include_thinking,
            ),
        )

    try:
        response = await asyncio.wait_for(
            _call(include_thinking=True, schema=response_schema),
            timeout=timeout_s,
        )
    except asyncio.TimeoutError as exc:
        logger.error("Gemini generate_content timed out after %.0fs (model=%s)", timeout_s, model_id)
        raise UpstreamTimeoutError() from exc
    except Exception as exc:
        logger.warning(
            "Gemini generate failed (%s: %s); retrying simpler config",
            type(exc).__name__,
            str(exc)[:300],
        )
        try:
            response = await asyncio.wait_for(
                _call(include_thinking=False, schema=None),
                timeout=timeout_s,
            )
        except asyncio.TimeoutError as exc2:
            logger.error("Gemini retry timed out after %.0fs (model=%s)", timeout_s, model_id)
            raise UpstreamTimeoutError() from exc2
        except Exception:
            raise exc

    try:
        text = response.text or ""
    except Exception:
        text = ""
        logger.exception("Gemini response had no .text")
    if not text:
        # Thinking-only replies sometimes leave .text empty; pull parts.
        try:
            parts = response.candidates[0].content.parts
            text = "".join(getattr(p, "text", "") or "" for p in parts)
        except Exception:
            text = ""
    return text


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
    model_id = model or settings.GEMINI_MODEL
    stream = client.aio.models.generate_content_stream(
        model=model_id,
        contents=_build_contents(user_text=user_text, messages=messages),
        config=_gen_config(
            model=model_id,
            system_instruction=system_instruction,
            temperature=temperature,
        ),
    )
    # Per-chunk idle timeout: a stalled stream must not pin the worker forever.
    idle_s = float(settings.GEMINI_TIMEOUT_S)
    it = _aiter_stream(stream).__aiter__()
    while True:
        try:
            chunk = await asyncio.wait_for(it.__anext__(), timeout=idle_s)
        except StopAsyncIteration:
            return
        except asyncio.TimeoutError as exc:
            logger.error("Gemini stream stalled for %.0fs (model=%s)", idle_s, model_id)
            raise UpstreamTimeoutError() from exc
        text = _chunk_text(chunk)
        if text:
            yield text
