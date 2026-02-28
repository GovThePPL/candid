"""Unit tests for email_validation.py — disposable domain blocking + email normalization."""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# normalize_email
# ---------------------------------------------------------------------------

class TestNormalizeEmail:
    def test_lowercase(self):
        from candid.controllers.helpers.email_validation import normalize_email
        assert normalize_email("User@Example.COM") == "user@example.com"

    def test_strip_plus_suffix(self):
        from candid.controllers.helpers.email_validation import normalize_email
        assert normalize_email("user+tag@example.com") == "user@example.com"

    def test_strip_plus_all_providers(self):
        from candid.controllers.helpers.email_validation import normalize_email
        assert normalize_email("alice+spam@yahoo.com") == "alice@yahoo.com"

    def test_gmail_dots_stripped(self):
        from candid.controllers.helpers.email_validation import normalize_email
        assert normalize_email("u.s.e.r@gmail.com") == "user@gmail.com"

    def test_gmail_dots_and_plus(self):
        from candid.controllers.helpers.email_validation import normalize_email
        assert normalize_email("u.ser+test@gmail.com") == "user@gmail.com"

    def test_googlemail_alias(self):
        from candid.controllers.helpers.email_validation import normalize_email
        assert normalize_email("user@googlemail.com") == "user@gmail.com"

    def test_googlemail_dots_stripped(self):
        from candid.controllers.helpers.email_validation import normalize_email
        assert normalize_email("u.ser@googlemail.com") == "user@gmail.com"

    def test_non_gmail_dots_preserved(self):
        from candid.controllers.helpers.email_validation import normalize_email
        assert normalize_email("first.last@outlook.com") == "first.last@outlook.com"

    def test_whitespace_stripped(self):
        from candid.controllers.helpers.email_validation import normalize_email
        assert normalize_email("  user@test.com  ") == "user@test.com"

    def test_no_at_sign(self):
        from candid.controllers.helpers.email_validation import normalize_email
        assert normalize_email("noemail") == "noemail"


# ---------------------------------------------------------------------------
# is_disposable_domain
# ---------------------------------------------------------------------------

class TestIsDisposableDomain:
    def test_known_disposable(self):
        from candid.controllers.helpers.email_validation import is_disposable_domain
        # mailinator.com is in every blocklist
        assert is_disposable_domain("mailinator.com") is True

    def test_legitimate_domain(self):
        from candid.controllers.helpers.email_validation import is_disposable_domain
        assert is_disposable_domain("gmail.com") is False

    def test_case_insensitive(self):
        from candid.controllers.helpers.email_validation import is_disposable_domain
        assert is_disposable_domain("MAILINATOR.COM") is True

    def test_empty_string(self):
        from candid.controllers.helpers.email_validation import is_disposable_domain
        assert is_disposable_domain("") is False


# ---------------------------------------------------------------------------
# validate_email_for_registration
# ---------------------------------------------------------------------------

class TestValidateEmailForRegistration:
    @patch("candid.controllers.helpers.email_validation.db")
    def test_valid_email(self, mock_db):
        from candid.controllers.helpers.email_validation import validate_email_for_registration
        mock_db.execute_query.return_value = None
        ok, err = validate_email_for_registration("user@example.com")
        assert ok is True
        assert err is None

    def test_invalid_format(self):
        from candid.controllers.helpers.email_validation import validate_email_for_registration
        ok, err = validate_email_for_registration("not-an-email")
        assert ok is False
        assert "valid email" in err

    def test_disposable_rejected(self):
        from candid.controllers.helpers.email_validation import validate_email_for_registration
        ok, err = validate_email_for_registration("user@mailinator.com")
        assert ok is False
        assert "Disposable" in err

    @patch("candid.controllers.helpers.email_validation.db")
    def test_normalized_duplicate(self, mock_db):
        from candid.controllers.helpers.email_validation import validate_email_for_registration
        mock_db.execute_query.return_value = {"?column?": 1}
        ok, err = validate_email_for_registration("user@example.com")
        assert ok is False
        assert "already exists" in err

    @patch("candid.controllers.helpers.email_validation.db")
    def test_gmail_normalized_duplicate(self, mock_db):
        from candid.controllers.helpers.email_validation import validate_email_for_registration
        mock_db.execute_query.return_value = {"?column?": 1}
        ok, err = validate_email_for_registration("u.ser+test@gmail.com")
        assert ok is False
        # Should have queried with normalized email
        mock_db.execute_query.assert_called_once()
        call_args = mock_db.execute_query.call_args
        assert call_args[0][1] == ("user@gmail.com",)
