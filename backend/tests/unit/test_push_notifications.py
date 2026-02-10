"""Unit tests for push_notifications.py — Expo Push API client."""

import json
import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Statement truncation
# ---------------------------------------------------------------------------

class TestStatementTruncation:
    def test_short_statement_unchanged(self):
        from candid.controllers.helpers.push_notifications import send_chat_request_notification
        short = "This is short"

        with patch("candid.controllers.helpers.push_notifications.urllib.request.urlopen") as mock_open:
            mock_response = MagicMock()
            mock_response.__enter__ = MagicMock(return_value=mock_response)
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_response.read.return_value = b'{"data": {"status": "ok"}}'
            mock_open.return_value = mock_response

            send_chat_request_notification("ExponentPushToken[xxx]", "Alice", short)

            # Verify the body in the request
            req = mock_open.call_args[0][0]
            payload = json.loads(req.data.decode("utf-8"))
            assert payload["body"] == short

    def test_long_statement_truncated(self):
        from candid.controllers.helpers.push_notifications import send_chat_request_notification
        long_text = "A" * 100

        with patch("candid.controllers.helpers.push_notifications.urllib.request.urlopen") as mock_open:
            mock_response = MagicMock()
            mock_response.__enter__ = MagicMock(return_value=mock_response)
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_response.read.return_value = b'{"data": {"status": "ok"}}'
            mock_open.return_value = mock_response

            send_chat_request_notification("ExponentPushToken[xxx]", "Alice", long_text)

            req = mock_open.call_args[0][0]
            payload = json.loads(req.data.decode("utf-8"))
            assert len(payload["body"]) == 83  # 80 chars + "..."
            assert payload["body"].endswith("...")


# ---------------------------------------------------------------------------
# Expo Push API request formatting
# ---------------------------------------------------------------------------

class TestRequestFormatting:
    def test_payload_structure(self):
        from candid.controllers.helpers.push_notifications import send_chat_request_notification

        with patch("candid.controllers.helpers.push_notifications.urllib.request.urlopen") as mock_open:
            mock_response = MagicMock()
            mock_response.__enter__ = MagicMock(return_value=mock_response)
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_response.read.return_value = b'{"data": {"status": "ok"}}'
            mock_open.return_value = mock_response

            result = send_chat_request_notification(
                "ExponentPushToken[xxx]", "Bob", "Healthcare should be free"
            )

            assert result is True
            req = mock_open.call_args[0][0]
            payload = json.loads(req.data.decode("utf-8"))
            assert payload["to"] == "ExponentPushToken[xxx]"
            assert payload["sound"] == "default"
            assert "Bob" in payload["title"]
            assert payload["data"]["action"] == "open_cards"

    def test_no_push_token_returns_false(self):
        from candid.controllers.helpers.push_notifications import send_chat_request_notification
        result = send_chat_request_notification(None, "Bob", "test")
        assert result is False

    def test_empty_push_token_returns_false(self):
        from candid.controllers.helpers.push_notifications import send_chat_request_notification
        result = send_chat_request_notification("", "Bob", "test")
        assert result is False


# ---------------------------------------------------------------------------
# Daily counter increment
# ---------------------------------------------------------------------------

class TestDailyCounter:
    def test_increments_counter(self):
        from candid.controllers.helpers.push_notifications import send_chat_request_notification

        mock_db = MagicMock()
        mock_db.execute_query = MagicMock()

        with patch("candid.controllers.helpers.push_notifications.urllib.request.urlopen") as mock_open:
            mock_response = MagicMock()
            mock_response.__enter__ = MagicMock(return_value=mock_response)
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_response.read.return_value = b'{"data": {"status": "ok"}}'
            mock_open.return_value = mock_response

            send_chat_request_notification(
                "ExponentPushToken[xxx]", "Alice", "test",
                db=mock_db, recipient_user_id="user-1"
            )

            mock_db.execute_query.assert_called_once()
            sql = mock_db.execute_query.call_args[0][0]
            assert "notifications_sent_today" in sql

    def test_no_db_skips_counter(self):
        from candid.controllers.helpers.push_notifications import send_chat_request_notification

        with patch("candid.controllers.helpers.push_notifications.urllib.request.urlopen") as mock_open:
            mock_response = MagicMock()
            mock_response.__enter__ = MagicMock(return_value=mock_response)
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_response.read.return_value = b'{"data": {"status": "ok"}}'
            mock_open.return_value = mock_response

            # No db passed — should succeed without DB call
            result = send_chat_request_notification("ExponentPushToken[xxx]", "A", "test")
            assert result is True


# ---------------------------------------------------------------------------
# Exception handling
# ---------------------------------------------------------------------------

class TestExceptionHandling:
    def test_network_error_returns_false(self):
        from candid.controllers.helpers.push_notifications import send_chat_request_notification

        with patch("candid.controllers.helpers.push_notifications.urllib.request.urlopen",
                    side_effect=Exception("Network error")):
            result = send_chat_request_notification("ExponentPushToken[xxx]", "A", "test")
            assert result is False
