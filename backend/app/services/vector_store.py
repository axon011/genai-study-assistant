import logging

import chromadb
from sentence_transformers import SentenceTransformer

from app.config import settings

logger = logging.getLogger(__name__)

_model: SentenceTransformer | None = None
_client: chromadb.HttpClient | None = None


def get_embedding_model() -> SentenceTransformer:
    global _model
    if _model is None:
        logger.info("Loading embedding model: %s", settings.EMBEDDING_MODEL)
        _model = SentenceTransformer(settings.EMBEDDING_MODEL)
    return _model


def get_chroma_client() -> chromadb.HttpClient:
    global _client
    if _client is None:
        _client = chromadb.HttpClient(
            host=settings.CHROMA_HOST,
            port=settings.CHROMA_PORT,
        )
    return _client


class VectorStoreService:
    COLLECTION_NAME = "study_documents"

    def __init__(self) -> None:
        self.client = get_chroma_client()
        self.model = get_embedding_model()
        self.collection = self.client.get_or_create_collection(
            name=self.COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )

    def add_chunks(self, chunks: list[dict]) -> None:
        if not chunks:
            return
        texts = [c["text"] for c in chunks]
        embeddings = self.model.encode(texts).tolist()
        self.collection.add(
            ids=[c["id"] for c in chunks],
            documents=texts,
            embeddings=embeddings,
            metadatas=[c["metadata"] for c in chunks],
        )
        logger.info("Stored %d chunks in ChromaDB", len(chunks))

    def query(
        self,
        query_text: str,
        top_k: int | None = None,
        file_ids: list[str] | None = None,
    ) -> list[dict]:
        k = top_k or settings.RETRIEVAL_TOP_K
        query_embedding = self.model.encode([query_text]).tolist()

        where_filter = None
        if file_ids:
            if len(file_ids) == 1:
                where_filter = {"file_id": file_ids[0]}
            else:
                where_filter = {"file_id": {"$in": file_ids}}

        results = self.collection.query(
            query_embeddings=query_embedding,
            n_results=k,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )

        if not results["documents"] or not results["documents"][0]:
            return []

        return [
            {
                "text": doc,
                "metadata": meta,
                "score": round(1 - dist, 4),
            }
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            )
        ]

    def delete_file_chunks(self, file_id: str) -> None:
        self.collection.delete(where={"file_id": file_id})
        logger.info("Deleted chunks for file %s", file_id)
