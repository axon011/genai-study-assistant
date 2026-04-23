import type { SessionListItem } from "../types/api";

interface Props {
  sessions: SessionListItem[];
  selectedSessionId: string | null;
  isLoading: boolean;
  error: string | null;
  onDelete: (sessionId: string) => void;
  onSelect: (sessionId: string) => void;
}

function formatMode(mode: SessionListItem["mode"]): string {
  if (mode === "flashcard") {
    return "Flashcards";
  }

  if (mode === "quiz") {
    return "Quiz";
  }

  return "Summary";
}

export function SessionHistorySidebar({
  sessions,
  selectedSessionId,
  isLoading,
  error,
  onDelete,
  onSelect,
}: Props) {
  return (
    <aside className="history-sidebar">
      <div className="history-header">
        <h2>Session History</h2>
        <span>{sessions.length} items</span>
      </div>

      {isLoading && <p className="history-empty">Loading sessions...</p>}
      {error && <p className="error-text">{error}</p>}
      {!isLoading && !error && sessions.length === 0 && (
        <p className="history-empty">No sessions yet.</p>
      )}

      <div className="history-list">
        {sessions.map((session) => (
          <div
            className={`history-item ${selectedSessionId === session.id ? "selected" : ""}`}
            key={session.id}
          >
            <button
              className="history-select"
              onClick={() => onSelect(session.id)}
              type="button"
            >
              <span className="history-mode">{formatMode(session.mode)}</span>
              <span className="history-file">{session.file_name}</span>
              <span className="history-meta">
                {new Date(session.created_at).toLocaleString()}
              </span>
            </button>
            <button
              aria-label={`Delete session ${session.id}`}
              className="history-delete"
              onClick={() => onDelete(session.id)}
              type="button"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </aside>
  );
}
