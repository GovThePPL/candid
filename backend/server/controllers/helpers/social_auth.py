"""Social login token validation for Apple and Google identity tokens.

Validates JWTs from Apple/Google using their public JWKS endpoints.
"""

import logging
from jwt import PyJWKClient, decode as jwt_decode
from jwt.exceptions import PyJWTError

from candid.controllers import config

logger = logging.getLogger(__name__)

# JWKS clients with caching (keys are rotated by the provider)
_google_jwks_client = None
_apple_jwks_client = None

GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys"


def _get_google_jwks_client():
    global _google_jwks_client
    if _google_jwks_client is None:
        _google_jwks_client = PyJWKClient(GOOGLE_JWKS_URL, cache_keys=True)
    return _google_jwks_client


def _get_apple_jwks_client():
    global _apple_jwks_client
    if _apple_jwks_client is None:
        _apple_jwks_client = PyJWKClient(APPLE_JWKS_URL, cache_keys=True)
    return _apple_jwks_client


def _get_google_audiences():
    """Return all configured Google client IDs as valid audiences."""
    audiences = []
    for cid in [config.GOOGLE_CLIENT_ID_IOS, config.GOOGLE_CLIENT_ID_ANDROID, config.GOOGLE_CLIENT_ID_WEB]:
        if cid:
            audiences.append(cid)
    return audiences


def validate_google_token(id_token):
    """Validate a Google identity token.

    Args:
        id_token: JWT string from Google Sign-In SDK.

    Returns:
        dict with {sub, email, name, email_verified} on success.

    Raises:
        ValueError: If the token is invalid, expired, or has wrong audience.
    """
    audiences = _get_google_audiences()
    if not audiences:
        raise ValueError("No Google client IDs configured")

    try:
        jwks_client = _get_google_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(id_token)

        payload = jwt_decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audiences,
            issuer=["https://accounts.google.com", "accounts.google.com"],
        )

        if not payload.get("email_verified"):
            raise ValueError("Google email not verified")

        return {
            "sub": payload["sub"],
            "email": payload.get("email"),
            "name": payload.get("name"),
            "email_verified": payload.get("email_verified", False),
        }

    except PyJWTError as e:
        raise ValueError(f"Invalid Google token: {e}")


def validate_apple_token(id_token):
    """Validate an Apple identity token.

    Args:
        id_token: JWT string from Sign in with Apple SDK.

    Returns:
        dict with {sub, email, email_verified} on success.
        Note: Apple only provides name on first sign-in (via userInfo),
        not in the JWT.

    Raises:
        ValueError: If the token is invalid, expired, or has wrong audience.
    """
    # Apple tokens use the bundle ID or Services ID as audience
    audiences = [config.APPLE_SERVICE_ID]

    try:
        jwks_client = _get_apple_jwks_client()
        signing_key = jwks_client.get_signing_key_from_jwt(id_token)

        payload = jwt_decode(
            id_token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audiences,
            issuer="https://appleid.apple.com",
        )

        return {
            "sub": payload["sub"],
            "email": payload.get("email"),
            "email_verified": payload.get("email_verified", False),
        }

    except PyJWTError as e:
        raise ValueError(f"Invalid Apple token: {e}")
