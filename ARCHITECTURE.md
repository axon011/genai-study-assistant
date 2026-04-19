# GenAI Study Assistant - Architecture & Implementation Plan

> Full-stack AI application that generates summaries, flashcards, and quiz questions from uploaded study materials.
> FastAPI | React + TypeScript | GPT-4o | SSE Streaming | Docker | Azure

---

## 1. Project Overview

A consumer-facing AI application that accepts uploaded study materials (PDFs, text, markdown) and generates:
- **Summaries** - structured, topic-aware overviews
- **Flashcards** - question/answer pairs for active recall
- **Quiz Questions** - multiple choice + short answer with scoring

Uses OpenAI GPT-4o with Server-Sent Events (SSE) streaming for real-time responses. Containerized with Docker, deployed on Azure App Service with GitHub Actions CI/CD.

---

## 2. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     CLIENT LAYER                            │
│  React 18 + TypeScript SPA                                  │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────────────┐   │
│  │FileUpload│  │ StudyModes   │  │ StreamingResults     │   │
│  │  (D&D)   │  │ (Summarize/  │  │ (react-markdown +   │   │
│  │          │  │  Flashcard/  │  │  real-time SSE)      │   │
│  │          │  │  Quiz)       │  │                      │   │
│  └────┬─────┘  └──────┬───────┘  └──────────▲──────────┘   │
│       │               │                      │              │
│       │  useUpload()  │  useSSE()           │ SSE chunks   │
└───────┼───────────────┼──────────────────────┼──────────────┘
        │ POST /upload  │ POST /stream-*       │
        ▼               ▼                      │
┌─────────────────────────────────────────────────────────────┐
│                     API GATEWAY                             │
│  CORS Middleware │ Request Validation │ JWT Auth (Phase 3)  │
└───────┬───────────────┬──────────────────────┬──────────────┘
        │               │                      │
        ▼               ▼                      │
┌─────────────────────────────────────────────────────────────┐
│                   APPLICATION LAYER                         │
│  FastAPI (Python 3.11+, async)                              │
│                                                             │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐ │
│  │ File Upload  │  │ SSE Stream    │  │ Rate Limiter     │ │
│  │ + Extraction │  │ Manager       │  │ (Redis sliding   │ │
│  │ (PyPDF2)     │  │               │  │  window)         │ │
│  └──────┬───────┘  └───────┬───────┘  └──────────────────┘ │
│         │                  │                                │
│         │          ┌───────▼───────┐                        │
│         │          │ Prompt Engine │                        │
│         │          │ (Jinja2)      │                        │
│         │          └───────┬───────┘                        │
│         │                  │                                │
│         │          ┌───────▼───────┐                        │
│         │          │ LLM Service   │──── OpenAI GPT-4o API │
│         │          │ (streaming)   │     (streaming mode)   │
│         │          └───────────────┘                        │
└─────────┼───────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────┐
│                      DATA LAYER                             │
│                                                             │
│  ┌─────────────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │ PostgreSQL      │  │ Redis    │  │ File Storage     │  │
│  │ (SQLAlchemy)    │  │          │  │ (uploads/)       │  │
│  │                 │  │ - Rate   │  │                  │  │
│  │ - Users         │  │   limits │  │ - PDFs           │  │
│  │ - Files         │  │ - Cache  │  │ - TXT            │  │
│  │ - Sessions      │  │ - JWT    │  │ - Markdown       │  │
│  │                 │  │   blackl.│  │                  │  │
│  └─────────────────┘  └──────────┘  └──────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. User uploads a PDF/text/markdown file via the React frontend
2. FastAPI receives the file, extracts text content, stores metadata in PostgreSQL
3. User selects a study mode (Summarize / Flashcards / Quiz)
4. Backend checks rate limits (Redis), sanitizes input, builds prompt from Jinja2 template
5. GPT-4o streams tokens back via OpenAI API; FastAPI relays as SSE events
6. React `useSSE` hook renders tokens in real-time; cost tracker logs usage

---

## 3. Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Backend** | FastAPI (Python 3.11+) | Async API server, SSE streaming |
| **Frontend** | React 18 + TypeScript | SPA with real-time SSE rendering |
| **AI/LLM** | OpenAI GPT-4o API | Text generation (streaming mode) |
| **Streaming** | Server-Sent Events | Unidirectional real-time updates |
| **Database** | PostgreSQL + SQLAlchemy | User sessions, file metadata |
| **Cache** | Redis | Rate limiting, response caching |
| **Templates** | Jinja2 | LLM prompt templates |
| **Containers** | Docker + Docker Compose | Multi-service orchestration |
| **CI/CD** | GitHub Actions | Automated test, build, deploy |
| **Cloud** | Azure App Service | Production hosting |
| **Logging** | Structured JSON + tiktoken | LLMOps cost tracking |

