"""
JWT authentication for WebSocket connections.
"""

import logging
from dataclasses import dataclass
from typing import Optional

import jwt

from .config import config

logger = logging.getLogger(__name__)


@dataclass
class TokenPayload:
    """Decoded JWT token payload."""

    user_id: str
    issued_at: int
    expires_at: int
    token_id: str


def decode_token(token: str) -> Optional[TokenPayload]:
    """
    Decode and validate a JWT token.

    Args:
        token: The JWT token string

    Returns:
        TokenPayload if valid, None otherwise
    """
    try:
        payload = jwt.decode(
            token,
            config.JWT_SECRET,
            algorithms=[config.JWT_ALGORITHM],
        )
        return TokenPayload(
            user_id=payload["sub"],
            issued_at=payload["iat"],
            expires_at=payload["exp"],
            token_id=payload.get("jti", ""),
        )
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        return None


def validate_token(token: str) -> Optional[str]:
    """
    Validate a JWT token and return the user ID.

    Args:
        token: The JWT token string

    Returns:
        User ID if valid, None otherwise
    """
    payload = decode_token(token)
    if payload is None:
        return None
    return payload.user_id
