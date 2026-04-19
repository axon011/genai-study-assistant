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

export interface SummarizeRequest {
  file_id: string;
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
  | { _event: "stream" } & StreamChunkEvent
  | { _event: "complete" } & StreamCompleteEvent
  | { _event: "error" } & StreamErrorEvent;
