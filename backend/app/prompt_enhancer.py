"""Optional prompt enhancer. A simple template for now; can be swapped for an LLM later."""

from __future__ import annotations

QUALITY_SUFFIX = (
    "highly detailed, sharp focus, balanced composition, natural lighting, "
    "rich color, professional quality"
)
# Short prompts ("a cat") benefit most; long prompts are usually already specific.
SHORT_PROMPT_WORDS = 12


def enhance_prompt(prompt: str) -> str:
    prompt = prompt.strip().rstrip(".")
    if len(prompt.split()) <= SHORT_PROMPT_WORDS:
        return f"A detailed, high-quality image of {prompt}. {QUALITY_SUFFIX}."
    return f"{prompt}. {QUALITY_SUFFIX}."
