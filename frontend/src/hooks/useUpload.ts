import { useState } from "react";
import { uploadFile } from "../api/client";
import type { FileUploadResponse } from "../types/api";

type UploadState = "idle" | "uploading" | "success" | "error";

export function useUpload() {
  const [state, setState] = useState<UploadState>("idle");
  const [data, setData] = useState<FileUploadResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setState("uploading");
    setError(null);
    try {
      const response = await uploadFile(file);
      setData(response);
      setState("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
      setState("error");
    }
  };

  const reset = () => {
    setState("idle");
    setData(null);
    setError(null);
  };

  return { state, data, error, upload, reset };
}
