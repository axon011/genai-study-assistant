import { API_BASE_URL } from "../config";
import type {
  FileUploadResponse,
  FlashcardRequest,
  QuizRequest,
  SessionDetail,
  SessionListResponse,
  SSEEvent,
  SummarizeRequest,
} from "../types/api";

export async function uploadFile(file: File): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${API_BASE_URL}/api/v1/upload`, {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Upload failed" }));
    throw new Error(err.detail || "Upload failed");
  }

  return response.json();
}

async function* streamRequest(
  path: string,
  request: SummarizeRequest | FlashcardRequest | QuizRequest
): AsyncGenerator<SSEEvent> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new Error(err.detail || "Stream request failed");
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Streaming is not supported in this browser");
  }

  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && currentEvent) {
        const data = JSON.parse(line.slice(6));
        yield { ...data, _event: currentEvent } as SSEEvent;
        currentEvent = "";
      }
    }
  }
}

export async function* streamSummarize(
  request: SummarizeRequest
): AsyncGenerator<SSEEvent> {
  yield* streamRequest("/api/v1/stream-summarize", request);
}

export async function* streamFlashcards(
  request: FlashcardRequest
): AsyncGenerator<SSEEvent> {
  yield* streamRequest("/api/v1/stream-flashcards", request);
}

export async function* streamQuiz(
  request: QuizRequest
): AsyncGenerator<SSEEvent> {
  yield* streamRequest("/api/v1/stream-quiz", request);
}

export async function fetchSessions(
  page = 1,
  pageSize = 20
): Promise<SessionListResponse> {
  const response = await fetch(
    `${API_BASE_URL}/api/v1/sessions?page=${page}&page_size=${pageSize}`
  );

  if (!response.ok) {
    throw new Error("Failed to load session history");
  }

  return response.json();
}

export async function fetchSessionDetail(sessionId: string): Promise<SessionDetail> {
  const response = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}`);

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Failed to load session" }));
    throw new Error(err.detail || "Failed to load session");
  }

  return response.json();
}

export async function deleteSession(sessionId: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/v1/sessions/${sessionId}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: "Failed to delete session" }));
    throw new Error(err.detail || "Failed to delete session");
  }
}
