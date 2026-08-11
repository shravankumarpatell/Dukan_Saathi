"""GenAI business services — extraction and chat."""

from app.genai.logger import logger
from app.genai.llm import LLMClient
from app.genai.schemas import InvoiceExtractionResult, ChatMessage
from app.genai.prompts import PromptBuilder
from app.genai.config import settings
from app.genai.retrieval import RetrievalService


class ExtractionService:
    @staticmethod
    async def extract_invoice(image_base64: str) -> InvoiceExtractionResult:
        logger.info("Starting invoice extraction")

        prompt = PromptBuilder.build(settings.prompt_extraction)

        result = await LLMClient.generate_structured(
            prompt=prompt,
            schema_class=InvoiceExtractionResult,
            image_base64=image_base64,
        )

        logger.info("Invoice extraction complete: %d products", len(result.products))
        return result


class ChatService:
    def __init__(self, retrieval_service: RetrievalService):
        self.retrieval_service = retrieval_service

    async def chat(self, messages: list[ChatMessage]) -> tuple[str, int]:
        logger.info("Processing chat request")

        last_user_msg = next((m.content for m in reversed(messages) if m.role == "user"), "")

        context_chunks = []
        if last_user_msg:
            context_chunks = await self.retrieval_service.search(last_user_msg)

        context_dict = {}
        if context_chunks:
            context_dict["Knowledge Base"] = "\n\n".join(context_chunks)

        system_prompt = PromptBuilder.build(settings.prompt_chat, context=context_dict)

        api_messages = [{"role": m.role, "content": m.content} for m in messages]

        response_text = await LLMClient.generate_chat(system_prompt, api_messages)

        return response_text, len(context_chunks)
