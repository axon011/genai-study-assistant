# RAG Implementation Plan — GenAI Study Assistant

> Transform from prompt-stuffing to a real RAG pipeline with vector search, citations, and multi-document support.

## Current State (as of 2026-04-23)
- Upload PDF/TXT/MD → full text dumped into LLM prompt → summary/flashcards/quiz
- No chunking, no embeddings, no vector DB, no retrieval
- Phase 1-2 complete: all 3 study modes work end-to-end with SSE streaming
- Stack: FastAPI + React + TypeScript + PostgreSQL + Redis + Docker + GLM-4.5

## Target State
- Upload → chunk → embed → store in ChromaDB
- User asks question or requests study mode → retrieve relevant chunks → LLM generates with citations
- Multi-document collections, conversational chat, cross-encoder reranking

---

## Phase 1: ChromaDB + Chunking Pipeline

### 1a. Add ChromaDB to Docker

**docker-compose.yml** — add new service:
```yaml
  chromadb:
    image: chromadb/chroma:0.6.3
    container_name: study-chromadb
    ports:
      - "8100:8000"
    volumes:
      - chromadata:/chroma/chroma
    environment:
      - ANONYMIZED_TELEMETRY=false
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/api/v1/heartbeat"]
      interval: 10s
      timeout: 5s
      retries: 5
```
Add `chromadata:` to the volumes section.

Add to backend service environment:
```yaml
  - CHROMA_URL=http://chromadb:8000
```

### 1b. Add dependencies

**backend/requirements.txt** — add:
```
chromadb-client==0.6.3
langchain-text-splitters==0.3.8
sentence-transformers==3.4.1
```

**backend/app/config.py** — add:
```python
CHROMA_URL: str = "http://chromadb:8000"
CHUNK_SIZE: int = 500
CHUNK_OVERLAP: int = 100
EMBEDDING_MODEL: str = "all-MiniLM-L6-v2"
```

### 1c. Chunking Service

**Create `backend/app/services/chunking_service.py`:**
```python
from langchain_text_splitters import RecursiveCharacterTextSplitter
from app.config import settings


class ChunkingService:
    def __init__(self) -> None:
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def chunk_text(
        self, text: str, file_id: str, filename: str
    ) -> list[dict]:
        chunks = self.splitter.split_text(text)
        return [
            {
                "id": f"{file_id}_chunk_{i}",
                "text": chunk,
                "metadata": {
                    "file_id": file_id,
                    "filename": filename,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                },
            }
            for i, chunk in enumerate(chunks)
        ]
```

### 1d. Embedding + Vector Store Service

**Create `backend/app/services/vector_store.py`:**
```python
import chromadb
from sentence_transformers import SentenceTransformer
from app.config import settings

_model: SentenceTransformer | None = None
_client: chromadb.HttpClient | None = None


def get_embedding_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(settings.EMBEDDING_MODEL)
    return _model


def get_chroma_client() -> chromadb.HttpClient:
    global _client
    if _client is None:
        _client = chromadb.HttpClient(host=settings.CHROMA_URL.replace("http://", "").split(":")[0],
                                       port=int(settings.CHROMA_URL.split(":")[-1]))
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
        texts = [c["text"] for c in chunks]
        embeddings = self.model.encode(texts).tolist()
        self.collection.add(
            ids=[c["id"] for c in chunks],
            documents=texts,
            embeddings=embeddings,
            metadatas=[c["metadata"] for c in chunks],
        )

    def query(
        self,
        query_text: str,
        top_k: int = 5,
        file_ids: list[str] | None = None,
    ) -> list[dict]:
        query_embedding = self.model.encode([query_text]).tolist()
        where_filter = None
        if file_ids:
            where_filter = {"file_id": {"$in": file_ids}}

        results = self.collection.query(
            query_embeddings=query_embedding,
            n_results=top_k,
            where=where_filter,
            include=["documents", "metadatas", "distances"],
        )

        return [
            {
                "text": doc,
                "metadata": meta,
                "score": 1 - dist,  # cosine similarity
            }
            for doc, meta, dist in zip(
                results["documents"][0],
                results["metadatas"][0],
                results["distances"][0],
            )
        ]

    def delete_file_chunks(self, file_id: str) -> None:
        self.collection.delete(where={"file_id": file_id})
```

