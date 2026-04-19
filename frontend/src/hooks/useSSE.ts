import { useState } from "react";
import { streamSummarize } from "../api/client";
import type { SummarizeRequest, StreamCompleteEvent } from "../types/api";

type StreamStatus = "idle" | "streaming" | "complete" | "error";

export function useSSE() {
  const [status, setStatus] = useState<StreamStatus>("idle");
  const [content, setContent] = useState("");
  const [tokenInfo, setTokenInfo] = useState<StreamCompleteEvent | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startStream = async (request: SummarizeRequest) => {
    setStatus("streaming");
    setContent("");
    setTokenInfo(null);
    setError(null);

    try {
      for await (const event of streamSummarize(request)) {
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
