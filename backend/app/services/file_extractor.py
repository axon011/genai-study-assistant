import asyncio
from pathlib import Path

from PyPDF2 import PdfReader


class FileExtractorService:
    ALLOWED_TYPES = {"pdf", "txt", "md"}

    @staticmethod
    def validate_file_type(filename: str | None) -> str:
        if not filename:
            raise ValueError("Filename is required")
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        if ext not in FileExtractorService.ALLOWED_TYPES:
            raise ValueError(f"Unsupported file type: .{ext}. Allowed: {FileExtractorService.ALLOWED_TYPES}")
        return ext

    @staticmethod
    def validate_file_size(size: int, max_mb: int) -> None:
        max_bytes = max_mb * 1024 * 1024
        if size > max_bytes:
            raise ValueError(f"File size {size / 1024 / 1024:.1f}MB exceeds limit of {max_mb}MB")

    @staticmethod
    async def extract_text(file_path: str, file_type: str) -> str:
        if file_type == "pdf":
            return await asyncio.to_thread(FileExtractorService._extract_pdf, file_path)
        return await asyncio.to_thread(FileExtractorService._extract_text_file, file_path)

    @staticmethod
    def _extract_pdf(file_path: str) -> str:
        reader = PdfReader(file_path)
        pages = []
        for page in reader.pages:
            text = page.extract_text()
            if text:
                pages.append(text)
        if not pages:
            raise ValueError("Could not extract text from PDF. The file may be scanned or image-based.")
        return "\n".join(pages)

    @staticmethod
    def _extract_text_file(file_path: str) -> str:
        return Path(file_path).read_text(encoding="utf-8")
