import json
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.chat import (
    ChatMessageResponse,
    ChatRequest,
    ConversationListItem,
    ConversationResponse,
)
from app.config import settings
from app.database import async_session_maker, get_db
from app.models.conversation import Conversation, Message
from app.models.file import File as FileModel
from app.services.llm_service import LLMService
from app.services.rate_limiter import generation_rate_limit

router = APIRouter(prefix="/api/v1", tags=["chat"])

CHAT_SYSTEM_PROMPT = (
    "You are a helpful study assistant. Answer questions using ONLY the "
    "provided context from the user's study materials. "
    "Cite sources using [Source N] format when referencing specific information. "
    "If the context doesn't contain the answer, say so honestly. "
    "Be concise, accurate, and educational."
)

MAX_HISTORY_TURNS = 10


def _format_sources(chunks: list[dict]) -> str:
    parts = []
    for i, chunk in enumerate(chunks, 1):
        meta = chunk["metadata"]
        source = f"[Source {i}: {meta['filename']}, Chunk {meta['chunk_index'] + 1}/{meta['total_chunks']}]"
        parts.append(f"{source}\n{chunk['text']}")
    return "\n\n---\n\n".join(parts)


@router.post("/chat")
async def chat(
    request: ChatRequest,
    _: None = Depends(generation_rate_limit),
    db: AsyncSession = Depends(get_db),
):
    file_record = await db.get(FileModel, request.file_id)
    if not file_record or file_record.status != "ready":
        raise HTTPException(status_code=404, detail="File not found or not ready")

    # Get or create conversation
    history_messages: list[Message] = []
    if request.conversation_id:
        conversation = await db.get(Conversation, request.conversation_id)
        if not conversation:
            raise HTTPException(status_code=404, detail="Conversation not found")
        result = await db.execute(
            select(Message)
            .where(Message.conversation_id == conversation.id)
            .order_by(Message.created_at)
        )
        history_messages = list(result.scalars().all())
    else:
        conversation = Conversation(
            file_id=request.file_id,
            title=request.message[:100],
        )
        db.add(conversation)
        await db.commit()
        await db.refresh(conversation)

    # Save user message
    user_msg = Message(
        conversation_id=conversation.id,
        role="user",
        content=request.message,
    )
    db.add(user_msg)
    await db.commit()
    await db.refresh(user_msg)

    conversation_id = conversation.id
    user_msg_id = user_msg.id

    # RAG: retrieve relevant chunks
    try:
        from app.services.reranker import RerankerService
        from app.services.vector_store import VectorStoreService

        vector_store = VectorStoreService()
        retrieved = vector_store.query(
            query_text=request.message,
            file_ids=[str(request.file_id)],
        )
        reranker = RerankerService()
        reranked = reranker.rerank(request.message, retrieved)
        context_text = _format_sources(reranked)
        sources_data = [
            {"source_num": i + 1, **c["metadata"]}
            for i, c in enumerate(reranked)
        ]
    except Exception:
        context_text = file_record.extracted_text or ""
        sources_data = []

    # Build messages with history
    messages: list[dict[str, str]] = [
        {"role": "system", "content": CHAT_SYSTEM_PROMPT},
    ]

    # Add conversation history (last N turns)
    for msg in history_messages[-MAX_HISTORY_TURNS * 2:]:
        if msg.id != user_msg_id:
            messages.append({"role": msg.role, "content": msg.content})

    # Add context + current question
    user_prompt = f"Context from study materials:\n\n{context_text}\n\n---\n\nQuestion: {request.message}"
    messages.append({"role": "user", "content": user_prompt})

    async def event_generator():
        llm = LLMService(
            api_key=settings.LLM_API_KEY,
            model=settings.LLM_MODEL,
            base_url=settings.LLM_BASE_URL or None,
        )
        full_response = ""

        try:
            # Send conversation_id in first event
            init_data = json.dumps({
                "conversation_id": str(conversation_id),
            })
            yield f"event: init\ndata: {init_data}\n\n"

            async for event in llm.stream_completion(messages):
                if event["type"] == "chunk":
                    full_response += event["chunk"]
                    data = json.dumps({
                        "chunk": event["chunk"],
                        "tokens_used": event["tokens_used"],
                        "cumulative_cost": event["cumulative_cost"],
                    })
                    yield f"event: stream\ndata: {data}\n\n"

                elif event["type"] == "complete":
                    # Save assistant message
                    async with async_session_maker() as gen_db:
                        assistant_msg = Message(
                            conversation_id=conversation_id,
                            role="assistant",
                            content=full_response,
                            sources_json=json.dumps(sources_data) if sources_data else None,
                            input_tokens=event["input_tokens"],
                            output_tokens=event["output_tokens"],
                            estimated_cost=event["total_cost"],
                        )
                        gen_db.add(assistant_msg)
                        await gen_db.commit()

                    data = json.dumps({
                        "conversation_id": str(conversation_id),
                        "total_tokens": event["total_tokens"],
                        "total_cost": event["total_cost"],
                        "input_tokens": event["input_tokens"],
                        "output_tokens": event["output_tokens"],
                        "sources": sources_data,
                    })
                    yield f"event: complete\ndata: {data}\n\n"

        except Exception as e:
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


@router.get("/conversations", response_model=list[ConversationListItem])
async def list_conversations(
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(
            Conversation,
            FileModel.original_filename,
            func.count(Message.id).label("msg_count"),
        )
        .outerjoin(FileModel, Conversation.file_id == FileModel.id)
        .outerjoin(Message, Message.conversation_id == Conversation.id)
        .group_by(Conversation.id, FileModel.original_filename)
        .order_by(Conversation.created_at.desc())
        .limit(50)
    )

    return [
        ConversationListItem(
            id=conv.id,
            title=conv.title,
            file_name=fname,
            message_count=count,
            created_at=conv.created_at,
        )
        for conv, fname, count in result.all()
    ]


@router.get("/conversations/{conversation_id}", response_model=ConversationResponse)
async def get_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Conversation, FileModel.original_filename)
        .outerjoin(FileModel, Conversation.file_id == FileModel.id)
        .where(Conversation.id == conversation_id)
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found")

    conv, fname = row

    msgs_result = await db.execute(
        select(Message)
        .where(Message.conversation_id == conversation_id)
        .order_by(Message.created_at)
    )

    return ConversationResponse(
        id=conv.id,
        title=conv.title,
        file_id=conv.file_id,
        file_name=fname,
        messages=[
            ChatMessageResponse(
                id=m.id,
                role=m.role,
                content=m.content,
                sources=json.loads(m.sources_json) if m.sources_json else None,
                created_at=m.created_at,
            )
            for m in msgs_result.scalars().all()
        ],
        created_at=conv.created_at,
    )


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    conversation_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    conv = await db.get(Conversation, conversation_id)
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.delete(conv)
    await db.commit()
