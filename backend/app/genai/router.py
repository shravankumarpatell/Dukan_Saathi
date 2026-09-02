from typing import Optional, List, Dict
"""GenAI API endpoints — extraction, chat, and document indexing.

All endpoints use Vertex Gemini via Application Default Credentials.
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends
import time

from app.common.errors import AppError, classify_exception
from app.dependencies import get_current_user, AuthenticatedUser
from app.gemini.client import is_configured
from app.genai.schemas import ExtractRequest, ExtractResponse, ChatRequest, ChatResponse
from app.genai.services import ExtractionService, ChatService
from app.genai.retrieval import RetrievalService
from app.genai.exceptions import ApplicationError
from app.genai.logger import logger

router = APIRouter(prefix="/genai", tags=["GenAI"])

retrieval_service = RetrievalService()
chat_service = ChatService(retrieval_service)


def _ensure_gemini():
    """Fail fast if Gemini (API key or Vertex ADC) is not configured."""
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="Gemini is not configured. Set GEMINI_API_KEY or GOOGLE_CLOUD_PROJECT on the server.",
        )


@router.post("/extract", response_model=ExtractResponse)
async def extract_invoice(req: ExtractRequest, user: AuthenticatedUser = Depends(get_current_user)):
    _ensure_gemini()
    start_time = time.time()
    try:
        result = await ExtractionService.extract_stock(req.resolved_base64(), req.resolved_mime())
        latency = time.time() - start_time
        logger.info("Extraction API success: latency=%.2fs user=%s", latency, user.uid)

        return ExtractResponse(
            status="success",
            data=result.model_dump(),
            fallback_used=False,
        )
    except AppError:
        raise  # 400 bad file / 504 Gemini timeout — handled globally
    except ApplicationError as e:
        # Both Gemini models failed: the dependency is unavailable, not our bug.
        logger.error("Extraction API failure: %s %s", e.message, e.details, exc_info=e)
        raise HTTPException(status_code=503, detail={"error": e.message, "details": e.details})
    except Exception as e:
        status_code, message, type_name = classify_exception(e)
        logger.error("Extraction API unhandled failure -> %s %s", status_code, type_name, exc_info=e)
        raise HTTPException(status_code=status_code, detail=message)


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
    except AppError:
        raise
    except Exception as e:
        status_code, message, type_name = classify_exception(e)
        logger.error("Chat API failure -> %s %s", status_code, type_name, exc_info=e)
        raise HTTPException(status_code=status_code, detail=message)


@router.post("/index-documents")
async def index_docs(background_tasks: BackgroundTasks, documents: List[str], user: AuthenticatedUser = Depends(get_current_user)):
    """Endpoint to update the FAISS RAG index with new shop data."""
    background_tasks.add_task(retrieval_service.index_documents, documents)
    return {"status": "indexing_started", "document_count": len(documents)}
