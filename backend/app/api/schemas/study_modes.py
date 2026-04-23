from uuid import UUID

from pydantic import BaseModel, Field
from typing import Literal


class SummarizeRequest(BaseModel):
    file_id: UUID
    custom_instructions: str | None = Field(None, max_length=500)


class FlashcardRequest(BaseModel):
    file_id: UUID
    num_cards: int = Field(10, ge=1, le=30)
    difficulty: Literal["easy", "medium", "hard"] = "medium"
    custom_instructions: str | None = Field(None, max_length=500)


class QuizRequest(BaseModel):
    file_id: UUID
    num_questions: int = Field(5, ge=1, le=20)
    question_types: list[Literal["mcq", "short_answer"]] = Field(
        default_factory=lambda: ["mcq", "short_answer"]
    )
    custom_instructions: str | None = Field(None, max_length=500)
