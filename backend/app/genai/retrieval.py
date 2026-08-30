from typing import Optional, List, Dict
"""RAG retrieval service — FAISS index with local hashed embeddings.

Chat and vision use Vertex Gemini (ADC). Embeddings stay local so retrieval
does not need a Gemini API key or a separate Vertex embedding endpoint.
"""

import hashlib
import os
os.environ["FAISS_DISABLE_CPU_FEATURES"] = "AVX2"
import faiss
import numpy as np

from app.genai.config import settings
from app.genai.logger import logger

EMBED_DIM = 256


def _hash_embed(text: str, dim: int = EMBED_DIM) -> np.ndarray:
    vec = np.zeros(dim, dtype=np.float32)
    for tok in (text or "").lower().split():
        h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
        vec[h % dim] += 1.0
    n = np.linalg.norm(vec)
    if n:
        vec /= n
    return vec


class RetrievalService:
    def __init__(self):
        self.dimension = EMBED_DIM
        self.index = faiss.IndexFlatL2(self.dimension)
        self.documents = []

    async def _get_embeddings(self, texts: List[str]) -> np.ndarray:
        return np.vstack([_hash_embed(t) for t in texts]).astype(np.float32)

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
