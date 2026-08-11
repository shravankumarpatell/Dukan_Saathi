from typing import Optional, List, Dict
"""RAG retrieval service — FAISS index with Gemini embeddings."""

import os
os.environ["FAISS_DISABLE_CPU_FEATURES"] = "AVX2"
import faiss
import numpy as np
import httpx

from app.config import settings as app_settings
from app.genai.config import settings
from app.genai.logger import logger

GEMINI_EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models"


class RetrievalService:
    def __init__(self):
        self.dimension = 3072  # Gemini Embedding 001 output dimension
        self.index = faiss.IndexFlatL2(self.dimension)
        self.documents = []

    async def _get_embeddings(self, texts: List[str]) -> np.ndarray:
        """Get embeddings from Gemini's text-embedding API."""
        model = settings.retrieval.embedding_model
        url = f"{GEMINI_EMBED_URL}/{model}:batchEmbedContents?key={app_settings.GEMINI_API_KEY}"

        requests_body = [
            {"model": f"models/{model}", "content": {"parts": [{"text": t}]}}
            for t in texts
        ]

        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                url,
                json={"requests": requests_body},
                headers={"Content-Type": "application/json"},
            )
            if resp.status_code != 200:
                logger.error("Gemini embedding error %d: %s", resp.status_code, resp.text[:300])
                raise RuntimeError(f"Gemini embedding API error {resp.status_code}")

            data = resp.json()
            embeddings = [e["values"] for e in data["embeddings"]]
            return np.array(embeddings, dtype=np.float32)

    async def index_documents(self, chunks: List[str]):
        if not chunks:
            return

        logger.info("Indexing %d documents", len(chunks))
        embeddings = await self._get_embeddings(chunks)
        self.index.add(embeddings)
        self.documents.extend(chunks)

    async def search(self, query: str) -> List[str]:
        if self.index.ntotal == 0:
            return []

        logger.info("Searching index: %s", query[:80])
        query_embedding = await self._get_embeddings([query])

        distances, indices = self.index.search(query_embedding, settings.retrieval.top_k)

        results = []
        for i, idx in enumerate(indices[0]):
            if idx != -1 and distances[0][i] < settings.retrieval.similarity_threshold:
                results.append(self.documents[idx])

        logger.info("Search complete: %d matches", len(results))
        return results
