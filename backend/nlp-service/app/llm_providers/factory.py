"""Factory for creating LLM provider instances."""

import os
import logging

from .base import LLMProvider

logger = logging.getLogger(__name__)

_provider_instance: LLMProvider | None = None


def create_provider() -> LLMProvider:
    """Create an LLM provider based on the LLM_PROVIDER env var.

    Returns:
        An LLMProvider instance.

    Raises:
        ValueError: If the provider name is not recognized.
        RuntimeError: If the required API key is not set.
    """
    provider_name = os.environ.get("LLM_PROVIDER", "anthropic").lower()

    if provider_name == "anthropic":
        if not os.environ.get("ANTHROPIC_API_KEY"):
            raise RuntimeError("ANTHROPIC_API_KEY is required for Anthropic provider")
        from .anthropic_provider import AnthropicProvider
        return AnthropicProvider()

    elif provider_name == "openai":
        if not os.environ.get("OPENAI_API_KEY"):
            raise RuntimeError("OPENAI_API_KEY is required for OpenAI provider")
        from .openai_provider import OpenAIProvider
        return OpenAIProvider()

    else:
        raise ValueError(f"Unknown LLM provider: {provider_name}")


def get_provider() -> LLMProvider:
    """Get or create the singleton LLM provider instance."""
    global _provider_instance
    if _provider_instance is None:
        _provider_instance = create_provider()
        logger.info("LLM provider initialized: %s", type(_provider_instance).__name__)
    return _provider_instance


def reset_provider():
    """Reset the singleton (for testing)."""
    global _provider_instance
    _provider_instance = None
