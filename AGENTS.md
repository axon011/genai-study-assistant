# AGENTS.md - genai-study-assistant

## Project Overview
AI study assistant that generates summaries, flashcards, and quizzes from uploaded study materials (PDF/TXT/MD) using GPT-4o with real-time SSE streaming.

## Tech Stack
- **Backend:** FastAPI (Python 3.11+, async) + PostgreSQL + Redis + Alembic
- **Frontend:** React 18 + TypeScript + Vite
- **LLM:** GLM-4.5 (Zhipu AI, default) or any OpenAI-compatible API
- **Infra:** Docker Compose → Azure App Service

## Current Phase
**Phase 1 - Core MVP:** Upload + Summarize only

## Architecture Reference
See `ARCHITECTURE.md` for full system design, API contract, DB models, and phase breakdowns.

## Key Conventions
- LLM provider abstraction: factory pattern with `BaseLLMService` → `OpenAIService` / `OllamaService`
- Both providers use the OpenAI SDK (Ollama is OpenAI-compatible)
- Toggle provider via `LLM_PROVIDER` env var (`openai` or `ollama`)
- SSE streaming via `StreamingResponse` (not WebSocket)
- POST-based SSE endpoints (not GET) - frontend uses `fetch()` + `ReadableStream`
- All DB models use UUID PKs, `TimestampMixin` for created_at/updated_at
- Async throughout: `asyncpg`, `AsyncSession`, `httpx.AsyncClient`

## Running Services (once implemented)
- FastAPI: http://localhost:8000
- React: http://localhost:3000
- PostgreSQL: localhost:5433
- Redis: localhost:6379

## Common Commands
```bash
# Start all services
docker-compose up -d

# Rebuild backend after code changes
docker-compose up -d --build backend

# View backend logs
docker-compose logs -f backend

# Run backend tests
docker-compose exec backend pytest tests/ -v

# Alembic migrations
docker-compose exec backend alembic upgrade head
docker-compose exec backend alembic revision --autogenerate -m "description"
```

## Environment Variables
See `.env.example` for all required variables:
- `OPENAI_API_KEY` - OpenAI API key
- `OPENAI_MODEL` - default `gpt-4o`
- `OLLAMA_BASE_URL` - default `http://localhost:11434/v1`
- `OLLAMA_MODEL` - default `llama3.2`
- `LLM_PROVIDER` - `openai` or `ollama`
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string

## Rules
1. **ALWAYS ask before pushing** - Never run `git push` without explicit permission
2. **ALWAYS ask before modifying directory structure** - Confirm before creating/moving/renaming
3. Follow patterns from ARCHITECTURE.md strictly
4. No comments in code unless asked
5. Run lint/typecheck after changes if available
