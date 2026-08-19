from typing import List, Tuple
"""GenAI business services — extraction, NLU, and chat. Prompts live in YAML."""

from app.genai.logger import logger
from app.genai.llm import LLMClient
from app.genai.schemas import StockExtractResult, StockExtractRow, NluResult, ChatMessage
from app.genai.prompts import PromptBuilder
from app.genai.config import settings
from app.genai.retrieval import RetrievalService
from app.common.tile_sizes import TILE_SIZE_PROMPT, normalize_tile_size


def _normalize_mime(mime: str) -> str:
    mime = (mime or "").split(";")[0].strip().lower()
    if mime in ("", "application/octet-stream"):
        return "image/jpeg"
    return mime


def _normalize_row(row: StockExtractRow) -> StockExtractRow:
    unit = str(row.unit or "").lower()
    if unit in ("piece", "pcs", "pc", "sanitary"):
        row.unit = "piece"
        row.piecesPerBox = 1
        row.size = ""
    else:
        row.unit = "box"
        row.size = normalize_tile_size(row.size) or ""
    return row


class ExtractionService:
    @staticmethod
    async def extract_stock(image_base64: str, mime_type: str = "") -> StockExtractResult:
        logger.info("Starting stock-sheet extraction")
        prompt = PromptBuilder.build(
            settings.prompt_extraction,
            {"tile_sizes": TILE_SIZE_PROMPT},
        )
        result = await LLMClient.generate_structured(
            prompt=prompt,
            schema_class=StockExtractResult,
            image_base64=image_base64,
            image_mime=_normalize_mime(mime_type),
        )
        result.rows = [_normalize_row(r) for r in result.rows]
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
