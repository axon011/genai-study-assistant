import { useCallback, useEffect, useRef, useState } from "react";
import { fetchFiles } from "../api/client";
import type { FileUploadResponse } from "../types/api";

interface Props {
  onUpload: (file: File) => void;
  onSelectExisting: (file: FileUploadResponse) => void;
  uploadState: "idle" | "uploading" | "success" | "error";
  fileData: FileUploadResponse | null;
  error: string | null;
  onReset: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function FileUpload({ onUpload, onSelectExisting, uploadState, fileData, error, onReset }: Props) {
  const [isDragging, setIsDragging] = useState(false);
  const [existingFiles, setExistingFiles] = useState<FileUploadResponse[]>([]);
  const [showExisting, setShowExisting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchFiles()
      .then(setExistingFiles)
      .catch(() => {});
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      onUpload(file);
    },
    [onUpload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  if (uploadState === "success" && fileData) {
    return (
      <div className="upload-success">
        <div className="file-info">
          <span className="file-icon">📄</span>
          <div>
            <p className="file-name">{fileData.original_filename}</p>
            <p className="file-meta">
              {formatBytes(fileData.file_size_bytes)} &middot; {fileData.char_count?.toLocaleString()} characters &middot; .{fileData.file_type}
            </p>
          </div>
        </div>
        {fileData.text_preview && (
          <div className="text-preview">
            <p className="preview-label">Preview</p>
            <p className="preview-text">{fileData.text_preview}</p>
          </div>
        )}
        <button className="btn-secondary" onClick={onReset} type="button">
          Choose different file
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        className={`drop-zone ${isDragging ? "dragging" : ""} ${uploadState === "uploading" ? "uploading" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.txt,.md"
          onChange={handleChange}
          hidden
        />
        {uploadState === "uploading" ? (
          <div className="upload-progress">
            <div className="spinner" />
            <p>Uploading and extracting text...</p>
          </div>
        ) : (
          <>
            <span className="drop-icon">📁</span>
            <p className="drop-text">
              {isDragging ? "Drop your file here" : "Drag & drop or click to upload"}
            </p>
            <p className="drop-hint">Supports PDF, TXT, MD (max 50 MB)</p>
          </>
        )}
      </div>

      {existingFiles.length > 0 && (
        <div className="existing-files">
          <button
            className="existing-toggle"
            onClick={() => setShowExisting(!showExisting)}
            type="button"
          >
            {showExisting ? "Hide" : "Or choose from"} {existingFiles.length} previously uploaded file{existingFiles.length !== 1 ? "s" : ""}
            <span className="toggle-arrow">{showExisting ? "▲" : "▼"}</span>
          </button>

          {showExisting && (
            <div className="existing-list">
              {existingFiles.map((f) => (
                <button
                  className="existing-item"
                  key={f.file_id}
                  onClick={() => onSelectExisting(f)}
                  type="button"
                >
                  <span className="existing-icon">📄</span>
                  <div className="existing-info">
                    <span className="existing-name">{f.original_filename}</span>
                    <span className="existing-meta">
                      {formatBytes(f.file_size_bytes)} &middot; {f.char_count?.toLocaleString()} chars &middot; {new Date(f.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
