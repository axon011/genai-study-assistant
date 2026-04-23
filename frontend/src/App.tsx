import { useEffect, useState } from "react";
import { deleteSession, fetchSessionDetail, fetchSessions } from "./api/client";
import { CostDisplay } from "./components/CostDisplay";
import { FileUpload } from "./components/FileUpload";
import { FlashcardCarousel } from "./components/FlashcardCarousel";
import { QuizView } from "./components/QuizView";
import { SessionHistorySidebar } from "./components/SessionHistorySidebar";
import { StreamingResults } from "./components/StreamingResults";
import { useSSE } from "./hooks/useSSE";
import { useUpload } from "./hooks/useUpload";
import type {
  Flashcard,
  FlashcardRequest,
  QuizPayload,
  QuizRequest,
  SessionDetail,
  SessionListItem,
  StudyMode,
  SummarizeRequest,
} from "./types/api";
import "./App.css";

function stripCodeFence(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("```")) {
    return trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }
  return trimmed;
}

function parseFlashcards(value: string): Flashcard[] | null {
  try {
    const parsed = JSON.parse(stripCodeFence(value));
    if (!Array.isArray(parsed)) {
      return null;
    }

    const cards = parsed.filter(
      (item): item is Flashcard =>
        typeof item?.question === "string" && typeof item?.answer === "string"
    );

    return cards.length > 0 ? cards : null;
  } catch {
    return null;
  }
}

