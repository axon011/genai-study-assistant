import { useCallback, useEffect, useState } from "react";
import type { Flashcard } from "../types/api";

interface Props {
  cards: Flashcard[];
}

export function FlashcardCarousel({ cards }: Props) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [visited, setVisited] = useState<Set<number>>(() => new Set([0]));

  const activeCard = cards[index];

  const goTo = useCallback(
    (i: number) => {
      setFlipped(false);
      setIndex(i);
      setVisited((prev) => new Set(prev).add(i));
    },
    []
  );

  const showPrevious = () => goTo(index === 0 ? cards.length - 1 : index - 1);
  const showNext = () => goTo(index === cards.length - 1 ? 0 : index + 1);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") showPrevious();
      else if (e.key === "ArrowRight") showNext();
      else if (e.key === " ") { e.preventDefault(); setFlipped((p) => !p); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  });

  return (
    <div className="flashcard-panel">
      <div className="flashcard-toolbar">
        <span className="panel-title">Flashcards</span>
        <span className="panel-meta">
          {index + 1} / {cards.length}
        </span>
      </div>

      <div
        className="flashcard-scene"
        onClick={() => setFlipped((prev) => !prev)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setFlipped((prev) => !prev);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <div className={`flashcard-card ${flipped ? "is-flipped" : ""}`}>
          <div className="flashcard-face flashcard-front">
            <span className="flashcard-label">Question</span>
            <p>{activeCard.question}</p>
          </div>
          <div className="flashcard-face flashcard-back">
            <span className="flashcard-label">Answer</span>
            <p>{activeCard.answer}</p>
          </div>
        </div>
      </div>

      <p className="flashcard-hint">Click card to flip &middot; Arrow keys to navigate</p>

      <div className="flashcard-progress">
        {cards.map((_, i) => (
          <button
            className={`flashcard-dot ${i === index ? "active" : ""} ${visited.has(i) && i !== index ? "visited" : ""}`}
            key={i}
            onClick={() => goTo(i)}
            type="button"
          />
        ))}
      </div>

      <div className="flashcard-actions">
        <button className="btn-secondary" onClick={showPrevious} type="button">
          ← Previous
        </button>
        <button
          className="btn-secondary"
          onClick={() => setFlipped((prev) => !prev)}
          type="button"
        >
          {flipped ? "Show Question" : "Show Answer"}
        </button>
        <button className="btn-secondary" onClick={showNext} type="button">
          Next →
        </button>
      </div>
    </div>
  );
}
