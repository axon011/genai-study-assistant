from __future__ import annotations

import logging

from sentence_transformers import CrossEncoder

from app.config import settings

logger = logging.getLogger(__name__)

_reranker: CrossEncoder | None = None


def get_reranker() -> CrossEncoder:
    global _reranker
    if _reranker is None:
        logger.info("Loading cross-encoder reranker")
        _reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
    return _reranker


class RerankerService:
    def __init__(self) -> None:
        self.model = get_reranker()

    def rerank(
        self, query: str, chunks: list[dict], top_k: int | None = None
    ) -> list[dict]:
        if not chunks:
            return []
        k = top_k or settings.RERANK_TOP_K
        pairs = [(query, c["text"]) for c in chunks]
        scores = self.model.predict(pairs)
        ranked = sorted(
            zip(chunks, scores), key=lambda x: x[1], reverse=True
        )
        return [
            {**chunk, "rerank_score": round(float(score), 4)}
            for chunk, score in ranked[:k]
        ]
