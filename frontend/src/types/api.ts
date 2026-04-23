export interface FileUploadResponse {
  file_id: string;
  original_filename: string;
  file_type: string;
  file_size_bytes: number;
  char_count: number | null;
  text_preview: string | null;
  status: string;
  created_at: string;
}

export type StudyMode = "summarize" | "flashcards" | "quiz";
export type SessionMode = "summarize" | "flashcard" | "quiz";

export interface SummarizeRequest {
  file_id: string;
  custom_instructions?: string;
}

export interface FlashcardRequest {
  file_id: string;
  num_cards?: number;
  difficulty?: "easy" | "medium" | "hard";
  custom_instructions?: string;
}

export interface QuizRequest {
  file_id: string;
  num_questions?: number;
  question_types?: Array<"mcq" | "short_answer">;
  custom_instructions?: string;
}

export interface StreamChunkEvent {
  chunk: string;
  tokens_used: number;
  cumulative_cost: number;
}

export interface StreamCompleteEvent {
  total_tokens: number;
  total_cost: number;
  session_id: string;
  input_tokens: number;
  output_tokens: number;
}

export interface StreamErrorEvent {
  error: string;
}

export type SSEEvent =
  | ({ _event: "stream" } & StreamChunkEvent)
  | ({ _event: "complete" } & StreamCompleteEvent)
  | ({ _event: "error" } & StreamErrorEvent);

export interface Flashcard {
  question: string;
  answer: string;
}

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizMcqQuestion {
  type: "mcq";
  question: string;
  options: QuizOption[];
  correct_answer: string;
  explanation: string;
}

export interface QuizShortAnswerQuestion {
  type: "short_answer";
  question: string;
  acceptable_answers: string[];
  explanation: string;
}

export type QuizQuestion = QuizMcqQuestion | QuizShortAnswerQuestion;

export interface QuizPayload {
  questions: QuizQuestion[];
}

export interface SessionListItem {
  id: string;
  file_id: string;
  file_name: string;
  mode: SessionMode;
  status: string;
  created_at: string;
  completed_at: string | null;
}

export interface SessionListResponse {
  items: SessionListItem[];
  page: number;
  page_size: number;
  total: number;
}

export interface SessionDetail {
  id: string;
  file_id: string;
  file_name: string;
  mode: SessionMode;
  prompt_template: string | null;
  model_name: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  estimated_cost: number | null;
  result_text: string | null;
  status: string;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}
