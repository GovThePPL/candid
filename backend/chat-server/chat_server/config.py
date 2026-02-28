"""
Configuration settings for the chat server.
"""

import os


class Config:
    """Configuration settings loaded from environment variables."""

    # Server settings
    PORT: int = int(os.getenv("PORT", "8002"))
    HOST: str = os.getenv("HOST", "0.0.0.0")

    # Database settings
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL", "postgresql://user:postgres@db:5432/candid"
    )

    # Redis settings
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://redis:6379")

    # Keycloak settings
    KEYCLOAK_URL: str = os.getenv("KEYCLOAK_URL", "http://keycloak:8180")
    KEYCLOAK_REALM: str = os.getenv("KEYCLOAK_REALM", "candid")

    # Redis key prefixes
    CHAT_MESSAGES_KEY = "chat:{chat_id}:messages"
    CHAT_POSITIONS_KEY = "chat:{chat_id}:positions"
    CHAT_CLOSURE_KEY = "chat:{chat_id}:closure"
    CHAT_DEFINITIONS_KEY = "chat:{chat_id}:definitions"
    CHAT_EXPLANATIONS_KEY = "chat:{chat_id}:explanations"
    CHAT_METADATA_KEY = "chat:{chat_id}:metadata"
    USER_ACTIVE_CHATS_KEY = "user:{user_id}:active_chats"

    # NLP service settings (for server-side toxicity checking)
    NLP_SERVICE_URL: str = os.getenv("NLP_SERVICE_URL", "http://nlp:5001")
    NLP_SERVICE_TIMEOUT: int = int(os.getenv("NLP_SERVICE_TIMEOUT", "3"))
    TOXICITY_THRESHOLD: float = float(os.getenv("TOXICITY_THRESHOLD", "0.7"))

    # Message TTL in Redis (24 hours as backup - normally exported on chat end)
    REDIS_MESSAGE_TTL: int = 86400


config = Config()
