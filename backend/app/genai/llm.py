"""LLM client — OpenRouter chat completions (Nemotron VL).

Supports structured extraction (image → JSON) and free-form chat, with retry + fallback.
"""

import json
from typing import List, Type

import httpx
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type, RetryError

from app.ai import openrouter
from app.genai.config import settings
from app.genai.logger import logger
from app.genai.exceptions import LLMError, FallbackError


def create_retry_decorator(model_config):
    return retry(
        stop=stop_after_attempt(model_config.max_retries),
        wait=wait_exponential(
            multiplier=settings.models.retry_policy.wait_exponential_multiplier,
            max=settings.models.retry_policy.wait_exponential_max,
        ),
        retry=retry_if_exception_type((httpx.ConnectError, httpx.ReadTimeout, httpx.ConnectTimeout, LLMError)),
        reraise=True,
    )


def _messages_for_structured(
    prompt: str,
    input_text: str = None,
    image_base64: str = None,
    image_mime: str = "image/jpeg",
    schema_class: Type[BaseModel] = None,
) -> list:
    schema_hint = ""
    if schema_class is not None:
        schema_hint = (
            "\nRespond with a single JSON object that matches this schema:\n"
            + json.dumps(schema_class.model_json_schema(), indent=2)
            + "\nReturn ONLY JSON, no markdown."
        )
    user_text = (input_text or "Extract information from the image/context.") + schema_hint
    if image_base64:
        return [
            {"role": "system", "content": prompt},
            {"role": "user", "content": openrouter.vision_content_parts(user_text, image_base64, image_mime)},
        ]
    return [
        {"role": "system", "content": prompt},
        {"role": "user", "content": user_text},
    ]


class LLMClient:
    @staticmethod
    async def _call_structured(
        model_config, prompt: str, schema_class: Type[BaseModel],
        input_text: str = None, image_base64: str = None, image_mime: str = "image/jpeg",
    ) -> BaseModel:
        openrouter.ensure_configured()
        messages = _messages_for_structured(prompt, input_text, image_base64, image_mime, schema_class)
        logger.info("LLM call start: model=%s schema=%s", model_config.model, schema_class.__name__)
        try:
            text = await openrouter.chat_complete(
                messages,
                temperature=model_config.temperature,
                max_tokens=4096,
                timeout=float(model_config.timeout_seconds),
                extra={"model": model_config.model},
            )
        except httpx.HTTPError as e:
            raise LLMError(f"OpenRouter API error: {e}") from e

        logger.info("LLM call success: model=%s", model_config.model)
        parsed = openrouter.parse_json_payload(text)
        return schema_class.model_validate(parsed)

    @staticmethod
    async def generate_structured(
        prompt: str, schema_class: Type[BaseModel],
        input_text: str = None, image_base64: str = None, image_mime: str = "image/jpeg",
    ) -> BaseModel:
        """Generate structured output with automatic fallback."""
        @create_retry_decorator(settings.models.primary)
        async def call_primary():
            return await LLMClient._call_structured(
                settings.models.primary, prompt, schema_class, input_text, image_base64, image_mime,
            )

        @create_retry_decorator(settings.models.fallback)
        async def call_fallback():
            logger.warning("Triggering fallback model: %s", settings.models.fallback.model)
            return await LLMClient._call_structured(
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
        """Free-form chat via OpenRouter."""
        openrouter.ensure_configured()
        api_messages = [{"role": "system", "content": prompt}]
        for msg in messages:
            role = msg.get("role") if msg.get("role") in ("user", "assistant") else "user"
            api_messages.append({"role": role, "content": msg["content"]})

        @create_retry_decorator(settings.models.primary)
        async def call():
            try:
                return await openrouter.chat_complete(
                    api_messages,
                    temperature=settings.models.primary.temperature,
                    timeout=float(settings.models.primary.timeout_seconds),
                    extra={"model": settings.models.primary.model},
                )
            except httpx.HTTPError as e:
                raise LLMError(f"OpenRouter chat error: {e}") from e

        return await call()
