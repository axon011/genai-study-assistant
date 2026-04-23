# Codex Prompt — GenAI Study Assistant

Copy-paste the block below into Codex CLI.

---

```
Read HANDOFF.md and ARCHITECTURE.md in this repo first — they contain the full project context, file-by-file reference, and design specs.

This is a FastAPI + React + TypeScript + PostgreSQL + Redis + Docker app that generates AI-powered summaries, flashcards, and quizzes from uploaded study materials (PDF/TXT/MD) using SSE streaming.

Phase 1 (upload + summarize) is ~85% built but has NEVER been run end-to-end. Phase 2 (flashcards, quiz, rate limiting) is not started.

YOUR TASKS (in order):

1. VERIFY PHASE 1 WORKS END-TO-END
   - Check backend/app/models/__init__.py imports all 3 models (User, File, Session)
   - Check frontend vite.config.ts has a proxy for /api to http://localhost:8000 (add if missing)
   - Run `docker-compose up -d --build` and fix any build errors
   - Test: upload a file via curl, then stream-summarize it
   - Fix any bugs found during testing
   - The LLM uses GLM-4.5 (Zhipu AI) via OpenAI-compatible SDK — API key goes in .env as LLM_API_KEY

2. SET UP ALEMBIC (currently missing, tables auto-created via create_all)
   - Initialize alembic in backend/
   - Configure alembic/env.py for async SQLAlchemy
   - Generate initial migration from existing models
   - Keep create_all in lifespan as fallback but add alembic upgrade head to startup

3. BUILD PHASE 2a: FLASHCARD MODE
   - Create backend/app/prompts/templates/flashcard.j2 — prompt LLM to output JSON array of {question, answer} pairs
   - Add FlashcardRequest schema (file_id, num_cards=10, difficulty="medium")
   - Add POST /api/v1/stream-flashcards endpoint in study_modes.py
   - Add SYSTEM_PROMPTS["flashcard"] in prompt_service.py
   - Frontend: add streamFlashcards() to api/client.ts
   - Frontend: create FlashcardCarousel.tsx with flip animation (CSS transform)
   - Frontend: add mode tabs in App.tsx (Summarize | Flashcards | Quiz)

4. BUILD PHASE 2b: QUIZ MODE
   - Create backend/app/prompts/templates/quiz.j2 — generate MCQ + short answer as JSON
   - Add QuizRequest schema (file_id, num_questions=5, question_types=["mcq","short_answer"])
   - Add POST /api/v1/stream-quiz endpoint
   - Add SYSTEM_PROMPTS["quiz"] in prompt_service.py
   - Frontend: create QuizView.tsx with question display, answer selection, scoring
   - Frontend: add streamQuiz() to api/client.ts

5. BUILD PHASE 2c: RATE LIMITER
   - Create backend/app/services/rate_limiter.py — Redis sliding window
   - 10 uploads/hour, 50 generations/hour per IP
   - Return HTTP 429 with Retry-After header
   - Add as FastAPI dependency to upload and study_modes routes

6. ADD SESSION HISTORY
   - GET /api/v1/sessions — list past sessions (paginated)
   - GET /api/v1/sessions/{id} — session detail with result_text
   - DELETE /api/v1/sessions/{id}
   - Frontend: session history list/sidebar

CONVENTIONS:
- Async everywhere (asyncpg, AsyncSession)
- SSE via StreamingResponse, POST-based (not GET, not WebSocket)
- All models use UUID PKs + TimestampMixin
- OpenAI SDK with configurable base_url for LLM provider abstraction
- No comments in code unless explaining a non-obvious "why"
- No Co-Authored-By lines in commits
- Never push without asking
- Never modify directory structure without asking
- Follow patterns already in the codebase
```
