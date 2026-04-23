from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.config import settings


class ChunkingService:
    def __init__(self) -> None:
        self.splitter = RecursiveCharacterTextSplitter(
            chunk_size=settings.CHUNK_SIZE,
            chunk_overlap=settings.CHUNK_OVERLAP,
            length_function=len,
            separators=["\n\n", "\n", ". ", " ", ""],
        )

    def chunk_text(
        self, text: str, file_id: str, filename: str
    ) -> list[dict]:
        chunks = self.splitter.split_text(text)
        return [
            {
                "id": f"{file_id}_chunk_{i}",
                "text": chunk,
                "metadata": {
                    "file_id": file_id,
                    "filename": filename,
                    "chunk_index": i,
                    "total_chunks": len(chunks),
                },
            }
            for i, chunk in enumerate(chunks)
        ]
