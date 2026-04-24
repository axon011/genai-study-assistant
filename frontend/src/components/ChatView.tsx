import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { streamChat } from "../api/client";
import type { ChatMessage, ChatSource } from "../types/api";

interface Props {
  fileId: string;
  fileName: string;
}

export function ChatView({ fileId, fileName }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [streamContent, setStreamContent] = useState("");
  const [sources, setSources] = useState<ChatSource[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamContent]);

  const handleSend = async () => {
    if (!input.trim() || streaming) return;

    const userMessage = input.trim();
    setInput("");
    setError(null);
    setSources([]);

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);
    setStreamContent("");

    try {
      for await (const event of streamChat({
        file_id: fileId,
        message: userMessage,
        conversation_id: conversationId,
      })) {
        if (event._event === "init") {
          setConversationId(event.conversation_id);
        } else if (event._event === "stream") {
          setStreamContent((prev) => prev + event.chunk);
        } else if (event._event === "complete") {
          setSources(event.sources || []);
          setConversationId(event.conversation_id);
        } else if (event._event === "error") {
          setError(event.error);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Chat failed");
    }

    setStreaming(false);
    setStreamContent((final) => {
      if (final) {
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: final,
          sources: sources.length > 0 ? sources : undefined,
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => [...prev, assistantMsg]);
      }
      return "";
    });
  };

  return (
    <div className="chat-view">
      <div className="chat-header">
        <span className="chat-title">Chat with {fileName}</span>
        {messages.length > 0 && (
          <button
            className="btn-secondary btn-sm"
            onClick={() => {
              setMessages([]);
              setConversationId(undefined);
              setSources([]);
            }}
            type="button"
          >
            New Chat
          </button>
        )}
      </div>

      <div className="chat-messages">
        {messages.length === 0 && !streaming && (
          <div className="chat-empty">
            <p className="chat-empty-title">Ask a question about your document</p>
            <p className="chat-empty-hint">
              The AI will search relevant sections and answer with citations
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div key={msg.id} className={`chat-bubble ${msg.role}`}>
            <div className="chat-bubble-label">
              {msg.role === "user" ? "You" : "AI Assistant"}
            </div>
            <div className="chat-bubble-content">
              {msg.role === "assistant" ? (
                <ReactMarkdown>{msg.content}</ReactMarkdown>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
            {msg.sources && msg.sources.length > 0 && (
              <div className="chat-sources">
                {msg.sources.map((s) => (
                  <span key={s.source_num} className="source-badge">
                    Source {s.source_num}: {s.filename} (chunk{" "}
                    {s.chunk_index + 1}/{s.total_chunks})
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {streaming && streamContent && (
          <div className="chat-bubble assistant">
            <div className="chat-bubble-label">AI Assistant</div>
            <div className="chat-bubble-content">
              <ReactMarkdown>{streamContent}</ReactMarkdown>
              <span className="cursor">|</span>
            </div>
          </div>
        )}

        {streaming && !streamContent && (
          <div className="chat-bubble assistant">
            <div className="chat-bubble-label">AI Assistant</div>
            <div className="chat-bubble-content">
              <div className="chat-thinking">
                <div className="spinner" />
                <span>Searching documents and thinking...</span>
              </div>
            </div>
          </div>
        )}

        {error && <p className="error-text">{error}</p>}
        <div ref={bottomRef} />
      </div>

      <div className="chat-input-bar">
        <textarea
          className="chat-input"
          disabled={streaming}
          maxLength={2000}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about the document..."
          rows={1}
          value={input}
        />
        <button
          className="btn-primary btn-send"
          disabled={!input.trim() || streaming}
          onClick={handleSend}
          type="button"
        >
          Send
        </button>
      </div>
    </div>
  );
}
