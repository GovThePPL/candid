"""
JWT authentication for WebSocket connections using Keycloak RS256 JWKS.
"""

import logging
from dataclasses import dataclass
from typing import Optional

import jwt
from jwt import PyJWKClient

from .config import config

logger = logging.getLogger(__name__)

# JWKS client with caching
_jwks_client = None


def _get_jwks_client():
    global _jwks_client
    if _jwks_client is None:
        jwks_url = f"{config.KEYCLOAK_URL}/realms/{config.KEYCLOAK_REALM}/protocol/openid-connect/certs"
        _jwks_client = PyJWKClient(jwks_url, cache_keys=True)
    return _jwks_client


@dataclass
class TokenPayload:
    """Decoded JWT token payload."""

    keycloak_id: str
    issued_at: int
    expires_at: int
    token_id: str


def decode_token(token: str) -> Optional[TokenPayload]:
    """
    Decode and validate a Keycloak RS256 JWT token.

    Args:
        token: The JWT token string

    Returns:
        TokenPayload if valid, None otherwise
    """
    try:
        jwks_client = _get_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(token)

        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience="users",
        )

        return TokenPayload(
            keycloak_id=payload.get("sub", ""),
            issued_at=payload.get("iat", 0),
            expires_at=payload.get("exp", 0),
            token_id=payload.get("jti", ""),
        )
    except jwt.ExpiredSignatureError:
        logger.warning("Token has expired")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid token: {e}")
        return None
    except Exception as e:
        logger.warning(f"Token decode error: {e}")
        return None


async def resolve_keycloak_id(pool, keycloak_id: str) -> Optional[str]:
    """
    Look up the Candid user_id from a Keycloak sub claim.

    Args:
        pool: asyncpg connection pool
        keycloak_id: Keycloak subject identifier

    Returns:
        Candid user UUID string, or None if not found
    """
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "SELECT id FROM users WHERE keycloak_id = $1", keycloak_id
        )
        if row:
            return str(row["id"])
    return None


def validate_token(token: str) -> Optional[str]:
    """
    Validate a JWT token and return the Keycloak subject ID.
    The caller must then resolve this to a Candid user_id via resolve_keycloak_id().

    Args:
        token: The JWT token string

    Returns:
        Keycloak subject ID if valid, None otherwise
    """
    payload = decode_token(token)
    if payload is None:
        return None
    return payload.keycloak_id