function parseQuiz(value: string): QuizPayload | null {
  try {
    const parsed = JSON.parse(stripCodeFence(value)) as QuizPayload;
    if (!Array.isArray(parsed.questions)) {
      return null;
    }
    return parsed.questions.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

function getModeLabel(mode: StudyMode): string {
  if (mode === "flashcards") {
    return "Flashcards";
  }

  if (mode === "quiz") {
    return "Quiz";
  }

  return "Summarize";
}

function getSessionModeLabel(mode: SessionDetail["mode"]): string {
  if (mode === "flashcard") {
    return "Flashcards";
  }

  if (mode === "quiz") {
    return "Quiz";
  }

  return "Summary";
}

function App() {
  const {
    state: uploadState,
    data: fileData,
    error: uploadError,
    upload,
    reset: resetUpload,
  } = useUpload();
  const {
    status: streamStatus,
    content,
    tokenInfo,
    error: streamError,
    startStream,
    reset: resetStream,
  } = useSSE();

  const [mode, setMode] = useState<StudyMode>("summarize");
  const [instructions, setInstructions] = useState("");
  const [flashcardCount, setFlashcardCount] = useState(10);
  const [flashcardDifficulty, setFlashcardDifficulty] = useState<
    "easy" | "medium" | "hard"
  >("medium");
  const [quizCount, setQuizCount] = useState(5);
  const [includeMcq, setIncludeMcq] = useState(true);
  const [includeShortAnswer, setIncludeShortAnswer] = useState(true);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<SessionDetail | null>(null);
  const [historyDetailError, setHistoryDetailError] = useState<string | null>(null);

  const loadSessions = async () => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await fetchSessions();
      setSessions(response.items);
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "Failed to load sessions"
      );
    } finally {
      setHistoryLoading(false);
    }
  };

  const loadSession = async (sessionId: string) => {
    setHistoryDetailError(null);

    try {
      const detail = await fetchSessionDetail(sessionId);
      setSelectedSession(detail);
      setSelectedSessionId(sessionId);
    } catch (error) {
      setHistoryDetailError(
        error instanceof Error ? error.message : "Failed to load session"
      );
    }
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  useEffect(() => {
    if (tokenInfo?.session_id) {
      void loadSessions();
      void loadSession(tokenInfo.session_id);
    }
  }, [tokenInfo?.session_id]);

  const handleGenerate = () => {
    if (!fileData) {
      return;
    }

    setSelectedSession(null);
    setSelectedSessionId(null);

    if (mode === "summarize") {
      const request: SummarizeRequest = {
        file_id: fileData.file_id,
        custom_instructions: instructions || undefined,
      };
      void startStream(mode, request);
      return;
    }

    if (mode === "flashcards") {
      const request: FlashcardRequest = {
        file_id: fileData.file_id,
        num_cards: flashcardCount,
        difficulty: flashcardDifficulty,
        custom_instructions: instructions || undefined,
      };
      void startStream(mode, request);
      return;
    }

    const questionTypes: NonNullable<QuizRequest["question_types"]> = [];
    if (includeMcq) {
      questionTypes.push("mcq");
    }
    if (includeShortAnswer) {
      questionTypes.push("short_answer");
    }

    const request: QuizRequest = {
      file_id: fileData.file_id,
      num_questions: quizCount,
      question_types: questionTypes.length > 0 ? questionTypes : ["mcq"],
      custom_instructions: instructions || undefined,
    };
    void startStream(mode, request);
  };

  const handleReset = () => {
    resetUpload();
    resetStream();
    setInstructions("");
    setSelectedSession(null);
    setSelectedSessionId(null);
  };

  const handleSelectSession = async (sessionId: string) => {
    resetStream();
    await loadSession(sessionId);
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await deleteSession(sessionId);
      if (selectedSessionId === sessionId) {
        setSelectedSession(null);
        setSelectedSessionId(null);
      }
      await loadSessions();
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "Failed to delete session"
      );
    }
  };

  const liveFlashcards = parseFlashcards(content);
  const liveQuiz = parseQuiz(content);
  const historyFlashcards =
    selectedSession?.mode === "flashcard" && selectedSession.result_text
      ? parseFlashcards(selectedSession.result_text)
      : null;
  const historyQuiz =
    selectedSession?.mode === "quiz" && selectedSession.result_text
      ? parseQuiz(selectedSession.result_text)
      : null;

  return (
    <div className="app-shell">
      <SessionHistorySidebar
        error={historyError}
        isLoading={historyLoading}
        onDelete={(sessionId) => {
          void handleDeleteSession(sessionId);
        }}
        onSelect={(sessionId) => {
          void handleSelectSession(sessionId);
        }}
        selectedSessionId={selectedSessionId}
        sessions={sessions}
      />

      <div className="app">
        <header className="header">
          <h1>GenAI Study Assistant</h1>
          <p className="subtitle">
            Upload your study materials and generate summaries, flashcards, and
            quizzes
          </p>
        </header>

        <main className="main">
          <FileUpload
            onUpload={upload}
            uploadState={uploadState}
            fileData={fileData}
            error={uploadError}
            onReset={handleReset}
          />

          {fileData && uploadState === "success" && (
            <div className="action-section">
              <div aria-label="Study modes" className="mode-tabs" role="tablist">
                {(["summarize", "flashcards", "quiz"] as StudyMode[]).map((item) => (
                  <button
                    aria-selected={mode === item}
                    className={`mode-tab ${mode === item ? "active" : ""}`}
                    key={item}
                    onClick={() => setMode(item)}
                    role="tab"
                    type="button"
                  >
                    {getModeLabel(item)}
                  </button>
                ))}
              </div>

              <textarea
                className="instructions-input"
                maxLength={500}
                onChange={(event) => setInstructions(event.target.value)}
                placeholder="Custom instructions (optional) - for example: focus on formulas, keep it concise, or emphasize definitions"
                rows={2}
                value={instructions}
              />

              {mode === "flashcards" && (
                <div className="mode-controls">
                  <label className="field">
                    <span>Number of cards</span>
                    <input
                      className="inline-input"
                      max={30}
                      min={1}
                      onChange={(event) =>
                        setFlashcardCount(Number(event.target.value))
                      }
                      type="number"
                      value={flashcardCount}
                    />
                  </label>

                  <label className="field">
                    <span>Difficulty</span>
                    <select
                      className="inline-input"
                      onChange={(event) =>
                        setFlashcardDifficulty(
                          event.target.value as "easy" | "medium" | "hard"
                        )
                      }
                      value={flashcardDifficulty}
                    >
                      <option value="easy">Easy</option>
                      <option value="medium">Medium</option>
                      <option value="hard">Hard</option>
                    </select>
                  </label>
                </div>
              )}

              {mode === "quiz" && (
                <div className="mode-controls">
                  <label className="field">
                    <span>Number of questions</span>
                    <input
                      className="inline-input"
                      max={20}
                      min={1}
                      onChange={(event) => setQuizCount(Number(event.target.value))}
                      type="number"
                      value={quizCount}
                    />
                  </label>

                  <label className="checkbox-field">
                    <input
                      checked={includeMcq}
                      onChange={(event) => setIncludeMcq(event.target.checked)}
                      type="checkbox"
                    />
                    <span>Include multiple choice</span>
                  </label>

                  <label className="checkbox-field">
                    <input
                      checked={includeShortAnswer}
                      onChange={(event) =>
                        setIncludeShortAnswer(event.target.checked)
                      }
                      type="checkbox"
                    />
                    <span>Include short answer</span>
                  </label>
                </div>
              )}

              <button className="btn-primary" onClick={handleGenerate} type="button">
                Generate {getModeLabel(mode)}
              </button>
            </div>
          )}

          {streamStatus === "streaming" && mode !== "summarize" && (
            <div className="streaming-container">
              <div className="streaming-header">
                <div className="spinner" />
                <span>Generating {getModeLabel(mode).toLowerCase()}...</span>
              </div>
            </div>
          )}

          {(mode === "summarize" || (!liveFlashcards && !liveQuiz)) && (
            <StreamingResults content={content} status={streamStatus} />
          )}

          {streamStatus === "complete" && mode === "flashcards" && liveFlashcards && (
            <FlashcardCarousel cards={liveFlashcards} key={tokenInfo?.session_id || content} />
          )}

          {streamStatus === "complete" && mode === "quiz" && liveQuiz && (
            <QuizView key={tokenInfo?.session_id || content} quiz={liveQuiz} />
          )}

          {tokenInfo && <CostDisplay tokenInfo={tokenInfo} />}

          {streamError && <p className="error-text">{streamError}</p>}
          {historyDetailError && <p className="error-text">{historyDetailError}</p>}

          {selectedSession && streamStatus === "idle" && (
            <section className="history-detail">
              <div className="history-detail-header">
                <div>
                  <h2>{selectedSession.file_name}</h2>
                  <p className="subtitle">
                    {getSessionModeLabel(selectedSession.mode)}
                  </p>
                </div>
              </div>

              {selectedSession.mode === "summarize" &&
                selectedSession.result_text && (
                  <StreamingResults
                    content={selectedSession.result_text}
                    status="complete"
                  />
                )}

              {selectedSession.mode === "flashcard" && historyFlashcards && (
                <FlashcardCarousel cards={historyFlashcards} key={selectedSession.id} />
              )}

              {selectedSession.mode === "quiz" && historyQuiz && (
                <QuizView key={selectedSession.id} quiz={historyQuiz} />
              )}

              {!selectedSession.result_text && (
                <p className="history-empty">This session has no stored output.</p>
              )}
            </section>
          )}
        </main>

        <footer className="footer">
          <p>Built with React + FastAPI + GLM-4.5 + SSE streaming</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
