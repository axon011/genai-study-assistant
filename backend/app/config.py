from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o"

    OLLAMA_BASE_URL: str = "http://localhost:11434/v1"
    OLLAMA_MODEL: str = "llama3.2"

    LLM_PROVIDER: str = "openai"

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/studyassistant"
    REDIS_URL: str = "redis://redis:6379/0"

    MAX_FILE_SIZE_MB: int = 50
    ALLOWED_FILE_TYPES: list[str] = ["pdf", "txt", "md"]


settings = Settings()
