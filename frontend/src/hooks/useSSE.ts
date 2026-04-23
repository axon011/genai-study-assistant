import { useState } from "react";
import { streamFlashcards, streamQuiz, streamSummarize } from "../api/client";
import type {
  FlashcardRequest,
  QuizRequest,
  StreamCompleteEvent,
  StudyMode,
  SummarizeRequest,
} from "../types/api";

type StreamStatus = "idle" | "streaming" | "complete" | "error";
type StreamRequest = SummarizeRequest | FlashcardRequest | QuizRequest;

export function useSSE() {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [content, setContent] = useState("");
  const [tokenInfo, setTokenInfo] = useState<StreamCompleteEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startStream = async (mode: StudyMode, request: StreamRequest) => {
    setStatus("streaming");
    setContent("");
    setTokenInfo(null);
    setError(null);

    try {
      const stream =
        mode === "summarize"
          ? streamSummarize(request as SummarizeRequest)
          : mode === "flashcards"
            ? streamFlashcards(request as FlashcardRequest)
            : streamQuiz(request as QuizRequest);

      for await (const event of stream) {
        if (event._event === "stream") {
          setContent((prev) => prev + event.chunk);
        } else if (event._event === "complete") {
          setTokenInfo(event);
          setStatus("complete");
        } else if (event._event === "error") {
          setError(event.error);
          setStatus("error");
        }
      }

      setStatus((prev) => (prev === "streaming" ? "complete" : prev));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Streaming failed");
      setStatus("error");
    }
  };

  const reset = () => {
    setStatus("idle");
    setContent("");
    setTokenInfo(null);
    setError(null);
  };

  return { status, content, tokenInfo, error, startStream, reset };
}
