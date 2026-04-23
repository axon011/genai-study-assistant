# GenAI Study Assistant - Complete Project Handoff

> **Purpose**: This document gives a new AI coding agent (Codex, Claude, Cursor, etc.) full context to continue development. Read this first, then ARCHITECTURE.md for design specs.

---

## Project Summary

A full-stack AI application that accepts uploaded study materials (PDF, TXT, Markdown) and generates summaries, flashcards, and quiz questions using LLM streaming. Built with FastAPI + React + TypeScript + PostgreSQL + Redis + Docker.

**Repo**: `C:/Users/Aravind/Desktop/workspace/GIT/genai-study-assistant/`
**Remote**: https://github.com/axon011/genai-study-assistant.git
**Branch**: `main` (2 commits as of 2026-04-23)

---

## Current State: Phase 1 MVP (~85% complete)

### What IS built and committed

| Component | Status | Notes |
|-----------|--------|-------|
| Docker Compose (4 services) | Done | PostgreSQL, Redis, FastAPI, React Vite |
| Backend FastAPI entry point | Done | `backend/app/main.py` — CORS, lifespan, health check |
| Config (pydantic-settings) | Done | `backend/app/config.py` — reads `.env` |
| Database models (User, File, Session) | Done | UUID PKs, TimestampMixin, relationships |
| Database engine (async SQLAlchemy) | Done | `backend/app/database.py` — NullPool, asyncpg |
| File upload endpoint | Done | `POST /api/v1/upload` — validates, extracts text, stores in DB |
| File extractor service | Done | PDF (PyPDF2), TXT, MD extraction |
| LLM service | Done | OpenAI-compatible streaming, tiktoken counting, cost estimation |
| Prompt service (Jinja2) | Done | Renders system + user messages from `.j2` templates |
| Summarize SSE endpoint | Done | `POST /api/v1/stream-summarize` — full SSE streaming |
| Summarize prompt template | Done | `backend/app/prompts/templates/summarize.j2` |
| Pydantic schemas | Done | `FileUploadResponse`, `SummarizeRequest` |
| Frontend: FileUpload component | Done | Drag & drop, file picker, success state with preview |
| Frontend: StreamingResults | Done | Real-time markdown rendering with react-markdown |
| Frontend: CostDisplay | Done | Token count + cost breakdown |
| Frontend: useUpload hook | Done | Upload state machine (idle/uploading/success/error) |
| Frontend: useSSE hook | Done | SSE streaming state machine |
| Frontend: API client | Done | `fetch()` + `ReadableStream` SSE parser |
| Frontend: TypeScript types | Done | Full API type definitions |
| Frontend: CSS styling | Done | Clean, minimal, light theme |

### What is NOT built yet (still in Phase 1)

| Missing | Priority | Details |
|---------|----------|---------|
| **Alembic migrations** | HIGH | `alembic/` dir referenced in ARCHITECTURE.md but NOT in the repo. Currently using `Base.metadata.create_all` in lifespan (auto-creates tables). Need `alembic init`, `alembic.ini`, `env.py`, initial migration. |
| **Rate limiter service** | MEDIUM | `backend/app/services/rate_limiter.py` referenced in ARCHITECTURE.md but NOT in repo. Redis sliding window impl needed. |
| **Error handler middleware** | LOW | `backend/app/middleware/error_handler.py` referenced but NOT in repo. |
| **Tests** | MEDIUM | `backend/tests/` dir referenced but NOT in repo. No test files exist. |
| **Test fixtures** | MEDIUM | `backend/tests/fixtures/` (sample.pdf, sample.txt, sample.md) not created. |
| **End-to-end testing** | HIGH | App has NEVER been run. Docker compose has not been tested. |
| **Health check (full)** | LOW | Current `/api/v1/health` returns `{"status": "ok"}` without checking DB/Redis connectivity. |
| **Frontend `vite.config.ts`** | CHECK | Needs proxy config for `/api` to avoid CORS in dev. Currently relies on CORS middleware. |

---

## LLM Provider Configuration

The app was switched from GPT-4o to **GLM-4.5 (Zhipu AI)** in commit `d8c72c0`.

