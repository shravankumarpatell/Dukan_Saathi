from typing import Optional, List, Dict
"""LLM client — calls Google Gemini API via httpx.

Supports:
- Structured extraction (image → JSON via Pydantic schema)
- Free-form chat
- Retry with fallback model
"""

import json
import httpx
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, RetryError

from app.config import settings as app_settings
from app.genai.config import settings
from app.genai.logger import logger
from app.genai.exceptions import LLMError, FallbackError

GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


def _ensure_gemini():
    if not app_settings.GEMINI_API_KEY:
        raise LLMError("Gemini API key not configured on the server")


def _schema_to_json_schema(schema_class: type[BaseModel]) -> dict:
    """Convert a Pydantic model to a Gemini-compatible JSON schema.

    Gemini's responseSchema does NOT support 'title', 'default', '$defs',
    or 'anyOf' fields — strip them out recursively.
    """
    raw = schema_class.model_json_schema()
    return _clean_schema(raw)


def _clean_schema(schema: dict) -> dict:
    """Recursively remove unsupported keys for Gemini's responseSchema."""
    disallowed = {"title", "default", "$defs", "anyOf", "allOf", "oneOf", "discriminator"}
    cleaned = {}
    for k, v in schema.items():
        if k in disallowed:
            continue
        if isinstance(v, dict):
            cleaned[k] = _clean_schema(v)
        elif isinstance(v, list):
            cleaned[k] = [_clean_schema(i) if isinstance(i, dict) else i for i in v]
        else:
            cleaned[k] = v
    return cleaned


def create_retry_decorator(model_config):
    return retry(
        stop=stop_after_attempt(model_config.max_retries),
        wait=wait_exponential(
            multiplier=settings.models.retry_policy.wait_exponential_multiplier,
            max=settings.models.retry_policy.wait_exponential_max,
        ),
        retry=retry_if_exception_type((httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout)),
        reraise=True,
    )


class LLMClient:
    @staticmethod
    async def _call_gemini_structured(
        model_config, prompt: str, schema_class: type[BaseModel],
        input_text: str = None, image_base64: str = None, image_mime: str = "image/jpeg",
    ) -> BaseModel:
        """Call Gemini with JSON mode + responseSchema for structured output."""
        _ensure_gemini()

        url = f"{GEMINI_BASE}/{model_config.model}:generateContent?key={app_settings.GEMINI_API_KEY}"

        # Build user parts
        user_parts = []
        if input_text:
            user_parts.append({"text": input_text})
        if image_base64:
            # Strip data-URI prefix if present
            b64 = image_base64
            if b64.startswith("data:"):
                b64 = b64.split(",", 1)[1]
            user_parts.append({"inline_data": {"mime_type": image_mime, "data": b64}})
        if not user_parts:
            user_parts.append({"text": "Extract information from the context."})

        payload = {
            "contents": [{"role": "user", "parts": user_parts}],
            "systemInstruction": {"parts": [{"text": prompt}]},
            "generationConfig": {
                "responseMimeType": "application/json",
                "responseSchema": _schema_to_json_schema(schema_class),
                "temperature": model_config.temperature,
            },
        }

        logger.info("LLM call start: model=%s schema=%s", model_config.model, schema_class.__name__)

        async with httpx.AsyncClient(timeout=model_config.timeout_seconds) as client:
            resp = await client.post(url, json=payload, headers={"Content-Type": "application/json"})

            if resp.status_code != 200:
                body = resp.text[:500]
                logger.error("Gemini API error %d: %s", resp.status_code, body)
                raise LLMError(f"Gemini API error {resp.status_code}", details={"body": body})

            data = resp.json()
            text = ""
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                text = "".join(p.get("text", "") for p in parts)

            logger.info("LLM call success: model=%s", model_config.model)

            # Parse JSON into Pydantic model
            cleaned = text.replace("```json", "").replace("```", "").strip()
            parsed = json.loads(cleaned)
            return schema_class.model_validate(parsed)

    @staticmethod
    async def generate_structured(
        prompt: str, schema_class: type[BaseModel],
        input_text: str = None, image_base64: str = None, image_mime: str = "image/jpeg",
    ) -> BaseModel:
        """Generate structured output with automatic fallback."""
        @create_retry_decorator(settings.models.primary)
        async def call_primary():
            return await LLMClient._call_gemini_structured(
                settings.models.primary, prompt, schema_class, input_text, image_base64, image_mime,
            )

        @create_retry_decorator(settings.models.fallback)
        async def call_fallback():
            logger.warning("Triggering fallback model: %s", settings.models.fallback.model)
            return await LLMClient._call_gemini_structured(
                settings.models.fallback, prompt, schema_class, input_text, image_base64, image_mime,
            )

        try:
            return await call_primary()
        except RetryError as e:
            logger.warning("Primary model exhausted: %s", e)
            try:
                return await call_fallback()
            except RetryError as fe:
                logger.error("Fallback model exhausted: %s", fe)
                raise FallbackError(
                    "Both primary and fallback models failed.",
                    details={"original_error": str(e), "fallback_error": str(fe)},
                )
        except Exception as e:
            logger.warning("Primary model fatal error: %s", e)
            try:
                return await call_fallback()
            except Exception as fe:
                raise FallbackError(
                    "Fatal failure in both models.",
                    details={"primary": str(e), "fallback": str(fe)},
                )

    @staticmethod
    async def generate_chat(prompt: str, messages: List[dict]) -> str:
        """Free-form chat via Gemini (no structured output)."""
        _ensure_gemini()

        model = settings.models.primary.model
        url = f"{GEMINI_BASE}/{model}:generateContent?key={app_settings.GEMINI_API_KEY}"

        # Convert OpenAI-style messages to Gemini format
        contents = []
        for msg in messages:
            role = "model" if msg.get("role") == "assistant" else "user"
            contents.append({"role": role, "parts": [{"text": msg["content"]}]})

        payload = {
            "contents": contents,
            "systemInstruction": {"parts": [{"text": prompt}]},
            "generationConfig": {"temperature": settings.models.primary.temperature},
        }

        @create_retry_decorator(settings.models.primary)
        async def call():
            async with httpx.AsyncClient(timeout=settings.models.primary.timeout_seconds) as client:
                resp = await client.post(url, json=payload, headers={"Content-Type": "application/json"})
                if resp.status_code != 200:
                    raise LLMError(f"Gemini chat error {resp.status_code}")
                data = resp.json()
                text = ""
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    text = "".join(p.get("text", "") for p in parts)
                return text

        return await call()
