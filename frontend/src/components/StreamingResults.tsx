import ReactMarkdown from "react-markdown";

interface Props {
  content: string;
  status: "idle" | "streaming" | "complete" | "error";
}

export function StreamingResults({ content, status }: Props) {
  if (!content && status === "streaming") {
    return (
      <div className="streaming-container">
        <div className="streaming-header">
          <div className="spinner" />
          <span>Generating summary...</span>
        </div>
      </div>
    );
  }

  if (!content) return null;

  return (
    <div className="streaming-container">
      <div className="streaming-header">
        {status === "streaming" && (
          <>
            <div className="spinner" />
            <span>Streaming...</span>
          </>
        )}
        {status === "complete" && <span className="complete-badge">Complete</span>}
      </div>
      <div className="markdown-content">
        <ReactMarkdown>{content}</ReactMarkdown>
        {status === "streaming" && <span className="cursor">|</span>}
      </div>
    </div>
  );
}
