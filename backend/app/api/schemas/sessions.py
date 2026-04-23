from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class SessionListItem(BaseModel):
    id: UUID
    file_id: UUID
    file_name: str
    mode: str
    status: str
    created_at: datetime
    completed_at: datetime | None


class SessionListResponse(BaseModel):
    items: list[SessionListItem]
    page: int
    page_size: int
    total: int


class SessionDetailResponse(BaseModel):
    id: UUID
    file_id: UUID
    file_name: str
    mode: str
    prompt_template: str | None
    model_name: str | None
    input_tokens: int | None
    output_tokens: int | None
    total_tokens: int | None
    estimated_cost: float | None
    result_text: str | None
    status: str
    error_message: str | None
    started_at: datetime | None
    completed_at: datetime | None
    created_at: datetime
