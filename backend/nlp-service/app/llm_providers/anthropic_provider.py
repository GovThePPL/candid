"""Anthropic Claude LLM provider."""

import os
import logging

from .base import LLMProvider

logger = logging.getLogger(__name__)


class AnthropicProvider(LLMProvider):
    """LLM provider using Anthropic's Claude API."""

    def __init__(self):
        import anthropic
        self._client = anthropic.AsyncAnthropic(
            api_key=os.environ.get("ANTHROPIC_API_KEY"),
        )
        self._model = os.environ.get("LLM_MODEL", "claude-sonnet-4-20250514")

    async def generate(self, system_prompt: str, user_message: str,
                       max_tokens: int = 2048) -> str:
        response = await self._client.messages.create(
            model=self._model,
            max_tokens=max_tokens,
            system=system_prompt,
            messages=[{"role": "user", "content": user_message}],
        )
        return response.content[0].text
