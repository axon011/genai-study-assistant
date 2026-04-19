from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class FileUploadResponse(BaseModel):
    file_id: UUID
    original_filename: str
    file_type: str
    file_size_bytes: int
    char_count: int | None
    text_preview: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
