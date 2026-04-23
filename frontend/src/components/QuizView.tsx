import { useState } from "react";
import type { QuizPayload } from "../types/api";

interface Props {
  quiz: QuizPayload;
}

function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function QuizView({ quiz }: Props) {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const score = quiz.questions.reduce((total, question, index) => {
    const answer = answers[index];
    if (!answer) {
      return total;
    }

    if (question.type === "mcq") {
      return total + (answer === question.correct_answer ? 1 : 0);
    }

    const normalized = normalizeAnswer(answer);
    const isCorrect = question.acceptable_answers.some(
      (item) => normalizeAnswer(item) === normalized
    );
    return total + (isCorrect ? 1 : 0);
  }, 0);

  return (
    <div className="quiz-panel">
      <div className="quiz-header">
        <span className="panel-title">Quiz</span>
        {submitted && (
          <span className="quiz-score">
            Score: {score} / {quiz.questions.length}
          </span>
        )}
      </div>

      <div className="quiz-list">
        {quiz.questions.map((question, index) => {
          const answer = answers[index] || "";
          const correct =
            question.type === "mcq"
              ? answer === question.correct_answer
              : question.acceptable_answers.some(
                  (item) => normalizeAnswer(item) === normalizeAnswer(answer)
                );

          return (
            <section className="quiz-question" key={`${question.type}-${index}`}>
              <div className="quiz-question-header">
                <span className="quiz-number">Question {index + 1}</span>
                <span className="quiz-type">
                  {question.type === "mcq" ? "Multiple Choice" : "Short Answer"}
                </span>
              </div>

              <p className="quiz-prompt">{question.question}</p>

              {question.type === "mcq" ? (
                <div className="quiz-options">
                  {question.options.map((option) => (
                    <label className="quiz-option" key={option.id}>
                      <input
                        checked={answer === option.id}
                        name={`quiz-${index}`}
                        onChange={() =>
                          setAnswers((prev) => ({ ...prev, [index]: option.id }))
                        }
                        type="radio"
                      />
                      <span>
                        <strong>{option.id}.</strong> {option.text}
                      </span>
                    </label>
                  ))}
                </div>
              ) : (
                <textarea
                  className="instructions-input quiz-textarea"
                  onChange={(event) =>
                    setAnswers((prev) => ({ ...prev, [index]: event.target.value }))
                  }
                  placeholder="Type your answer"
                  rows={3}
                  value={answer}
                />
              )}

              {submitted && (
                <div className={`quiz-feedback ${correct ? "correct" : "incorrect"}`}>
                  <p>{correct ? "Correct" : "Incorrect"}</p>
                  {question.type === "mcq" ? (
                    <p>Correct answer: {question.correct_answer}</p>
                  ) : (
                    <p>Accepted answers: {question.acceptable_answers.join(", ")}</p>
                  )}
                  <p>{question.explanation}</p>
                </div>
              )}
            </section>
          );
        })}
      </div>

      <button className="btn-primary" onClick={() => setSubmitted(true)} type="button">
        Score Quiz
      </button>
    </div>
  );
}