---

## 4. Repository Structure

```
genai-study-assistant/
├── .github/workflows/              # CI/CD pipelines
├── .gitignore
├── .env.example
├── docker-compose.yml              # FastAPI + React + Postgres + Redis
├── README.md
├── ARCHITECTURE.md                 # This file
│
├── backend/
│   ├── Dockerfile                  # Multi-stage build
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/
│   │   ├── env.py
│   │   ├── script.py.mako
│   │   └── versions/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                 # FastAPI entry point
│   │   ├── config.py              # Environment config (pydantic-settings)
│   │   ├── database.py            # Async engine + session factory
│   │   ├── middleware/
│   │   │   ├── __init__.py
│   │   │   └── error_handler.py   # Consistent JSON error responses
│   │   ├── api/
│   │   │   ├── __init__.py
│   │   │   ├── routes/
│   │   │   │   ├── __init__.py
│   │   │   │   ├── health.py      # GET /api/v1/health
│   │   │   │   ├── upload.py      # POST /api/v1/upload
│   │   │   │   └── study_modes.py # POST /api/v1/stream-summarize (+ flashcards, quiz)
│   │   │   └── schemas/
│   │   │       ├── __init__.py
│   │   │       ├── upload.py      # FileUploadResponse
│   │   │       └── study_modes.py # SummarizeRequest, StreamChunkEvent, etc.
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── file_extractor.py  # PDF/TXT/MD text extraction
│   │   │   ├── llm_service.py     # OpenAI GPT-4o streaming + cost tracking
│   │   │   ├── prompt_service.py  # Jinja2 template renderer
│   │   │   └── rate_limiter.py    # Redis sliding window rate limiter
│   │   ├── prompts/
│   │   │   ├── __init__.py
│   │   │   ├── loader.py
│   │   │   └── templates/
│   │   │       ├── summarize.j2
│   │   │       ├── flashcard.j2   # Phase 2
│   │   │       └── quiz.j2        # Phase 2
│   │   └── models/
│   │       ├── __init__.py
│   │       ├── base.py            # DeclarativeBase + TimestampMixin
│   │       ├── user.py
│   │       ├── file.py
│   │       └── session.py
│   └── tests/
│       ├── __init__.py
│       ├── conftest.py
│       ├── test_file_extractor.py
│       ├── test_upload_endpoint.py
│       ├── test_stream_summarize.py
│       ├── test_prompt_service.py
│       ├── test_rate_limiter.py
│       └── fixtures/
│           ├── sample.pdf
│           ├── sample.txt
│           └── sample.md
│
├── frontend/
│   ├── Dockerfile
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── App.css
│       ├── config.ts
│       ├── types/
│       │   ├── index.ts
│       │   └── api.ts             # TypeScript interfaces matching backend schemas
│       ├── api/
│       │   └── client.ts          # fetch-based API client + SSE parser
│       ├── hooks/
│       │   ├── useUpload.ts       # File upload state management
│       │   ├── useSSE.ts          # SSE streaming state management
│       │   └── useAuth.ts         # Phase 3
│       ├── components/
│       │   ├── Layout.tsx
│       │   ├── FileUpload.tsx     # Drag & drop + file picker
│       │   ├── StreamingResults.tsx # Real-time markdown rendering
│       │   └── CostDisplay.tsx    # Token count + cost tracking UI
│       └── context/
│           └── AuthContext.tsx     # Phase 3
│
└── docs/
    └── api.md
```

---

## 5. API Contract

### 5.1 File Upload

```
POST /api/v1/upload  (multipart/form-data)
```

Accepts PDF, TXT, or Markdown files up to 50MB. Returns file metadata and extracted text preview. Rate limited to 10 uploads/hour per user.

**Response (201):**
```json
{
  "file_id": "uuid",
  "original_filename": "chapter1.pdf",
  "file_type": "pdf",
  "file_size_bytes": 1048576,
  "char_count": 45000,
  "text_preview": "First 500 characters of extracted text...",
  "status": "ready",
  "created_at": "2026-04-02T10:00:00Z"
}
```

### 5.2 Study Mode Endpoints (SSE Streaming)

```
POST /api/v1/stream-summarize  -> SSE stream
POST /api/v1/stream-flashcards -> SSE stream  (Phase 2)
POST /api/v1/stream-quiz       -> SSE stream  (Phase 2)
```

