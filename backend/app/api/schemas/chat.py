from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class ChatRequest(BaseModel):
    file_id: UUID
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_id: UUID | None = None


class ChatMessageResponse(BaseModel):
    id: UUID
    role: str
    content: str
    sources: list[dict] | None = None
    created_at: datetime


class ConversationResponse(BaseModel):
    id: UUID
    title: str | None
    file_id: UUID | None
    file_name: str | None
    messages: list[ChatMessageResponse]
    created_at: datetime


class ConversationListItem(BaseModel):
    id: UUID
    title: str | None
    file_name: str | None
    message_count: int
    created_at: datetime
