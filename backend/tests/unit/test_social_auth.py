"""Unit tests for social_auth.py — Apple and Google identity token validation."""

import pytest
from unittest.mock import patch, MagicMock
from jwt.exceptions import PyJWTError, ExpiredSignatureError, InvalidAudienceError

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# validate_google_token
# ---------------------------------------------------------------------------

class TestValidateGoogleToken:
    def test_valid_token(self):
        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "google-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.social_auth._get_google_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.social_auth.jwt_decode", return_value={
                 "sub": "google-sub-123",
                 "email": "user@gmail.com",
                 "name": "Test User",
                 "email_verified": True,
             }), \
             patch("candid.controllers.helpers.social_auth.config") as mock_config:
            mock_config.GOOGLE_CLIENT_ID_IOS = "ios-client-id"
            mock_config.GOOGLE_CLIENT_ID_ANDROID = "android-client-id"
            mock_config.GOOGLE_CLIENT_ID_WEB = "web-client-id"

            from candid.controllers.helpers.social_auth import validate_google_token
            result = validate_google_token("valid-google-jwt")

            assert result["sub"] == "google-sub-123"
            assert result["email"] == "user@gmail.com"
            assert result["name"] == "Test User"
            assert result["email_verified"] is True

    def test_unverified_email_rejected(self):
        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "google-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.social_auth._get_google_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.social_auth.jwt_decode", return_value={
                 "sub": "google-sub-123",
                 "email": "user@gmail.com",
                 "email_verified": False,
             }), \
             patch("candid.controllers.helpers.social_auth.config") as mock_config:
            mock_config.GOOGLE_CLIENT_ID_IOS = "ios-id"
            mock_config.GOOGLE_CLIENT_ID_ANDROID = ""
            mock_config.GOOGLE_CLIENT_ID_WEB = ""

            from candid.controllers.helpers.social_auth import validate_google_token
            with pytest.raises(ValueError, match="email not verified"):
                validate_google_token("unverified-email-jwt")

    def test_expired_token_rejected(self):
        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "google-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.social_auth._get_google_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.social_auth.jwt_decode",
                   side_effect=ExpiredSignatureError("Signature has expired")), \
             patch("candid.controllers.helpers.social_auth.config") as mock_config:
            mock_config.GOOGLE_CLIENT_ID_IOS = "ios-id"
            mock_config.GOOGLE_CLIENT_ID_ANDROID = ""
            mock_config.GOOGLE_CLIENT_ID_WEB = ""

            from candid.controllers.helpers.social_auth import validate_google_token
            with pytest.raises(ValueError, match="Invalid Google token"):
                validate_google_token("expired-jwt")

    def test_wrong_audience_rejected(self):
        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "google-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.social_auth._get_google_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.social_auth.jwt_decode",
                   side_effect=InvalidAudienceError("Invalid audience")), \
             patch("candid.controllers.helpers.social_auth.config") as mock_config:
            mock_config.GOOGLE_CLIENT_ID_IOS = "ios-id"
            mock_config.GOOGLE_CLIENT_ID_ANDROID = ""
            mock_config.GOOGLE_CLIENT_ID_WEB = ""

            from candid.controllers.helpers.social_auth import validate_google_token
            with pytest.raises(ValueError, match="Invalid Google token"):
                validate_google_token("wrong-audience-jwt")

    def test_no_client_ids_configured(self):
        with patch("candid.controllers.helpers.social_auth.config") as mock_config:
            mock_config.GOOGLE_CLIENT_ID_IOS = ""
            mock_config.GOOGLE_CLIENT_ID_ANDROID = ""
            mock_config.GOOGLE_CLIENT_ID_WEB = ""

            from candid.controllers.helpers.social_auth import validate_google_token
            with pytest.raises(ValueError, match="No Google client IDs configured"):
                validate_google_token("some-jwt")

    def test_audiences_include_all_configured_ids(self):
        """All non-empty client IDs should be accepted as valid audiences."""
        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "google-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.social_auth._get_google_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.social_auth.jwt_decode", return_value={
                 "sub": "sub", "email": "a@b.com", "email_verified": True,
             }) as mock_decode, \
             patch("candid.controllers.helpers.social_auth.config") as mock_config:
            mock_config.GOOGLE_CLIENT_ID_IOS = "ios-id"
            mock_config.GOOGLE_CLIENT_ID_ANDROID = ""
            mock_config.GOOGLE_CLIENT_ID_WEB = "web-id"

            from candid.controllers.helpers.social_auth import validate_google_token
            validate_google_token("jwt")

            # Verify audience param includes both non-empty IDs
            call_kwargs = mock_decode.call_args
            assert call_kwargs[1]["audience"] == ["ios-id", "web-id"]


# ---------------------------------------------------------------------------
# validate_apple_token
# ---------------------------------------------------------------------------

class TestValidateAppleToken:
    def test_valid_token(self):
        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "apple-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.social_auth._get_apple_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.social_auth.jwt_decode", return_value={
                 "sub": "apple-sub-456",
                 "email": "user@privaterelay.appleid.com",
                 "email_verified": True,
             }), \
             patch("candid.controllers.helpers.social_auth.config") as mock_config:
            mock_config.APPLE_SERVICE_ID = "com.candid.app"

            from candid.controllers.helpers.social_auth import validate_apple_token
            result = validate_apple_token("valid-apple-jwt")

            assert result["sub"] == "apple-sub-456"
            assert result["email"] == "user@privaterelay.appleid.com"

    def test_expired_token_rejected(self):
        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "apple-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.social_auth._get_apple_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.social_auth.jwt_decode",
                   side_effect=ExpiredSignatureError("Expired")), \
             patch("candid.controllers.helpers.social_auth.config") as mock_config:
            mock_config.APPLE_SERVICE_ID = "com.candid.app"

            from candid.controllers.helpers.social_auth import validate_apple_token
            with pytest.raises(ValueError, match="Invalid Apple token"):
                validate_apple_token("expired-jwt")

    def test_uses_correct_issuer(self):
        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "apple-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.social_auth._get_apple_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.social_auth.jwt_decode", return_value={
                 "sub": "sub", "email": "a@b.com",
             }) as mock_decode, \
             patch("candid.controllers.helpers.social_auth.config") as mock_config:
            mock_config.APPLE_SERVICE_ID = "com.candid.app"

            from candid.controllers.helpers.social_auth import validate_apple_token
            validate_apple_token("jwt")

            call_kwargs = mock_decode.call_args
            assert call_kwargs[1]["issuer"] == "https://appleid.apple.com"
            assert call_kwargs[1]["audience"] == ["com.candid.app"]

    def test_no_email_in_token(self):
        """Apple may omit email after first sign-in."""
        mock_jwks = MagicMock()
        mock_signing_key = MagicMock()
        mock_signing_key.key = "apple-key"
        mock_jwks.get_signing_key_from_jwt = MagicMock(return_value=mock_signing_key)

        with patch("candid.controllers.helpers.social_auth._get_apple_jwks_client", return_value=mock_jwks), \
             patch("candid.controllers.helpers.social_auth.jwt_decode", return_value={
                 "sub": "apple-sub-789",
             }), \
             patch("candid.controllers.helpers.social_auth.config") as mock_config:
            mock_config.APPLE_SERVICE_ID = "com.candid.app"

            from candid.controllers.helpers.social_auth import validate_apple_token
            result = validate_apple_token("jwt-no-email")

            assert result["sub"] == "apple-sub-789"
            assert result["email"] is None
