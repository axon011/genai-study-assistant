from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from fastapi import Depends, Response, status

from app.api.schemas.sessions import (
    SessionDetailResponse,
    SessionListItem,
    SessionListResponse,
)
from app.database import get_db
from app.models.file import File as FileModel
from app.models.session import Session as SessionModel

router = APIRouter(prefix="/api/v1/sessions", tags=["sessions"])


@router.get("", response_model=SessionListResponse)
async def list_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    offset = (page - 1) * page_size

    total = await db.scalar(
        select(func.count())
        .select_from(SessionModel)
        .where(SessionModel.deleted_at.is_(None))
    )

    result = await db.execute(
        select(SessionModel, FileModel.original_filename)
        .join(FileModel, SessionModel.file_id == FileModel.id)
        .where(SessionModel.deleted_at.is_(None))
        .order_by(SessionModel.created_at.desc())
        .offset(offset)
        .limit(page_size)
    )

    items = [
        SessionListItem(
            id=session.id,
            file_id=session.file_id,
            file_name=file_name,
            mode=session.mode,
            status=session.status,
            created_at=session.created_at,
            completed_at=session.completed_at,
        )
        for session, file_name in result.all()
    ]

    return SessionListResponse(
        items=items,
        page=page,
        page_size=page_size,
        total=total or 0,
    )


@router.get("/{session_id}", response_model=SessionDetailResponse)
async def get_session_detail(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(SessionModel, FileModel.original_filename)
        .join(FileModel, SessionModel.file_id == FileModel.id)
        .where(
            SessionModel.id == session_id,
            SessionModel.deleted_at.is_(None),
        )
    )
    row = result.first()
    if not row:
        raise HTTPException(status_code=404, detail="Session not found")

    session, file_name = row
    return SessionDetailResponse(
        id=session.id,
        file_id=session.file_id,
        file_name=file_name,
        mode=session.mode,
        prompt_template=session.prompt_template,
        model_name=session.model_name,
        input_tokens=session.input_tokens,
        output_tokens=session.output_tokens,
        total_tokens=session.total_tokens,
        estimated_cost=session.estimated_cost,
        result_text=session.result_text,
        status=session.status,
        error_message=session.error_message,
        started_at=session.started_at,
        completed_at=session.completed_at,
        created_at=session.created_at,
    )


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID,
    db: AsyncSession = Depends(get_db),
):
    session = await db.get(SessionModel, session_id)
    if not session or session.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Session not found")

    session.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
