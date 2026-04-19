from pathlib import Path

from jinja2 import Environment, FileSystemLoader

SYSTEM_PROMPTS = {
    "summarize": (
        "You are an expert academic tutor and study assistant. "
        "Create comprehensive, well-structured summaries of study materials. "
        "Use markdown formatting with headings, bullet points, and emphasis. "
        "Preserve important definitions, formulas, and examples. "
        "Be thorough but concise."
    ),
}


class PromptService:
    def __init__(self) -> None:
        template_dir = Path(__file__).parent.parent / "prompts" / "templates"
        self.env = Environment(
            loader=FileSystemLoader(str(template_dir)),
            autoescape=False,
        )

    def render_messages(
        self,
        mode: str,
        text: str,
        custom_instructions: str | None = None,
    ) -> list[dict[str, str]]:
        system_prompt = SYSTEM_PROMPTS.get(mode)
        if not system_prompt:
            raise ValueError(f"Unknown mode: {mode}")

        template = self.env.get_template(f"{mode}.j2")
        user_content = template.render(text=text, custom_instructions=custom_instructions)

        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ]