```env
# .env (create from .env.example)
LLM_API_KEY=<zhipu-ai-key>
LLM_BASE_URL=https://api.z.ai/api/coding/paas/v4
LLM_MODEL=glm-4.5
```

The `LLMService` uses the OpenAI SDK with a custom `base_url`, so it works with ANY OpenAI-compatible API (OpenAI, Zhipu, Ollama, etc.). The API key is stored in the workspace `.env` at `C:/Users/Aravind/Desktop/workspace/GIT/.env` as `GLM_API_KEY`.

**Important**: The `LLMService` has a conditional that only adds `stream_options={"include_usage": True}` for OpenAI endpoints (checks if `openai.com` is in the base URL). Non-OpenAI providers skip this.

---

## File-by-File Reference

### Backend (`backend/`)

| File | Purpose | Key Details |
|------|---------|-------------|
| `app/main.py` | FastAPI app | Lifespan creates tables, CORS allows all origins, includes upload + study_modes routers |
| `app/config.py` | Settings | `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `DATABASE_URL`, `REDIS_URL`, `MAX_FILE_SIZE_MB=50`, `ALLOWED_FILE_TYPES` |
| `app/database.py` | Async engine | `create_async_engine` with `NullPool`, `async_sessionmaker`, `get_db()` dependency |
| `app/models/base.py` | ORM base | `Base(DeclarativeBase)`, `TimestampMixin` (UUID pk, created_at, updated_at) |
| `app/models/user.py` | User model | Only has `email` (nullable). Relationships: `files`, `sessions` |
| `app/models/file.py` | File model | `original_filename`, `file_type`, `file_size_bytes`, `storage_path`, `extracted_text`, `text_preview`, `char_count`, `status`, `error_message`. Relationships: `user`, `sessions` |
| `app/models/session.py` | Session model | `file_id` (FK), `mode`, `prompt_template`, `model_name`, token counts, `estimated_cost`, `result_text`, `status`, timestamps. Relationships: `user`, `file` |
| `app/models/__init__.py` | Imports | **Must import all models** so SQLAlchemy sees them for `create_all` |
| `app/api/routes/upload.py` | Upload endpoint | Validates type/size, saves to `uploads/`, extracts text, creates File record, returns FileUploadResponse |
| `app/api/routes/study_modes.py` | Summarize endpoint | Loads file from DB, renders prompt via PromptService, creates Session, streams via LLMService, updates session with results |
| `app/api/schemas/upload.py` | Pydantic schema | `FileUploadResponse` with `from_attributes=True` |
| `app/api/schemas/study_modes.py` | Pydantic schema | `SummarizeRequest(file_id, custom_instructions)` |
| `app/services/file_extractor.py` | Text extraction | `validate_file_type()`, `validate_file_size()`, `extract_text()` (async via `to_thread`), PyPDF2 for PDF |
| `app/services/llm_service.py` | LLM streaming | `LLMService(api_key, model, base_url)` — `stream_completion()` yields chunk/complete events with token counts and cost |
| `app/services/prompt_service.py` | Prompt rendering | `PromptService.render_messages(mode, text, custom_instructions)` — loads `.j2` template, returns `[system, user]` messages |
| `app/prompts/templates/summarize.j2` | Summary prompt | System: "expert academic tutor". User: "summarize the following..." + optional custom instructions |
| `Dockerfile` | Backend image | Python 3.11-slim, installs deps, runs uvicorn with `--reload` |
| `requirements.txt` | 14 packages | fastapi, uvicorn, sqlalchemy[asyncio], asyncpg, alembic, redis, openai, pypdf2, jinja2, pydantic-settings, tiktoken, httpx |

### Frontend (`frontend/`)

| File | Purpose | Key Details |
|------|---------|-------------|
| `src/App.tsx` | Main app | FileUpload -> (optional instructions) -> Summarize button -> StreamingResults -> CostDisplay |
| `src/config.ts` | API URL | `import.meta.env.VITE_API_URL \|\| ""` |
| `src/api/client.ts` | API client | `uploadFile(file)` — POST multipart. `streamSummarize(request)` — async generator parsing SSE via ReadableStream |
| `src/hooks/useUpload.ts` | Upload hook | State machine: idle -> uploading -> success/error. Returns `{state, data, error, upload, reset}` |
| `src/hooks/useSSE.ts` | Stream hook | State machine: idle -> streaming -> complete/error. Accumulates content string. Returns `{status, content, tokenInfo, error, startStream, reset}` |
| `src/components/FileUpload.tsx` | Upload UI | Drag & drop zone, file picker, success state showing filename/size/preview + "Upload different file" button |
| `src/components/StreamingResults.tsx` | Results UI | Spinner during initial load, streaming markdown with blinking cursor, "Complete" badge when done |
| `src/components/CostDisplay.tsx` | Cost UI | Input/Output/Total tokens + estimated cost in 4-column layout |
| `src/types/api.ts` | TypeScript types | `FileUploadResponse`, `SummarizeRequest`, `StreamChunkEvent`, `StreamCompleteEvent`, `StreamErrorEvent`, `SSEEvent` union |
| `src/App.css` | All styles | Light theme, CSS variables, drop zone, cards, markdown rendering, spinner, cost display |
| `Dockerfile` | Frontend image | Node 20-slim, npm install, runs `npm run dev` (Vite) |
| `package.json` | Dependencies | react 18, react-dom, react-markdown 9, vite 6, typescript 5.6 |

### Infrastructure

| File | Purpose |
|------|---------|
| `docker-compose.yml` | 4 services: `db` (postgres:16-alpine, port 5433), `redis` (redis:7-alpine, port 6379), `backend` (port 8000), `frontend` (port 3000). Named volumes: pgdata, redisdata, uploads. Health checks on db/redis/backend. |
| `.env.example` | Template: `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `DATABASE_URL`, `REDIS_URL` |
| `.gitignore` | Standard Python + Node ignores |
| `AGENTS.md` | Dev conventions: no push without permission, follow ARCHITECTURE.md, no comments unless asked |
| `ARCHITECTURE.md` | 450+ line design doc: system diagram, API contract, DB models, all 6 phases |

