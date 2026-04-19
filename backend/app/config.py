from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    LLM_API_KEY: str = ""
    LLM_BASE_URL: str = "https://api.z.ai/api/coding/paas/v4"
    LLM_MODEL: str = "glm-4.5"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/studyassistant"
    REDIS_URL: str = "redis://redis:6379/0"

    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_FILE_TYPES: list[str] = ["pdf", "txt", "md"]


settings = Settings()
