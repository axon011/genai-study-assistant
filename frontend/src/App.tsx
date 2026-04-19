import { useState } from "react";
import { FileUpload } from "./components/FileUpload";
import { StreamingResults } from "./components/StreamingResults";
import { CostDisplay } from "./components/CostDisplay";
import { useUpload } from "./hooks/useUpload";
import { useSSE } from "./hooks/useSSE";
import "./App.css";

function App() {
  const { state: uploadState, data: fileData, error: uploadError, upload, reset: resetUpload } = useUpload();
  const { status: streamStatus, content, tokenInfo, error: streamError, startStream, reset: resetStream } = useSSE();
  const [instructions, setInstructions] = useState("");

  const handleSummarize = () => {
    if (fileData) {
      startStream({
        file_id: fileData.file_id,
        custom_instructions: instructions || undefined,
      });
    }
  };

  const handleReset = () => {
    resetUpload();
    resetStream();
    setInstructions("");
  };

  return (
    <div className="app">
      <header className="header">
        <h1>GenAI Study Assistant</h1>
        <p className="subtitle">Upload your study materials and get AI-powered summaries</p>
      </header>

      <main className="main">
        <FileUpload
          onUpload={upload}
          uploadState={uploadState}
          fileData={fileData}
          error={uploadError}
          onReset={handleReset}
        />

        {fileData && uploadState === "success" && streamStatus === "idle" && (
          <div className="action-section">
            <textarea
              className="instructions-input"
              placeholder="Custom instructions (optional) — e.g., 'Focus on key formulas' or 'Keep it under 200 words'"
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              maxLength={500}
              rows={2}
            />
            <button className="btn-primary" onClick={handleSummarize}>
              Summarize
            </button>
          </div>
        )}

        <StreamingResults content={content} status={streamStatus} />

        {tokenInfo && <CostDisplay tokenInfo={tokenInfo} />}

        {streamError && <p className="error-text">{streamError}</p>}
      </main>

      <footer className="footer">
        <p>Built with React + FastAPI + GPT-4o + SSE Streaming</p>
      </footer>
    </div>
  );
}

export default App;
