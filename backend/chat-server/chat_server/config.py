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
        "DATABASE_URL", "postgresql://user:postgres@localhost:5432/candid"
    )

    # Redis settings
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379")

    # JWT settings
    JWT_SECRET: str = os.getenv("JWT_SECRET", "abc")
    JWT_ALGORITHM: str = "HS256"

    # Redis key prefixes
    CHAT_MESSAGES_KEY = "chat:{chat_id}:messages"
    CHAT_POSITIONS_KEY = "chat:{chat_id}:positions"
    CHAT_CLOSURE_KEY = "chat:{chat_id}:closure"
    CHAT_METADATA_KEY = "chat:{chat_id}:metadata"
    USER_ACTIVE_CHATS_KEY = "user:{user_id}:active_chats"

    # Message TTL in Redis (24 hours as backup - normally exported on chat end)
    REDIS_MESSAGE_TTL: int = 86400


config = Config()