### 1e. Modify Upload Endpoint

In `backend/app/api/routes/upload.py`, after text extraction succeeds, add:
```python
from app.services.chunking_service import ChunkingService
from app.services.vector_store import VectorStoreService

# After file_record is committed to DB:
chunker = ChunkingService()
chunks = chunker.chunk_text(
    text=extracted_text,
    file_id=str(file_id),
    filename=file.filename,
)
vector_store = VectorStoreService()
vector_store.add_chunks(chunks)
```

Update File model status flow: `uploaded → processing → chunking → ready`

---

## Phase 2: Retrieval-Augmented Generation

### 2a. Modify study_modes.py

Replace the current approach (full text in prompt) with retrieval:

```python
async def stream_mode_response(
    *,
    db: AsyncSession,
    mode: str,
    file_record: FileModel,
    prompt_context: dict[str, Any],
) -> StreamingResponse:
    # NEW: Retrieve relevant chunks instead of using full text
    vector_store = VectorStoreService()
    
    # Build a query from the mode + custom instructions
    query = build_retrieval_query(mode, prompt_context)
    
    retrieved_chunks = vector_store.query(
        query_text=query,
        top_k=8,
        file_ids=[str(file_record.id)],
    )
    
    # Format retrieved context with source citations
    context_with_citations = format_context(retrieved_chunks)
    
    prompt_service = PromptService()
    messages = prompt_service.render_messages(
        mode=mode,
        text=context_with_citations,  # Retrieved chunks, not full text
        **prompt_context,
    )
    # ... rest stays the same
```

### 2b. Helper functions

```python
def build_retrieval_query(mode: str, context: dict) -> str:
    custom = context.get("custom_instructions", "") or ""
    if mode == "summarize":
        return f"key concepts main topics important points {custom}"
    elif mode == "flashcard":
        return f"definitions concepts terms facts {custom}"
    elif mode == "quiz":
        return f"testable knowledge facts concepts {custom}"
    return custom or "important content"


def format_context(chunks: list[dict]) -> str:
    parts = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk["metadata"]
        source = f"[Source {i}: {meta['filename']}, Chunk {meta['chunk_index']+1}]"
        parts.append(f"{source}\n{chunk['text']}")
    return "\n\n---\n\n".join(parts)
```

### 2c. Update prompt templates

**summarize.j2:**
```
Summarize the following study material using ONLY the provided context.
Include source citations like [Source 1], [Source 2] when referencing specific information.

---
{{ text }}
---
{% if custom_instructions %}
Additional instructions: {{ custom_instructions }}
{% endif %}
```

Same pattern for flashcard.j2 and quiz.j2 — add citation instruction.

---

## Phase 3: Citations in Frontend

### 3a. Parse citations from LLM response

In `StreamingResults.tsx`, add citation highlighting:
```tsx
// Regex to find [Source N: filename, Chunk M] patterns
// Render them as styled badges that link to the source chunk
```

### 3b. Source panel

Show a collapsible "Sources" section below the response listing which chunks were used, with the ability to expand and read the original text.

---

## Phase 4: Multi-Document Collections

### 4a. Collection model

Add to database:
```python
class Collection(TimestampMixin, Base):
    __tablename__ = "collections"
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    # files relationship via junction table
```

### 4b. API endpoints

```
POST   /api/v1/collections              — create collection
GET    /api/v1/collections              — list collections  
POST   /api/v1/collections/{id}/files   — add file to collection
DELETE /api/v1/collections/{id}/files/{fid} — remove file
POST   /api/v1/collections/{id}/query   — query across all files in collection
```

### 4c. Frontend

- Collection picker dropdown before upload
- "My Collections" sidebar section
- Query interface that searches across all docs in a collection

---

## Phase 5: Chat Interface

### 5a. Backend

