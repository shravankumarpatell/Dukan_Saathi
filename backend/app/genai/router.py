"""GenAI API endpoints — extraction, chat, and document indexing.

All endpoints use Gemini via the app-level API key (same as gemini/ module).
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
import time

from app.dependencies import get_current_user, AuthenticatedUser
from app.config import settings as app_settings
from app.genai.schemas import ExtractRequest, ExtractResponse, ChatRequest, ChatResponse
from app.genai.services import ExtractionService, ChatService
from app.genai.retrieval import RetrievalService
from app.genai.exceptions import ApplicationError
from app.genai.logger import logger

router = APIRouter(prefix="/genai", tags=["GenAI"])

retrieval_service = RetrievalService()
chat_service = ChatService(retrieval_service)


def _ensure_gemini():
    """Fail fast if Gemini is not configured."""
    if not app_settings.GEMINI_API_KEY:
        raise HTTPException(status_code=503, detail="Gemini API key not configured on the server")


@router.post("/extract", response_model=ExtractResponse)
async def extract_invoice(req: ExtractRequest, user: AuthenticatedUser = Depends(get_current_user)):
    _ensure_gemini()
    start_time = time.time()
    try:
        result = await ExtractionService.extract_invoice(req.image_base64)
        latency = time.time() - start_time
        logger.info("Extraction API success: latency=%.2fs user=%s", latency, user.uid)

        return ExtractResponse(
            status="success",
            data=result.model_dump(),
            fallback_used=False,
        )
    except ApplicationError as e:
        logger.error("Extraction API failure: %s %s", e, e.details)
        raise HTTPException(status_code=500, detail={"error": e.message, "details": e.details})
    except Exception as e:
        logger.error("Extraction API unhandled failure: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error during extraction")


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest, user: AuthenticatedUser = Depends(get_current_user)):
    _ensure_gemini()
    start_time = time.time()
    try:
        response, chunks_used = await chat_service.chat(req.messages)
        latency = time.time() - start_time
        logger.info("Chat API success: latency=%.2fs chunks=%d user=%s", latency, chunks_used, user.uid)

        return ChatResponse(
            response=response,
            retrieved_context_chunks=chunks_used,
        )
    except Exception as e:
        logger.error("Chat API failure: %s", e)
        raise HTTPException(status_code=500, detail="Internal server error during chat")


@router.post("/index-documents")
async def index_docs(background_tasks: BackgroundTasks, documents: list[str], user: AuthenticatedUser = Depends(get_current_user)):
    """Endpoint to update the FAISS RAG index with new shop data."""
    _ensure_gemini()
    background_tasks.add_task(retrieval_service.index_documents, documents)
    return {"status": "indexing_started", "document_count": len(documents)}
