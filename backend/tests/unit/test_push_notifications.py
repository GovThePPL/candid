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


# ---------------------------------------------------------------------------
# _is_in_quiet_hours
# ---------------------------------------------------------------------------

PUSH_TOKEN = "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]"
USER_ID = "00000000-0000-0000-0000-000000000001"


class TestIsInQuietHours:
    def _call(self, user_row):
        from candid.controllers.helpers.push_notifications import _is_in_quiet_hours
        return _is_in_quiet_hours(user_row)

    def test_returns_false_when_no_quiet_hours_set(self):
        assert self._call({}) is False
        assert self._call({"quiet_hours_start": None, "quiet_hours_end": None}) is False

    def test_returns_false_when_only_start_set(self):
        assert self._call({"quiet_hours_start": 22, "quiet_hours_end": None}) is False

    def test_same_day_range_inside(self):
        mock_dt = MagicMock()
        mock_now = MagicMock()
        mock_now.hour = 12
        mock_dt.now.return_value = mock_now

        with patch("candid.controllers.helpers.push_notifications.datetime", mock_dt):
            result = self._call({
                "quiet_hours_start": 9,
                "quiet_hours_end": 17,
                "timezone": "America/New_York",
            })
        assert result is True

    def test_same_day_range_outside(self):
        mock_dt = MagicMock()
        mock_now = MagicMock()
        mock_now.hour = 20
        mock_dt.now.return_value = mock_now

        with patch("candid.controllers.helpers.push_notifications.datetime", mock_dt):
            result = self._call({
                "quiet_hours_start": 9,
                "quiet_hours_end": 17,
                "timezone": "America/New_York",
            })
        assert result is False

    def test_overnight_range_inside_late(self):
        mock_dt = MagicMock()
        mock_now = MagicMock()
        mock_now.hour = 23
        mock_dt.now.return_value = mock_now

        with patch("candid.controllers.helpers.push_notifications.datetime", mock_dt):
            result = self._call({
                "quiet_hours_start": 22,
                "quiet_hours_end": 7,
                "timezone": "UTC",
            })
        assert result is True

    def test_overnight_range_inside_early(self):
        mock_dt = MagicMock()
        mock_now = MagicMock()
        mock_now.hour = 3
        mock_dt.now.return_value = mock_now

        with patch("candid.controllers.helpers.push_notifications.datetime", mock_dt):
            result = self._call({
                "quiet_hours_start": 22,
                "quiet_hours_end": 7,
                "timezone": "UTC",
            })
        assert result is True

    def test_overnight_range_outside(self):
        mock_dt = MagicMock()
        mock_now = MagicMock()
        mock_now.hour = 12
        mock_dt.now.return_value = mock_now

        with patch("candid.controllers.helpers.push_notifications.datetime", mock_dt):
            result = self._call({
                "quiet_hours_start": 22,
                "quiet_hours_end": 7,
                "timezone": "UTC",
            })
        assert result is False


# ---------------------------------------------------------------------------
# _is_under_frequency_cap
# ---------------------------------------------------------------------------

class TestIsUnderFrequencyCap:
    def _call(self, user_row):
        from candid.controllers.helpers.push_notifications import _is_under_frequency_cap
        return _is_under_frequency_cap(user_row)

    def test_frequency_off_always_returns_false(self):
        assert self._call({"notification_frequency": 0}) is False

    def test_default_frequency_under_cap(self):
        from datetime import date
        today = date.today()
        assert self._call({
            "notification_frequency": 3,
            "notifications_sent_today": 5,
            "notifications_sent_date": today,
        }) is True

    def test_default_frequency_at_cap(self):
        from datetime import date
        today = date.today()
        assert self._call({
            "notification_frequency": 3,
            "notifications_sent_today": 10,
            "notifications_sent_date": today,
        }) is False

    def test_different_date_resets_counter(self):
        from datetime import date
        yesterday = date(2020, 1, 1)
        assert self._call({
            "notification_frequency": 3,
            "notifications_sent_today": 999,
            "notifications_sent_date": yesterday,
        }) is True

    def test_no_sent_date_returns_true(self):
        assert self._call({"notification_frequency": 3}) is True


# ---------------------------------------------------------------------------
# send_or_queue_notification
# ---------------------------------------------------------------------------