---

## Phase 2 Tasks (Next Priority)

From ARCHITECTURE.md, Phase 2 adds:

### 2a. Flashcard Mode
- Create `backend/app/prompts/templates/flashcard.j2` — prompt to generate Q&A pairs as JSON array
- Add `FlashcardRequest` schema (file_id, num_cards: int = 10, difficulty: str = "medium")
- Add `POST /api/v1/stream-flashcards` endpoint in `study_modes.py`
- Add `SYSTEM_PROMPTS["flashcard"]` in `prompt_service.py`
- Frontend: Create `FlashcardCarousel.tsx` component with flip animation
- Frontend: Add `streamFlashcards()` to `api/client.ts`
- Frontend: Add mode selection UI in `App.tsx` (Summarize / Flashcards / Quiz tabs)

### 2b. Quiz Mode
- Create `backend/app/prompts/templates/quiz.j2` — prompt for MCQ + short answer as JSON
- Add `QuizRequest` schema (file_id, num_questions: int = 5, question_types: list)
- Add `POST /api/v1/stream-quiz` endpoint
- Add `SYSTEM_PROMPTS["quiz"]` in `prompt_service.py`
- Frontend: Create `QuizView.tsx` with question display + scoring logic
- Frontend: Add `streamQuiz()` to `api/client.ts`

### 2c. Rate Limiter
- Create `backend/app/services/rate_limiter.py` — Redis sliding window
- 10 uploads/hour, 50 generations/hour per IP (no auth in Phase 1)
- Return 429 with retry-after header
- Wire into upload and study_modes routes as a FastAPI dependency

### 2d. Session History
- Add `GET /api/v1/sessions` — list past sessions
- Add `GET /api/v1/sessions/{id}` — get session detail with result_text
- Add `DELETE /api/v1/sessions/{id}` — soft delete
- Frontend: Session history sidebar or list view

### 2e. Input Sanitization
- Strip HTML from uploaded text before sending to LLM
- Regex-based prompt injection prevention
- Validate custom_instructions for injection patterns

