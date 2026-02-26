"""OpenAI LLM provider."""

import os
import logging

from .base import LLMProvider

logger = logging.getLogger(__name__)


class OpenAIProvider(LLMProvider):
    """LLM provider using OpenAI's API."""

    def __init__(self):
        import openai
        self._client = openai.AsyncOpenAI(
            api_key=os.environ.get("OPENAI_API_KEY"),
        )
        self._model = os.environ.get("LLM_MODEL", "gpt-4o")

    async def generate(self, system_prompt: str, user_message: str,
                       max_tokens: int = 2048) -> str:
        response = await self._client.chat.completions.create(
            model=self._model,
            max_tokens=max_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message},
            ],
        )
        return response.choices[0].message.content