class TestSendOrQueueNotification:
    def _call(self, *args, **kwargs):
        from candid.controllers.helpers.push_notifications import send_or_queue_notification
        return send_or_queue_notification(*args, **kwargs)

    def _make_user_row(self, **overrides):
        row = {
            "push_token": PUSH_TOKEN,
            "notifications_enabled": True,
            "quiet_hours_start": None,
            "quiet_hours_end": None,
            "timezone": "UTC",
            "notification_frequency": 3,
            "notifications_sent_today": 0,
            "notifications_sent_date": None,
        }
        row.update(overrides)
        return row

    def test_does_nothing_for_unknown_user(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = None
        self._call("title", "body", {}, USER_ID, mock_db)
        assert mock_db.execute_query.call_count == 1

    def test_drops_when_notifications_disabled(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = self._make_user_row(notifications_enabled=False)
        self._call("title", "body", {}, USER_ID, mock_db)
        assert mock_db.execute_query.call_count == 1

    def test_drops_when_over_frequency_cap(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = self._make_user_row(notification_frequency=0)
        self._call("title", "body", {}, USER_ID, mock_db)
        assert mock_db.execute_query.call_count == 1

    def test_queues_when_in_quiet_hours(self):
        mock_db = MagicMock()
        user_row = self._make_user_row(quiet_hours_start=0, quiet_hours_end=23)
        mock_db.execute_query.return_value = user_row

        mock_dt = MagicMock()
        mock_now = MagicMock()
        mock_now.hour = 12
        mock_dt.now.return_value = mock_now

        with patch("candid.controllers.helpers.push_notifications.datetime", mock_dt):
            self._call("title", "body", {"action": "test"}, USER_ID, mock_db)

        # SELECT + INSERT into queue
        assert mock_db.execute_query.call_count == 2
        insert_call = mock_db.execute_query.call_args_list[1]
        assert "notification_queue" in insert_call[0][0]

    def test_sends_immediately_when_not_in_quiet_hours(self):
        mock_db = MagicMock()
        user_row = self._make_user_row()
        mock_db.execute_query.return_value = user_row

        with patch("candid.controllers.helpers.push_notifications.urllib.request.urlopen") as mock_open:
            mock_response = MagicMock()
            mock_response.read.return_value = b'{"data": {"status": "ok"}}'
            mock_response.__enter__ = MagicMock(return_value=mock_response)
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_open.return_value = mock_response

            self._call("title", "body", {}, USER_ID, mock_db)

        mock_open.assert_called_once()

    def test_drops_when_no_push_token(self):
        mock_db = MagicMock()
        user_row = self._make_user_row(push_token=None)
        mock_db.execute_query.return_value = user_row

        with patch("candid.controllers.helpers.push_notifications.urllib.request.urlopen") as mock_open:
            self._call("title", "body", {}, USER_ID, mock_db)
        mock_open.assert_not_called()


# ---------------------------------------------------------------------------
# drain_notification_queue
# ---------------------------------------------------------------------------

class TestDrainNotificationQueue:
    def _call(self, *args, **kwargs):
        from candid.controllers.helpers.push_notifications import drain_notification_queue
        return drain_notification_queue(*args, **kwargs)

    def _make_user_row(self, **overrides):
        row = {
            "push_token": PUSH_TOKEN,
            "notifications_enabled": True,
            "quiet_hours_start": None,
            "quiet_hours_end": None,
            "timezone": "UTC",
            "notification_frequency": 3,
            "notifications_sent_today": 0,
            "notifications_sent_date": None,
        }
        row.update(overrides)
        return row

    def test_does_nothing_for_unknown_user(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = None
        self._call(USER_ID, mock_db)
        assert mock_db.execute_query.call_count == 1

    def test_clears_queue_when_notifications_disabled(self):
        mock_db = MagicMock()
        mock_db.execute_query.side_effect = [
            self._make_user_row(notifications_enabled=False),
            None,
        ]
        self._call(USER_ID, mock_db)
        delete_call = mock_db.execute_query.call_args_list[1]
        assert "DELETE" in delete_call[0][0]
        assert "notification_queue" in delete_call[0][0]

    def test_does_nothing_when_still_in_quiet_hours(self):
        mock_db = MagicMock()
        user_row = self._make_user_row(quiet_hours_start=0, quiet_hours_end=23)
        mock_db.execute_query.return_value = user_row

        mock_dt = MagicMock()
        mock_now = MagicMock()
        mock_now.hour = 12
        mock_dt.now.return_value = mock_now

        with patch("candid.controllers.helpers.push_notifications.datetime", mock_dt):
            self._call(USER_ID, mock_db)

        assert mock_db.execute_query.call_count == 1

    def test_clears_queue_when_no_push_token(self):
        mock_db = MagicMock()
        mock_db.execute_query.side_effect = [
            self._make_user_row(push_token=None),
            None,
        ]
        self._call(USER_ID, mock_db)
        delete_call = mock_db.execute_query.call_args_list[1]
        assert "DELETE" in delete_call[0][0]

    def test_sends_queued_notifications(self):
        mock_db = MagicMock()
        user_row = self._make_user_row()
        queued = [
            {"id": "q1", "title": "T1", "body": "B1", "data": '{"action": "test"}'},
            {"id": "q2", "title": "T2", "body": "B2", "data": "{}"},
        ]
        mock_db.execute_query.side_effect = [
            user_row,       # SELECT user
            queued,         # SELECT queue
            None,           # UPDATE counter
            None,           # DELETE q1
            user_row,       # Refresh user
            None,           # UPDATE counter
            None,           # DELETE q2
            user_row,       # Refresh user
        ]

        with patch("candid.controllers.helpers.push_notifications.urllib.request.urlopen") as mock_open:
            mock_response = MagicMock()
            mock_response.read.return_value = b'{"data": {"status": "ok"}}'
            mock_response.__enter__ = MagicMock(return_value=mock_response)
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_open.return_value = mock_response

            self._call(USER_ID, mock_db)

        assert mock_open.call_count == 2

    def test_does_nothing_when_queue_empty(self):
        mock_db = MagicMock()
        mock_db.execute_query.side_effect = [
            self._make_user_row(),
            [],
        ]

        with patch("candid.controllers.helpers.push_notifications.urllib.request.urlopen") as mock_open:
            self._call(USER_ID, mock_db)

        mock_open.assert_not_called()


# ---------------------------------------------------------------------------
# _is_notification_type_enabled
# ---------------------------------------------------------------------------

class TestIsNotificationTypeEnabled:
    def _call(self, *args, **kwargs):
        from candid.controllers.helpers.push_notifications import _is_notification_type_enabled
        return _is_notification_type_enabled(*args, **kwargs)

    def test_enabled_when_no_preference_row(self):
        """Absent row defaults to enabled."""
        mock_db = MagicMock()
        mock_db.execute_query.return_value = None
        assert self._call(USER_ID, 'comment_reply', mock_db) is True

    def test_enabled_when_preference_true(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"enabled": True}
        assert self._call(USER_ID, 'comment_reply', mock_db) is True

    def test_disabled_when_preference_false(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"enabled": False}
        assert self._call(USER_ID, 'comment_reply', mock_db) is False


# ---------------------------------------------------------------------------
# send_comment_reply_notification
# ---------------------------------------------------------------------------

class TestSendCommentReplyNotification:
    def _call(self, *args, **kwargs):
        from candid.controllers.helpers.push_notifications import send_comment_reply_notification
        return send_comment_reply_notification(*args, **kwargs)

    def test_sends_when_type_enabled(self):
        mock_db = MagicMock()
        # _is_notification_type_enabled query returns None (absent = enabled)
        # send_or_queue_notification queries
        user_row = {
            "push_token": PUSH_TOKEN,
            "notifications_enabled": True,
            "quiet_hours_start": None,
            "quiet_hours_end": None,
            "timezone": "UTC",
            "notification_frequency": 3,
            "notifications_sent_today": 0,
            "notifications_sent_date": None,
        }
        mock_db.execute_query.side_effect = [
            None,       # type pref query (absent = enabled)
            user_row,   # send_or_queue user lookup
        ]

        with patch("candid.controllers.helpers.push_notifications.urllib.request.urlopen") as mock_open:
            mock_response = MagicMock()
            mock_response.read.return_value = b'{"data": {"status": "ok"}}'
            mock_response.__enter__ = MagicMock(return_value=mock_response)
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_open.return_value = mock_response

            self._call(USER_ID, "Alice", "Great comment!", "post-123", mock_db)

        mock_open.assert_called_once()
        req = mock_open.call_args[0][0]
        payload = json.loads(req.data.decode("utf-8"))
        assert "Alice" in payload["title"]
        assert payload["data"]["action"] == "open_post"
        assert payload["data"]["postId"] == "post-123"

    def test_skipped_when_type_disabled(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"enabled": False}

        with patch("candid.controllers.helpers.push_notifications.send_or_queue_notification") as mock_send:
            self._call(USER_ID, "Alice", "Great comment!", "post-123", mock_db)

        mock_send.assert_not_called()

    def test_truncates_long_snippet(self):
        mock_db = MagicMock()
        user_row = {
            "push_token": PUSH_TOKEN,
            "notifications_enabled": True,
            "quiet_hours_start": None,
            "quiet_hours_end": None,
            "timezone": "UTC",
            "notification_frequency": 3,
            "notifications_sent_today": 0,
            "notifications_sent_date": None,
        }
        mock_db.execute_query.side_effect = [
            None,       # type pref (absent = enabled)
            user_row,   # send_or_queue user lookup
        ]

        long_text = "A" * 200

        with patch("candid.controllers.helpers.push_notifications.urllib.request.urlopen") as mock_open:
            mock_response = MagicMock()
            mock_response.read.return_value = b'{"data": {"status": "ok"}}'
            mock_response.__enter__ = MagicMock(return_value=mock_response)
            mock_response.__exit__ = MagicMock(return_value=False)
            mock_open.return_value = mock_response

            self._call(USER_ID, "Alice", long_text, "post-123", mock_db)

        req = mock_open.call_args[0][0]
        payload = json.loads(req.data.decode("utf-8"))
        # The snippet is truncated at 80 chars + "..." in send_comment_reply_notification,
        # then further truncated at 120 in send_push_notification
        assert len(payload["body"]) <= 123  # 120 + "..."
