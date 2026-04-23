import asyncio
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from alembic import command
from alembic.config import Config

from app.config import settings
from app.database import engine
from app.models.base import Base
import app.models

from app.api.routes.sessions import router as sessions_router
from app.api.routes.upload import router as upload_router
from app.api.routes.study_modes import router as study_modes_router

logger = logging.getLogger(__name__)


def run_migrations() -> None:
    config = Config(str(Path(__file__).resolve().parent.parent / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    command.upgrade(config, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        await asyncio.to_thread(run_migrations)
    except Exception:
        logger.exception("Alembic upgrade failed during startup")

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="GenAI Study Assistant",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload_router)
app.include_router(study_modes_router)
app.include_router(sessions_router)


@app.get("/api/v1/health")
async def health_check():
    return {"status": "ok"}
