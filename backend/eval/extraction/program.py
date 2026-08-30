"""DSPy stock-extract program over Vertex ADC (eval/compile only)."""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
from dataclasses import dataclass
from typing import Any, List, Optional

from app.common.tile_sizes import TILE_SIZE_PROMPT
from app.genai.config import settings
from app.genai.llm import _schema_to_json_schema
from app.genai.prompts import PromptBuilder
from app.genai.schemas import StockExtractResult, StockExtractRow
from app.genai.stock_extract import (
    coerce_row,
    drop_non_product_rows,
    enrich_rows_from_sheet_text,
    load_extraction_prompt,
    normalize_row,
    seed_instruction_text,
    sheet_user_text,
)

logger = logging.getLogger(__name__)


@dataclass
class ExtractCall:
    image_base64: str = ""
    image_mime: str = "image/jpeg"
    sheet_text: str = ""
    structured: bool = False


_CALL: contextvars.ContextVar[ExtractCall] = contextvars.ContextVar(
    "stock_extract_call", default=ExtractCall()
)


def _run_async(coro):
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)
    raise RuntimeError("VertexExtractLM cannot run inside an active event loop")


def _message_text(msg: Any) -> str:
    parts = getattr(msg, "parts", None) or []
    texts = []
    for part in parts:
        text = getattr(part, "text", None)
        if text:
            texts.append(text)
    if texts:
        return "\n".join(texts)
    content = getattr(msg, "content", None)
    if isinstance(content, str):
        return content
    return ""


def _split_system_user(request: Any) -> tuple[str, str]:
    system_parts: List[str] = []
    user_parts: List[str] = []
    for msg in getattr(request, "messages", None) or []:
        role = getattr(msg, "role", "user")
        text = _message_text(msg)
        if not text:
            continue
        if role in ("system", "developer"):
            system_parts.append(text)
        else:
            user_parts.append(text)
    return "\n\n".join(system_parts).strip(), "\n\n".join(user_parts).strip()


def make_lm(model: Optional[str] = None, temperature: float = 0.0):
    """Vertex ADC LM: JSON schema when extracting a sheet, free-form for GEPA reflection."""
    import dspy
    from app.gemini.client import generate_content

    class VertexExtractLM(dspy.BaseLM):
        forward_contract = "typed_lm"

        def __init__(self, model_name: str, temperature: float = 0.0):
            super().__init__(model=model_name, temperature=temperature)
            self.model = model_name
            self.temperature = temperature

        def forward(self, request):
            call = _CALL.get()
            system, user = _split_system_user(request)
            structured = bool(call.structured or call.image_base64)

            if structured:
                system_instruction = system or PromptBuilder.build(
                    load_extraction_prompt(), {"tile_sizes": TILE_SIZE_PROMPT}
                )
                user_text = sheet_user_text(call.sheet_text)
                if user and user not in user_text:
                    user_text = f"{user}\n\n{user_text}"
                text = _run_async(
                    generate_content(
                        model=self.model,
                        user_text=user_text,
                        system_instruction=system_instruction,
                        image_base64=call.image_base64 or None,
                        image_mime=call.image_mime,
                        temperature=self.temperature,
                        json_mode=True,
                        response_schema=_schema_to_json_schema(StockExtractResult),
                    )
                )
                return dspy.LMResponse.from_text(text or '{"rows": []}', model=self.model)

            text = _run_async(
                generate_content(
                    model=self.model,
                    user_text=user or "Respond.",
                    system_instruction=system or None,
                    temperature=max(self.temperature, 0.2),
                    json_mode=False,
                )
            )
            return dspy.LMResponse.from_text(text or "", model=self.model)

    return VertexExtractLM(model or settings.models.primary.model, temperature=temperature)


def extract_signature():
    import dspy

    instruction = seed_instruction_text()

    class ExtractStock(dspy.Signature):
        """Extract product lines from a tiles and sanitaryware supplier sheet."""

        sheet_text: str = dspy.InputField(
            desc="Digital PDF table text. Use '(none)' if the file is a photo."
        )
        rows: list[dict] = dspy.OutputField(
            desc="Product rows: name, code, company, size, unit, piecesPerBox, qty"
        )

    if hasattr(ExtractStock, "with_instructions"):
        return ExtractStock.with_instructions(instruction)
    ExtractStock.__doc__ = instruction
    return ExtractStock


def build_program():
    import dspy

    sig = extract_signature()

    class StockExtractProgram(dspy.Module):
        def __init__(self):
            super().__init__()
            self.extract = dspy.Predict(sig)

        def forward(
            self,
            sheet_text: str,
            image_base64: str = "",
            image_mime: str = "image/jpeg",
        ):
            text = "" if sheet_text in ("", "(none)") else sheet_text
            token = _CALL.set(
                ExtractCall(
                    image_base64=image_base64,
                    image_mime=image_mime,
                    sheet_text=text,
                    structured=True,
                )
            )
            try:
                pred = self.extract(sheet_text=sheet_text or "(none)")
                pred.rows = clean_pred_rows(getattr(pred, "rows", None), sheet_text=text)
                return pred
            finally:
                _CALL.reset(token)

    return StockExtractProgram()


def configure_dspy(lm) -> None:
    import dspy

    kwargs = {"lm": lm}
    adapter = getattr(dspy, "JSONAdapter", None)
    if adapter is not None:
        try:
            kwargs["adapter"] = adapter()
        except Exception:
            logger.warning("Could not enable dspy.JSONAdapter; using default adapter")
    dspy.configure(**kwargs)


def clean_pred_rows(rows, sheet_text: str = "") -> List[dict]:
    if not rows:
        return []
    if isinstance(rows, dict) and "rows" in rows:
        rows = rows["rows"]
    if isinstance(rows, str):
        from app.gemini.client import parse_json_text

        try:
            parsed = parse_json_text(rows)
        except Exception:
            parsed = json.loads(rows)
        if isinstance(parsed, dict):
            rows = parsed.get("rows", [])
        else:
            rows = parsed
    dumped = []
    for obj in rows or []:
        try:
            dumped.append(coerce_and_dump(obj))
        except Exception:
            continue
    models = drop_non_product_rows([coerce_row(r) for r in dumped])
    models = enrich_rows_from_sheet_text(models, sheet_text)
    return [m.model_dump() for m in models]


def coerce_and_dump(obj) -> dict:
    if isinstance(obj, StockExtractRow):
        return normalize_row(obj).model_dump()
    if isinstance(obj, dict):
        return normalize_row(StockExtractRow.model_validate(obj)).model_dump()
    raise TypeError(type(obj))


def program_instructions(program) -> str:
    named = getattr(program, "named_predictors", None)
    if named is None:
        return seed_instruction_text()
    for _name, predictor in named():
        sig = getattr(predictor, "signature", None)
        if sig is not None and getattr(sig, "instructions", None):
            return str(sig.instructions).strip()
    return seed_instruction_text()
