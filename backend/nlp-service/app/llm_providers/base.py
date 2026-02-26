"""Abstract base class for LLM providers."""

from abc import ABC, abstractmethod


class LLMProvider(ABC):
    """Abstract LLM provider interface."""

    @abstractmethod
    async def generate(self, system_prompt: str, user_message: str,
                       max_tokens: int = 2048) -> str:
        """Generate a response from the LLM.

        Args:
            system_prompt: System-level instructions for the model.
            user_message: The user's input message.
            max_tokens: Maximum tokens in the response.

        Returns:
            Generated text content.

        Raises:
            Exception: If the API call fails.
        """
        ...
