from collections.abc import AsyncGenerator

import tiktoken
from openai import AsyncOpenAI

MODEL_PRICING = {
    "gpt-4o": {"input": 2.50 / 1_000_000, "output": 10.00 / 1_000_000},
    "gpt-4o-mini": {"input": 0.15 / 1_000_000, "output": 0.60 / 1_000_000},
}


class LLMService:
    def __init__(self, api_key: str, model: str = "gpt-4o") -> None:
        self.client = AsyncOpenAI(api_key=api_key)
        self.model = model
        try:
            self.encoder = tiktoken.encoding_for_model(model)
        except KeyError:
            self.encoder = tiktoken.get_encoding("cl100k_base")

    def count_tokens(self, text: str) -> int:
        return len(self.encoder.encode(text))

    def estimate_cost(self, input_tokens: int, output_tokens: int) -> float:
        pricing = MODEL_PRICING.get(self.model, MODEL_PRICING["gpt-4o"])
        return round(input_tokens * pricing["input"] + output_tokens * pricing["output"], 6)

    async def stream_completion(
        self, messages: list[dict[str, str]]
    ) -> AsyncGenerator[dict, None]:
        input_text = " ".join(m["content"] for m in messages)
        input_tokens = self.count_tokens(input_text)
        output_tokens = 0
        full_response = ""

        stream = await self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            stream=True,
            stream_options={"include_usage": True},
        )

        async for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                text = chunk.choices[0].delta.content
                output_tokens += self.count_tokens(text)
                full_response += text

                yield {
                    "type": "chunk",
                    "chunk": text,
                    "tokens_used": output_tokens,
                    "cumulative_cost": self.estimate_cost(input_tokens, output_tokens),
                }

            if hasattr(chunk, "usage") and chunk.usage:
                input_tokens = chunk.usage.prompt_tokens
                output_tokens = chunk.usage.completion_tokens

        yield {
            "type": "complete",
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
            "total_tokens": input_tokens + output_tokens,
            "total_cost": self.estimate_cost(input_tokens, output_tokens),
            "full_response": full_response,
        }
