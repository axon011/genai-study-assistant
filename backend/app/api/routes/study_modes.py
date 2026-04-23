import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.study_modes import FlashcardRequest, QuizRequest, SummarizeRequest
from app.config import settings
from app.database import async_session_maker, get_db
from app.models.file import File as FileModel
from app.models.session import Session
from app.services.llm_service import LLMService
from app.services.prompt_service import PromptService
from app.services.rate_limiter import generation_rate_limit
from app.services.reranker import RerankerService
from app.services.vector_store import VectorStoreService

router = APIRouter(prefix="/api/v1", tags=["study_modes"])


async def get_ready_file(db: AsyncSession, file_id: Any) -> FileModel:
    file_record = await db.get(FileModel, file_id)
    if not file_record or file_record.status != "ready":
        raise HTTPException(status_code=404, detail="File not found or not ready")
    return file_record


def _build_retrieval_query(mode: str, context: dict[str, Any]) -> str:
    custom = context.get("custom_instructions", "") or ""
    base = {
        "summarize": "key concepts main topics important definitions",
        "flashcard": "definitions concepts terms facts vocabulary",
        "quiz": "testable knowledge facts concepts formulas",
    }.get(mode, "important content")
    return f"{base} {custom}".strip()


def _format_retrieved_context(chunks: list[dict]) -> str:
    parts = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk["metadata"]
        source = f"[Source {i}: {meta['filename']}, Chunk {meta['chunk_index'] + 1}/{meta['total_chunks']}]"
        parts.append(f"{source}\n{chunk['text']}")
    return "\n\n---\n\n".join(parts)


async def stream_mode_response(
    *,
    db: AsyncSession,
    mode: str,
    file_record: FileModel,
    prompt_context: dict[str, Any],
) -> StreamingResponse:
    # RAG: retrieve relevant chunks instead of using full text
    retrieval_query = _build_retrieval_query(mode, prompt_context)
    try:
        vector_store = VectorStoreService()
        retrieved = vector_store.query(
            query_text=retrieval_query,
            file_ids=[str(file_record.id)],
        )
        reranker = RerankerService()
        reranked = reranker.rerank(retrieval_query, retrieved)
        context_text = _format_retrieved_context(reranked)
    except Exception:
        context_text = file_record.extracted_text  # fallback to full text

    prompt_service = PromptService()
    messages = prompt_service.render_messages(
        mode=mode,
        text=context_text,
        **prompt_context,
    )

    session_record = Session(
        file_id=file_record.id,
        mode=mode,
        prompt_template=f"{mode}.j2",
        model_name=settings.LLM_MODEL,
        status="pending",
        started_at=datetime.now(timezone.utc),
    )
    db.add(session_record)
    await db.commit()
    await db.refresh(session_record)
    session_id = session_record.id

    async def event_generator():
        llm = LLMService(
            api_key=settings.LLM_API_KEY,
            model=settings.LLM_MODEL,
            base_url=settings.LLM_BASE_URL or None,
        )

        try:
            async with async_session_maker() as gen_db:
                rec = await gen_db.get(Session, session_id)
                rec.status = "streaming"
                await gen_db.commit()

            async for event in llm.stream_completion(messages):
                if event["type"] == "chunk":
                    data = json.dumps({
                        "chunk": event["chunk"],
                        "tokens_used": event["tokens_used"],
                        "cumulative_cost": event["cumulative_cost"],
                    })
                    yield f"event: stream\ndata: {data}\n\n"

                elif event["type"] == "complete":
                    async with async_session_maker() as gen_db:
                        rec = await gen_db.get(Session, session_id)
                        rec.input_tokens = event["input_tokens"]
                        rec.output_tokens = event["output_tokens"]
                        rec.total_tokens = event["total_tokens"]
                        rec.estimated_cost = event["total_cost"]
                        rec.result_text = event["full_response"]
                        rec.status = "completed"
                        rec.completed_at = datetime.now(timezone.utc)
                        await gen_db.commit()

                    data = json.dumps({
                        "total_tokens": event["total_tokens"],
                        "total_cost": event["total_cost"],
                        "session_id": str(session_id),
                        "input_tokens": event["input_tokens"],
                        "output_tokens": event["output_tokens"],
                    })
                    yield f"event: complete\ndata: {data}\n\n"

        except Exception as e:
            async with async_session_maker() as gen_db:
                rec = await gen_db.get(Session, session_id)
                rec.status = "error"
                rec.error_message = str(e)
                await gen_db.commit()

            data = json.dumps({"error": str(e)})
            yield f"event: error\ndata: {data}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/stream-summarize")
async def stream_summarize(
    request: SummarizeRequest,
    _: None = Depends(generation_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    file_record = await get_ready_file(db, request.file_id)
    return await stream_mode_response(
        db=db,
        mode="summarize",
        file_record=file_record,
        prompt_context={"custom_instructions": request.custom_instructions},
    )


@router.post("/stream-flashcards")
async def stream_flashcards(
    request: FlashcardRequest,
    _: None = Depends(generation_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    file_record = await get_ready_file(db, request.file_id)
    return await stream_mode_response(
        db=db,
        mode="flashcard",
        file_record=file_record,
        prompt_context={
            "num_cards": request.num_cards,
            "difficulty": request.difficulty,
            "custom_instructions": request.custom_instructions,
        },
    )


@router.post("/stream-quiz")
async def stream_quiz(
    request: QuizRequest,
    _: None = Depends(generation_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    file_record = await get_ready_file(db, request.file_id)
    return await stream_mode_response(
        db=db,
        mode="quiz",
        file_record=file_record,
        prompt_context={
            "num_questions": request.num_questions,
            "question_types": request.question_types,
            "custom_instructions": request.custom_instructions,
        },
    )