Add chat endpoint:
```
POST /api/v1/chat  (SSE stream)
{
  "collection_id": "uuid",
  "message": "What is attention mechanism?",
  "conversation_id": "uuid" (optional, creates new if omitted)
}
```

- Store conversation turns in Postgres (Conversation + Message models)
- Include last N messages as chat history in LLM prompt
- Retrieve relevant chunks for each new message

### 5b. Frontend

- New "Chat" tab alongside Summarize/Flashcards/Quiz
- Chat bubble UI with user/assistant messages
- Source citations inline
- Conversation list in sidebar

---

## Phase 6: Cross-Encoder Reranking

### 6a. Add reranker

```python
from sentence_transformers import CrossEncoder

class RerankerService:
    def __init__(self):
        self.model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
    
    def rerank(self, query: str, chunks: list[dict], top_k: int = 5) -> list[dict]:
        pairs = [(query, c["text"]) for c in chunks]
        scores = self.model.predict(pairs)
        ranked = sorted(zip(chunks, scores), key=lambda x: x[1], reverse=True)
        return [c for c, _ in ranked[:top_k]]
```

### 6b. Two-stage retrieval

1. ChromaDB retrieves top-20 by cosine similarity (fast, approximate)
2. Cross-encoder reranks to top-5 (slow, precise)

This is the pattern used in production RAG systems and shows depth.

---

## Phase 7: Frontend Updates

- Chat UI component
- Source citation badges (clickable, expandable)
- Collection management UI
- Document chunk viewer (see what was retrieved)
- Upload progress showing chunking/embedding status

---

## Docker Compose Final State

```
services:
  db:          postgres:16-alpine     (port 5433)
  redis:       redis:7-alpine         (port 6379)
  chromadb:    chromadb/chroma:0.6.3  (port 8100)
  backend:     FastAPI                (port 8000)
  frontend:    React/Vite             (port 3000)
```

---

## Resume Impact

**Project title:** "RAG-Powered Study Assistant"

**Bullet points:**
- Built a RAG pipeline with document chunking (LangChain), sentence-transformer embeddings, and ChromaDB vector search for multi-document Q&A
- Implemented two-stage retrieval (cosine similarity + cross-encoder reranking) with citation-grounded generation
- Real-time SSE streaming with FastAPI, React/TypeScript frontend with chat interface
- Dockerized 5-service architecture: FastAPI, React, PostgreSQL, Redis, ChromaDB

**Skills demonstrated:** RAG, Vector DBs, Embeddings, Reranking, LangChain, LLMOps, Full-Stack, Docker, SSE Streaming

---

## File Changes Summary

| Action | File | What |
|--------|------|------|
| CREATE | `backend/app/services/chunking_service.py` | LangChain text splitter |
| CREATE | `backend/app/services/vector_store.py` | ChromaDB + embeddings |
| CREATE | `backend/app/services/reranker.py` | Cross-encoder reranking |
| CREATE | `backend/app/models/collection.py` | Collection DB model |
| CREATE | `backend/app/api/routes/chat.py` | Chat endpoint |
| CREATE | `backend/app/api/routes/collections.py` | Collection CRUD |
| CREATE | `frontend/src/components/ChatView.tsx` | Chat UI |
| CREATE | `frontend/src/components/SourcePanel.tsx` | Citation viewer |
| CREATE | `frontend/src/components/CollectionPicker.tsx` | Collection selector |
| MODIFY | `backend/requirements.txt` | Add chromadb-client, langchain-text-splitters, sentence-transformers |
| MODIFY | `backend/app/config.py` | Add CHROMA_URL, CHUNK_SIZE, EMBEDDING_MODEL |
| MODIFY | `backend/app/api/routes/upload.py` | Add chunking + embedding on upload |
| MODIFY | `backend/app/api/routes/study_modes.py` | Replace full-text with retrieval |
| MODIFY | `backend/app/prompts/templates/*.j2` | Add citation instructions |
| MODIFY | `docker-compose.yml` | Add chromadb service |
| MODIFY | `frontend/src/App.tsx` | Add chat tab, collection picker |
| MODIFY | `frontend/src/App.css` | Chat UI styles, citation styles |