**Request body:**
```json
{
  "file_id": "uuid",
  "custom_instructions": "optional user guidance"
}
```

**SSE Events:**
```
event: stream
data: {"chunk": "text...", "tokens_used": 5, "cumulative_cost": 0.001}

event: complete
data: {"total_tokens": 450, "total_cost": 0.0045, "session_id": "uuid", "input_tokens": 330, "output_tokens": 120}

event: error
data: {"error": "description of what went wrong"}
```

### 5.3 Supporting Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/health` | GET | Health check (DB, Redis, OpenAI connectivity) |
| `/api/v1/sessions` | GET | List user's past study sessions |
| `/api/v1/sessions/{id}` | GET | Session details with generated content |
| `/api/v1/metrics` | GET | Active streams, error rate, latency |

---

## 6. Database Models

### User
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK, default uuid4 |
| `email` | String(255) | Unique, nullable (Phase 1 has no auth) |
| `created_at` | DateTime(tz) | server_default=now() |
| `updated_at` | DateTime(tz) | onupdate=now() |

### File
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK -> user.id, nullable |
| `original_filename` | String(500) | not null |
| `file_type` | String(10) | not null (pdf, txt, md) |
| `file_size_bytes` | BigInteger | not null |
| `storage_path` | String(1000) | not null |
| `extracted_text` | Text | nullable |
| `text_preview` | String(1000) | first ~500 chars |
| `char_count` | Integer | nullable |
| `status` | String(20) | default "uploaded" (uploaded/processing/ready/error) |
| `error_message` | Text | nullable |
| `created_at` / `updated_at` | DateTime(tz) | auto |

### Session
| Column | Type | Constraints |
|--------|------|-------------|
| `id` | UUID | PK |
| `user_id` | UUID | FK -> user.id, nullable |
| `file_id` | UUID | FK -> file.id, not null |
| `mode` | String(20) | summarize / flashcard / quiz |
| `prompt_template` | String(100) | e.g., "summarize.j2" |
| `model_name` | String(50) | e.g., "gpt-4o" |
| `input_tokens` | Integer | nullable |
| `output_tokens` | Integer | nullable |
| `total_tokens` | Integer | nullable |
| `estimated_cost` | Float | nullable |
| `result_text` | Text | full generated output |
| `status` | String(20) | pending/streaming/completed/error |
| `error_message` | Text | nullable |
| `started_at` / `completed_at` | DateTime(tz) | nullable |
| `created_at` | DateTime(tz) | auto |

---

## 7. Key Design Decisions

### SSE vs WebSocket
SSE was chosen because this is a read-heavy use case (server streams to client). SSE is simpler, HTTP-based, has built-in browser API (EventSource), and better Azure App Service support. WebSocket adds bidirectional complexity without benefit here.

### POST for SSE endpoints (not GET)
The request body contains `file_id` and optional parameters. The browser's native `EventSource` API only supports GET, so the frontend uses `fetch()` with `ReadableStream` to parse SSE manually. This is a common modern pattern used by ChatGPT and similar apps.

### Redis for Rate Limiting
In-memory counters break when scaling to multiple server instances. Redis sliding window rate limits work across distributed containers and double as a response cache layer.

### Jinja2 Prompt Templates
Simple, version-control friendly, and testable. For three study modes, Jinja2 is sufficient. If adding complex multi-step reasoning later, can migrate to LangChain prompt chains.

### JWT Authentication (Phase 3)
Stateless tokens scale well with distributed systems. Refresh token rotation for security. Blacklist stored in Redis for logout support.

### Monorepo Structure
Single repository with `/backend` and `/frontend` directories. Easier to coordinate changes, single CI/CD pipeline, and cleaner for portfolio demonstration.

---

## 8. Docker Compose Services

| Service | Image / Build | Ports | Purpose |
|---------|--------------|-------|---------|
| `backend` | `./backend/Dockerfile` | 8000:8000 | FastAPI API server |
| `frontend` | `./frontend/Dockerfile` | 3000:3000 | React dev server (Vite) |
| `db` | `postgres:16-alpine` | 5433:5432 | PostgreSQL database |
| `redis` | `redis:7-alpine` | 6379:6379 | Rate limiting + cache |

Named volumes: `pgdata`, `redisdata`, `uploads`

---

## 9. Implementation Phases

| Phase | Focus | Duration | Deliverable |
|-------|-------|----------|-------------|
| **1** | Core MVP: Upload + Summarize | 2 weeks | Working end-to-end demo |
| **2** | All 3 Modes + Rate Limiting | 2 weeks | Full feature parity |
| **3** | Auth + User Management | 1 week | User system + credits |
| **4** | LLMOps + Monitoring | 1 week | Cost tracking + logging |
| **5** | CI/CD + Deployment | 1 week | Automated pipeline |
| **6** | Polish + Advanced Features | 1+ weeks | Production-ready app |

