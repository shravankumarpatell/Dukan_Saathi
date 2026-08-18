from typing import Optional, List, Dict
"""RAG retrieval — local hashed embeddings (no external embedding API)."""

import os
os.environ["FAISS_DISABLE_CPU_FEATURES"] = "AVX2"
import faiss
import numpy as np

from app.genai.config import settings
from app.genai.logger import logger

EMBED_DIM = 256


def _local_embed(texts: List[str]) -> np.ndarray:
    """Deterministic character n-gram hash embeddings. Good enough for in-process RAG."""
    out = []
    for t in texts:
        vec = np.zeros(EMBED_DIM, dtype=np.float32)
        s = (t or "").lower()
        for i, ch in enumerate(s):
            vec[hash(("u", ch)) % EMBED_DIM] += 1.0
            if i + 2 <= len(s):
                vec[hash(("b", s[i:i + 2])) % EMBED_DIM] += 0.6
            if i + 3 <= len(s):
                vec[hash(("t", s[i:i + 3])) % EMBED_DIM] += 0.4
        n = float(np.linalg.norm(vec))
        if n:
            vec /= n
        out.append(vec)
    return np.array(out, dtype=np.float32)


class RetrievalService:
    def __init__(self):
        self.dimension = EMBED_DIM
        self.index = faiss.IndexFlatIP(self.dimension)
        self.documents = []

    async def _get_embeddings(self, texts: List[str]) -> np.ndarray:
        return _local_embed(texts)

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
        scores, indices = self.index.search(query_embedding, settings.retrieval.top_k)
        results = []
        for i, idx in enumerate(indices[0]):
            if idx != -1 and scores[0][i] >= settings.retrieval.similarity_threshold:
                results.append(self.documents[idx])
        logger.info("Search complete: %d matches", len(results))
        return results
