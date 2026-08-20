from typing import List, Tuple
"""GenAI business services — extraction, NLU, and chat. Prompts live in YAML."""

from app.genai.logger import logger
from app.genai.llm import LLMClient
from app.genai.schemas import StockExtractResult, NluResult, ChatMessage
from app.genai.prompts import PromptBuilder
from app.genai.config import settings
from app.genai.retrieval import RetrievalService
from app.common.tile_sizes import TILE_SIZE_PROMPT
from app.genai.stock_extract import (
    decode_payload,
    drop_non_product_rows,
    enrich_rows_from_sheet_text,
    extract_pdf_text,
    load_extraction_prompt,
    normalize_mime,
    normalize_row,
    sheet_user_text,
)

# Back-compat aliases for older imports/tests.
_normalize_mime = normalize_mime
_normalize_row = normalize_row


class ExtractionService:
    @staticmethod
    async def extract_stock(image_base64: str, mime_type: str = "") -> StockExtractResult:
        logger.info("Starting stock-sheet extraction")
        mime = normalize_mime(mime_type)
        raw = decode_payload(image_base64)
        pdf_text = extract_pdf_text(raw) if mime == "application/pdf" else ""
        prompt = PromptBuilder.build(
            load_extraction_prompt(),
            {"tile_sizes": TILE_SIZE_PROMPT},
        )
        result = await LLMClient.generate_structured(
            prompt=prompt,
            schema_class=StockExtractResult,
            input_text=sheet_user_text(pdf_text),
            image_base64=image_base64,
            image_mime=mime,
        )
        result.rows = enrich_rows_from_sheet_text(
            drop_non_product_rows([normalize_row(r) for r in result.rows]),
            pdf_text,
        )
        logger.info("Stock-sheet extraction complete: %d products", len(result.rows))
        return result


class NluService:
    @staticmethod
    async def parse_command(transcript: str) -> NluResult:
        prompt = PromptBuilder.build(settings.prompt_nlu, {"transcript": transcript})
        user_text = PromptBuilder.user_message(settings.prompt_nlu, {"transcript": transcript})
        return await LLMClient.generate_structured(
            prompt=prompt,
            schema_class=NluResult,
            input_text=user_text or transcript,
        )


class ChatService:
    def __init__(self, retrieval_service: RetrievalService):
        self.retrieval_service = retrieval_service

    @staticmethod
    def system_prompt(shop_data: str = "") -> str:
        return PromptBuilder.build(settings.prompt_chat, {"shop_data": shop_data})

    async def chat(self, messages: List[ChatMessage]) -> Tuple[str, int]:
        logger.info("Processing chat request")

        last_user_msg = next((m.content for m in reversed(messages) if m.role == "user"), "")

        context_chunks = []
        if last_user_msg:
            context_chunks = await self.retrieval_service.search(last_user_msg)

        context_dict = {}
        if context_chunks:
            context_dict["Knowledge Base"] = "\n\n".join(context_chunks)

        system_prompt = PromptBuilder.build(settings.prompt_chat, context_dict)
        api_messages = [{"role": m.role, "content": m.content} for m in messages]
        response_text = await LLMClient.generate_chat(system_prompt, api_messages)
        return response_text, len(context_chunks)
