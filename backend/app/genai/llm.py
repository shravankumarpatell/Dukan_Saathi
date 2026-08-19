from typing import Optional, List, Dict, Type, AsyncGenerator
"""LLM client — Vertex Gemini via Application Default Credentials.

Supports:
- Structured extraction (image → JSON via Pydantic schema)
- Free-form chat
- Retry with fallback model
"""

import json
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, RetryError

from app.gemini.client import generate_content, ensure_configured
from app.genai.config import settings
from app.genai.logger import logger
from app.genai.exceptions import LLMError, FallbackError

RETRYABLE = (TimeoutError, ConnectionError, OSError)
try:
    from google.genai.errors import ServerError

    RETRYABLE = RETRYABLE + (ServerError,)
except ImportError:
    pass


def _ensure_gemini():
    try:
        ensure_configured()
    except Exception as exc:
        raise LLMError(str(exc)) from exc


def _inline_refs(node, defs: dict):
    """Replace $ref pointers with the referenced definition (Gemini has no $defs)."""
    if isinstance(node, dict):
        ref = node.get("$ref")
        if isinstance(ref, str) and defs:
            name = ref.split("/")[-1]
            if name in defs:
                return _inline_refs(defs[name], defs)
        return {k: _inline_refs(v, defs) for k, v in node.items()}
    if isinstance(node, list):
        return [_inline_refs(i, defs) for i in node]
    return node


def _flatten_nullable(schema: dict) -> dict:
    """Turn anyOf: [T, null] into T so Gemini responseSchema stays valid."""
    any_of = schema.get("anyOf")
    if isinstance(any_of, list):
        non_null = [item for item in any_of if not (isinstance(item, dict) and item.get("type") == "null")]
        if len(non_null) == 1 and isinstance(non_null[0], dict):
            merged = {k: v for k, v in schema.items() if k != "anyOf"}
            merged.update(non_null[0])
            return merged
    return schema


def _schema_to_json_schema(schema_class: Type[BaseModel]) -> dict:
    """Convert a Pydantic model to a Gemini-compatible JSON schema."""
    raw = schema_class.model_json_schema()
    defs = raw.pop("$defs", None) or raw.pop("definitions", None) or {}
    inlined = _inline_refs(raw, defs)
    return _clean_schema(inlined)


def _clean_schema(schema: dict) -> dict:
    """Recursively remove unsupported keys for Gemini's responseSchema."""
    if not isinstance(schema, dict):
        return schema
    schema = _flatten_nullable(schema)
    disallowed = {"title", "default", "$defs", "definitions", "$ref", "anyOf", "allOf", "oneOf", "discriminator"}
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
        retry=retry_if_exception_type(RETRYABLE),
        reraise=True,
    )


class LLMClient:
    @staticmethod
    async def _call_gemini_structured(
        model_config, prompt: str, schema_class: Type[BaseModel],
        input_text: str = None, image_base64: str = None, image_mime: str = "image/jpeg",
    ) -> BaseModel:
        """Call Gemini with JSON mode + responseSchema for structured output."""
        _ensure_gemini()
        logger.info("LLM call start: model=%s schema=%s", model_config.model, schema_class.__name__)

        text = await generate_content(
            model=model_config.model,
            user_text=input_text,
            system_instruction=prompt,
            image_base64=image_base64,
            image_mime=image_mime,
            temperature=model_config.temperature,
            json_mode=True,
            response_schema=_schema_to_json_schema(schema_class),
        )

        logger.info("LLM call success: model=%s", model_config.model)
        cleaned = (text or "").replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned)
        return schema_class.model_validate(parsed)

    @staticmethod
    async def generate_structured(
        prompt: str, schema_class: Type[BaseModel],
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

        @create_retry_decorator(settings.models.primary)
        async def call():
            return await generate_content(
                model=settings.models.primary.model,
                messages=messages,
                system_instruction=prompt,
                temperature=settings.models.primary.temperature,
            )

        return await call()
