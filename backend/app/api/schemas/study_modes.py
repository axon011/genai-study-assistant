from uuid import UUID

from pydantic import BaseModel, Field


class SummarizeRequest(BaseModel):
    file_id: UUID
    custom_instructions: str | None = Field(None, max_length=500)