### Phase 1: Core MVP (8 Sub-Tasks)

| Step | Task | Dependencies | What It Delivers |
|------|------|-------------|-----------------|
| 1 | Project scaffolding + Docker Compose | None | All 4 containers boot, health check works |
| 2 | Database models + Alembic migrations | Step 1 | User/File/Session tables in PostgreSQL |
| 3 | Upload endpoint + file extraction | Steps 1-2 | `POST /upload` works via curl |
| 4 | Jinja2 prompt template + LLM service | Step 1 | GPT-4o streaming works in isolation |
| 5 | SSE streaming endpoint | Steps 2-4 | `POST /stream-summarize` streams via curl |
| 6 | Frontend types + API client | Step 1 | TypeScript interfaces + fetch client |
| 7 | React components + hooks | Steps 5-6 | Full UI with real-time streaming |
| 8 | Tests | Steps 1-7 | Unit + integration test suite |

### Phase 2: Complete Study Modes
- Flashcard mode: prompt template, `num_cards`/`difficulty` params, FlashcardCarousel with flip animation
- Quiz mode: multiple choice + short answer generation, QuizView with scoring logic
- Redis rate limiter: 10 uploads/hr, 50 generations/hr per user, proper 429 responses
- Input sanitization: prompt injection prevention (regex + allowlist), HTML stripping
- Session history: list/view/delete past study sessions

### Phase 3: Authentication
- JWT auth with refresh token rotation, login/register endpoints
- User profiles with tier system (free/pro) and credit tracking
- React AuthContext, protected routes, login form

### Phase 4: LLMOps & Monitoring
- Structured JSON logging with correlation IDs for request tracing
- Token counting (tiktoken) and per-user cost aggregation
- `GET /metrics` endpoint with active streams, error rates, latency
- Cost dashboard in frontend showing usage trends

### Phase 5: CI/CD & Deployment
- GitHub Actions: lint + type-check + test on PR, Docker build, deploy to Azure
- Multi-stage Docker builds optimized for size, Trivy security scanning
- Azure App Service deployment with Key Vault for secrets

### Phase 6: Polish & Advanced Features
- Export to PDF/CSV, dark mode, keyboard shortcuts
- Performance: code splitting, lazy loading, database indexing
- Mobile responsive design, accessibility (WCAG), loading skeletons

---

## 10. Dependencies

### Python (`backend/requirements.txt`)

| Package | Version | Purpose |
|---------|---------|---------|
| `fastapi` | 0.115.12 | Web framework |
| `uvicorn[standard]` | 0.34.2 | ASGI server |
| `python-multipart` | 0.0.20 | File upload parsing |
| `sqlalchemy[asyncio]` | 2.0.40 | ORM with async support |
| `asyncpg` | 0.30.0 | PostgreSQL async driver |
| `alembic` | 1.15.2 | Database migrations |
| `redis[hiredis]` | 5.3.0 | Redis client |
| `openai` | 1.75.0 | OpenAI SDK (async streaming) |
| `pypdf2` | 3.0.1 | PDF text extraction |
| `jinja2` | 3.1.6 | Prompt templates |
| `pydantic-settings` | 2.9.1 | Environment config |
| `python-dotenv` | 1.1.0 | .env file loading |
| `pytest` | 8.3.5 | Testing framework |
| `pytest-asyncio` | 0.26.0 | Async test support |
| `httpx` | 0.28.1 | Async HTTP test client |

### NPM (`frontend/package.json`)

| Package | Purpose |
|---------|---------|
| `react` ^18.3.1 | UI framework |
| `react-dom` ^18.3.1 | DOM renderer |
| `react-markdown` ^9.0.3 | Streaming markdown rendering |
| `typescript` ^5.6.0 | Type safety |
| `vite` ^6.0.0 | Build tool + dev server |
| `vitest` ^2.1.0 | Test runner |

---

## 11. Milestone Timeline

Starting April 2, 2026:

| Date | Milestone |
|------|-----------|
| April 16 | Phase 1 -- Working MVP demo |
| April 30 | Phase 2 -- All 3 study modes |
| May 7 | Phase 3 -- Auth + user system |
| May 14 | Phase 4 -- LLMOps + monitoring |
| May 21 | Phase 5 -- CI/CD automated |
| May 28+ | Phase 6 -- Polish + launch |

**Total estimated effort: ~170 hours across 8-10 weeks**
