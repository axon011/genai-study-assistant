from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.schemas.upload import FileUploadResponse
from app.config import settings
from app.database import get_db
from app.models.file import File as FileModel
from app.services.file_extractor import FileExtractorService

router = APIRouter(prefix="/api/v1", tags=["upload"])


@router.post("/upload", response_model=FileUploadResponse, status_code=201)
async def upload_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
):
    try:
        file_type = FileExtractorService.validate_file_type(file.filename)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    content = await file.read()

    try:
        FileExtractorService.validate_file_size(len(content), settings.MAX_FILE_SIZE_MB)
    except ValueError as e:
        raise HTTPException(status_code=413, detail=str(e))

    file_id = uuid4()
    storage_path = f"uploads/{file_id}.{file_type}"
    Path("uploads").mkdir(parents=True, exist_ok=True)
    Path(storage_path).write_bytes(content)

    try:
        extracted_text = await FileExtractorService.extract_text(storage_path, file_type)
        text_preview = extracted_text[:500] if extracted_text else None
        char_count = len(extracted_text) if extracted_text else 0
        status = "ready"
        error_message = None
    except Exception as e:
        extracted_text = None
        text_preview = None
        char_count = None
        status = "error"
        error_message = str(e)

    file_record = FileModel(
        id=file_id,
        original_filename=file.filename,
        file_type=file_type,
        file_size_bytes=len(content),
        storage_path=storage_path,
        extracted_text=extracted_text,
        text_preview=text_preview,
        char_count=char_count,
        status=status,
        error_message=error_message,
    )
    db.add(file_record)
    await db.commit()
    await db.refresh(file_record)

    if status == "error":
        raise HTTPException(status_code=422, detail=f"Text extraction failed: {error_message}")

    return FileUploadResponse(
        file_id=file_record.id,
        original_filename=file_record.original_filename,
        file_type=file_record.file_type,
        file_size_bytes=file_record.file_size_bytes,
        char_count=file_record.char_count,
        text_preview=file_record.text_preview,
        status=file_record.status,
        created_at=file_record.created_at,
    )
