import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.study_modes import SummarizeRequest
from app.config import settings
from app.database import get_db
from app.models.file import File as FileModel
from app.models.session import Session
from app.services.llm_service import LLMService
from app.services.prompt_service import PromptService

router = APIRouter(prefix="/api/v1", tags=["study_modes"])


@router.post("/stream-summarize")
async def stream_summarize(
    request: SummarizeRequest,
    db: AsyncSession = Depends(get_db),
):
    file_record = await db.get(FileModel, request.file_id)
    if not file_record or file_record.status != "ready":
        raise HTTPException(status_code=404, detail="File not found or not ready")

    prompt_service = PromptService()
    messages = prompt_service.render_messages(
        mode="summarize",
        text=file_record.extracted_text,
        custom_instructions=request.custom_instructions,
    )

    session_record = Session(
        file_id=request.file_id,
        mode="summarize",
        prompt_template="summarize.j2",
        model_name=settings.OPENAI_MODEL,
        status="pending",
        started_at=datetime.now(timezone.utc),
    )
    db.add(session_record)
    await db.commit()
    await db.refresh(session_record)

    async def event_generator():
        llm = LLMService(api_key=settings.OPENAI_API_KEY, model=settings.OPENAI_MODEL)

        try:
            session_record.status = "streaming"
            await db.commit()

            async for event in llm.stream_completion(messages):
                if event["type"] == "chunk":
                    data = json.dumps({
                        "chunk": event["chunk"],
                        "tokens_used": event["tokens_used"],
                        "cumulative_cost": event["cumulative_cost"],
                    })
                    yield f"event: stream\ndata: {data}\n\n"

                elif event["type"] == "complete":
                    session_record.input_tokens = event["input_tokens"]
                    session_record.output_tokens = event["output_tokens"]
                    session_record.total_tokens = event["total_tokens"]
                    session_record.estimated_cost = event["total_cost"]
                    session_record.result_text = event["full_response"]
                    session_record.status = "completed"
                    session_record.completed_at = datetime.now(timezone.utc)
                    await db.commit()

                    data = json.dumps({
                        "total_tokens": event["total_tokens"],
                        "total_cost": event["total_cost"],
                        "session_id": str(session_record.id),
                        "input_tokens": event["input_tokens"],
                        "output_tokens": event["output_tokens"],
                    })
                    yield f"event: complete\ndata: {data}\n\n"

        except Exception as e:
            session_record.status = "error"
            session_record.error_message = str(e)
            await db.commit()

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