---

## Phase 3-6 Overview (Future)

| Phase | Focus | Key Items |
|-------|-------|-----------|
| 3 | Auth | JWT with refresh rotation, login/register, user tiers (free/pro), credits |
| 4 | LLMOps | Structured JSON logging, correlation IDs, tiktoken cost aggregation, `/metrics` endpoint, cost dashboard |
| 5 | CI/CD | GitHub Actions (lint + test + build on PR), multi-stage Docker, Trivy scan, Azure App Service deploy |
| 6 | Polish | Export PDF/CSV, dark mode, keyboard shortcuts, code splitting, mobile responsive, WCAG, loading skeletons |

---

## How to Run (First Time)

```bash
cd C:/Users/Aravind/Desktop/workspace/GIT/genai-study-assistant

# 1. Create .env from template
cp .env.example .env
# Edit .env: set LLM_API_KEY to your Zhipu AI / OpenAI key

# 2. Start all services
docker-compose up -d --build

# 3. Check health
curl http://localhost:8000/api/v1/health
# Expected: {"status":"ok"}

# 4. Open frontend
# http://localhost:3000

# 5. Test upload via curl
curl -X POST http://localhost:8000/api/v1/upload \
  -F "file=@some-file.pdf"

# 6. Test summarize via curl
curl -X POST http://localhost:8000/api/v1/stream-summarize \
  -H "Content-Type: application/json" \
  -d '{"file_id": "<uuid-from-upload>"}'
```

**Known potential issues on first run:**
- Alembic is NOT set up — tables are auto-created via `Base.metadata.create_all` in the FastAPI lifespan. This works for dev but won't handle schema changes.
- The `backend/app/models/__init__.py` must import all models for `create_all` to see them. Verify it imports User, File, Session.
- Frontend Vite dev server needs `VITE_API_URL=http://localhost:8000` env var (set in docker-compose.yml).
- No proxy configured in `vite.config.ts` — relies on CORS middleware. If CORS issues arise, add a Vite proxy.

---

## Conventions & Rules

1. **Never push without explicit permission**
2. **Never modify directory structure without asking**
3. **No comments in code** unless explicitly asked
4. **Async throughout**: asyncpg, AsyncSession, httpx.AsyncClient
5. **SSE via StreamingResponse** (not WebSocket)
6. **POST-based SSE** (not GET) — frontend uses `fetch()` + `ReadableStream`
7. **All DB models** use UUID PKs + `TimestampMixin`
8. **LLM provider abstraction**: uses OpenAI SDK with configurable `base_url`
9. Follow patterns in ARCHITECTURE.md strictly
10. **No Co-Authored-By lines** in commit messages (user preference)

---

## Git History

```
d8c72c0 Switch LLM provider to GLM-4.5 (Zhipu AI)     (2026-04-20)
aa06a90 Initial commit: GenAI Study Assistant Phase 1 MVP (2026-04-02)
```

Working tree is clean as of 2026-04-23.

---

## Quick Reference: API Endpoints

| Endpoint | Method | Status | Description |
|----------|--------|--------|-------------|
| `/api/v1/health` | GET | Working | Returns `{"status":"ok"}` |
| `/api/v1/upload` | POST | Working | Multipart file upload, returns FileUploadResponse |
| `/api/v1/stream-summarize` | POST | Working | SSE stream of summary chunks |
| `/api/v1/stream-flashcards` | POST | NOT BUILT | Phase 2 |
| `/api/v1/stream-quiz` | POST | NOT BUILT | Phase 2 |
| `/api/v1/sessions` | GET | NOT BUILT | Phase 2 |
| `/api/v1/sessions/{id}` | GET | NOT BUILT | Phase 2 |
| `/api/v1/metrics` | GET | NOT BUILT | Phase 4 |

---

## Environment

- **OS**: Windows 11
- **Shell**: Git Bash (use Unix paths)
- **Docker**: Docker Desktop for Windows
- **Node**: 20.x
- **Python**: 3.11+
- **Package manager**: pip (backend), npm (frontend)
