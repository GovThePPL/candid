"""Unit tests for sms.py — phone normalization, verification codes, token flow."""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# normalize_phone
# ---------------------------------------------------------------------------

class TestNormalizePhone:
    def test_ten_digit_us(self):
        from candid.controllers.helpers.sms import normalize_phone
        assert normalize_phone("5551234567") == "+15551234567"

    def test_eleven_digit_us(self):
        from candid.controllers.helpers.sms import normalize_phone
        assert normalize_phone("15551234567") == "+15551234567"

    def test_with_dashes(self):
        from candid.controllers.helpers.sms import normalize_phone
        assert normalize_phone("555-123-4567") == "+15551234567"

    def test_with_parens(self):
        from candid.controllers.helpers.sms import normalize_phone
        assert normalize_phone("(555) 123-4567") == "+15551234567"

    def test_with_plus_one(self):
        from candid.controllers.helpers.sms import normalize_phone
        assert normalize_phone("+1 555 123 4567") == "+15551234567"

    def test_international(self):
        from candid.controllers.helpers.sms import normalize_phone
        assert normalize_phone("+447911123456") == "+447911123456"

    def test_too_short(self):
        from candid.controllers.helpers.sms import normalize_phone
        assert normalize_phone("12345") is None

    def test_empty(self):
        from candid.controllers.helpers.sms import normalize_phone
        assert normalize_phone("") is None


# ---------------------------------------------------------------------------
# send_verification_code
# ---------------------------------------------------------------------------

class TestSendVerificationCode:
    @patch("candid.controllers.helpers.sms.get_redis")
    @patch("candid.controllers.helpers.sms.config")
    def test_dev_mode_logs_code(self, mock_config, mock_get_redis):
        from candid.controllers.helpers.sms import send_verification_code
        mock_config.SMS_VERIFICATION_ENABLED = False
        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis

        ok, result = send_verification_code("5551234567")
        assert ok is True
        assert result == "+15551234567"
        mock_redis.setex.assert_called_once()

    @patch("candid.controllers.helpers.sms.get_redis")
    @patch("candid.controllers.helpers.sms.config")
    def test_invalid_phone(self, mock_config, mock_get_redis):
        from candid.controllers.helpers.sms import send_verification_code
        ok, result = send_verification_code("123")
        assert ok is False
        assert "Invalid" in result

    @patch("candid.controllers.helpers.sms.get_redis")
    @patch("candid.controllers.helpers.sms.config")
    def test_twilio_send(self, mock_config, mock_get_redis):
        from candid.controllers.helpers.sms import send_verification_code
        mock_config.SMS_VERIFICATION_ENABLED = True
        mock_config.TWILIO_ACCOUNT_SID = "test_sid"
        mock_config.TWILIO_AUTH_TOKEN = "test_token"
        mock_config.TWILIO_PHONE_NUMBER = "+10000000000"
        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis

        # Mock the twilio module since it may not be installed locally
        mock_client_instance = MagicMock()
        mock_client_cls = MagicMock(return_value=mock_client_instance)
        mock_twilio_rest = MagicMock(Client=mock_client_cls)
        mock_twilio = MagicMock(rest=mock_twilio_rest)
        import sys
        with patch.dict(sys.modules, {"twilio": mock_twilio, "twilio.rest": mock_twilio_rest}):
            ok, result = send_verification_code("5551234567")
            assert ok is True
            mock_client_instance.messages.create.assert_called_once()


# ---------------------------------------------------------------------------
# verify_code
# ---------------------------------------------------------------------------

class TestVerifyCode:
    @patch("candid.controllers.helpers.sms.get_redis")
    def test_correct_code(self, mock_get_redis):
        from candid.controllers.helpers.sms import verify_code
        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis
        mock_redis.get.side_effect = [b"0", b"123456"]  # attempts, code

        ok, token = verify_code("5551234567", "123456")
        assert ok is True
        assert len(token) > 10  # verify_token is a urlsafe token
        # Should have stored the verification token
        mock_redis.setex.assert_called_once()

    @patch("candid.controllers.helpers.sms.get_redis")
    def test_wrong_code(self, mock_get_redis):
        from candid.controllers.helpers.sms import verify_code
        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis
        mock_redis.get.side_effect = [b"0", b"123456"]  # attempts, code

        ok, err = verify_code("5551234567", "000000")
        assert ok is False
        assert "Incorrect" in err

    @patch("candid.controllers.helpers.sms.get_redis")
    def test_expired_code(self, mock_get_redis):
        from candid.controllers.helpers.sms import verify_code
        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis
        mock_redis.get.side_effect = [b"0", None]  # attempts, no code

        ok, err = verify_code("5551234567", "123456")
        assert ok is False
        assert "expired" in err

    @patch("candid.controllers.helpers.sms.get_redis")
    def test_max_attempts(self, mock_get_redis):
        from candid.controllers.helpers.sms import verify_code
        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis
        mock_redis.get.side_effect = [b"5"]  # at max attempts

        ok, err = verify_code("5551234567", "123456")
        assert ok is False
        assert "Too many" in err

    def test_invalid_phone(self):
        from candid.controllers.helpers.sms import verify_code
        ok, err = verify_code("123", "123456")
        assert ok is False
        assert "Invalid" in err


# ---------------------------------------------------------------------------
# check_phone_verified
# ---------------------------------------------------------------------------

class TestCheckPhoneVerified:
    @patch("candid.controllers.helpers.sms.get_redis")
    def test_valid_token(self, mock_get_redis):
        from candid.controllers.helpers.sms import check_phone_verified
        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis
        mock_redis.get.return_value = b"valid-token-123"

        ok, normalized = check_phone_verified("5551234567", "valid-token-123")
        assert ok is True
        assert normalized == "+15551234567"
        # Token should be consumed (deleted)
        mock_redis.delete.assert_called_once()

    @patch("candid.controllers.helpers.sms.get_redis")
    def test_expired_token(self, mock_get_redis):
        from candid.controllers.helpers.sms import check_phone_verified
        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis
        mock_redis.get.return_value = None

        ok, err = check_phone_verified("5551234567", "some-token")
        assert ok is False
        assert "expired" in err

    @patch("candid.controllers.helpers.sms.get_redis")
    def test_wrong_token(self, mock_get_redis):
        from candid.controllers.helpers.sms import check_phone_verified
        mock_redis = MagicMock()
        mock_get_redis.return_value = mock_redis
        mock_redis.get.return_value = b"correct-token"

        ok, err = check_phone_verified("5551234567", "wrong-token")
        assert ok is False
        assert "Invalid" in err

    def test_invalid_phone(self):
        from candid.controllers.helpers.sms import check_phone_verified
        ok, err = check_phone_verified("123", "token")
        assert ok is False
        assert "Invalid" in err


# ---------------------------------------------------------------------------
# is_phone_registered
# ---------------------------------------------------------------------------

class TestIsPhoneRegistered:
    @patch("candid.controllers.helpers.sms.db")
    def test_registered(self, mock_db):
        from candid.controllers.helpers.sms import is_phone_registered
        mock_db.execute_query.return_value = {"?column?": 1}
        assert is_phone_registered("5551234567") is True

    @patch("candid.controllers.helpers.sms.db")
    def test_not_registered(self, mock_db):
        from candid.controllers.helpers.sms import is_phone_registered
        mock_db.execute_query.return_value = None
        assert is_phone_registered("5551234567") is False

    def test_invalid_phone(self):
        from candid.controllers.helpers.sms import is_phone_registered
        assert is_phone_registered("123") is False
