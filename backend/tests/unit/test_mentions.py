"""Unit tests for mentions.py — @username and @role mention parsing."""

import pytest
from unittest.mock import MagicMock, patch, call

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# extract_mentions
# ---------------------------------------------------------------------------

class TestExtractMentions:
    def test_basic_mentions(self):
        from candid.controllers.helpers.mentions import extract_mentions
        result = extract_mentions("Hey @alice and @bob, what do you think?")
        assert result == ["alice", "bob"]

    def test_max_three_mentions(self):
        from candid.controllers.helpers.mentions import extract_mentions
        result = extract_mentions("@a @b @c @d @e")
        assert result == ["a", "b", "c"]

    def test_excludes_role_keywords(self):
        from candid.controllers.helpers.mentions import extract_mentions
        result = extract_mentions("@admin @moderator @alice @expert @bob")
        assert result == ["alice", "bob"]

    def test_deduplicates(self):
        from candid.controllers.helpers.mentions import extract_mentions
        result = extract_mentions("@alice said something, and @alice agreed")
        assert result == ["alice"]

    def test_case_insensitive(self):
        from candid.controllers.helpers.mentions import extract_mentions
        result = extract_mentions("@Alice and @ALICE")
        assert result == ["alice"]

    def test_empty_text(self):
        from candid.controllers.helpers.mentions import extract_mentions
        assert extract_mentions("") == []
        assert extract_mentions(None) == []

    def test_no_mentions(self):
        from candid.controllers.helpers.mentions import extract_mentions
        assert extract_mentions("No mentions here") == []

    def test_email_not_matched(self):
        from candid.controllers.helpers.mentions import extract_mentions
        # email addresses have a word char before @, so (?<!\w) prevents match
        result = extract_mentions("Email user@example.com is not a mention")
        assert result == []

    def test_mention_at_start(self):
        from candid.controllers.helpers.mentions import extract_mentions
        result = extract_mentions("@alice is great")
        assert result == ["alice"]

    def test_mention_after_newline(self):
        from candid.controllers.helpers.mentions import extract_mentions
        result = extract_mentions("Hello\n@bob here")
        assert result == ["bob"]

    def test_mention_with_underscore(self):
        from candid.controllers.helpers.mentions import extract_mentions
        result = extract_mentions("@cool_user_123 hello")
        assert result == ["cool_user_123"]

    def test_mention_max_length_30(self):
        from candid.controllers.helpers.mentions import extract_mentions
        long_name = "a" * 30
        result = extract_mentions(f"@{long_name} hi")
        assert result == [long_name]

    def test_mention_over_30_chars_not_matched(self):
        from candid.controllers.helpers.mentions import extract_mentions
        too_long = "a" * 31
        result = extract_mentions(f"@{too_long} hi")
        # 31-char token: regex captures 30 chars but (?!\w) fails because char 31 is \w
        assert result == []


# ---------------------------------------------------------------------------
# extract_role_mention
# ---------------------------------------------------------------------------

class TestExtractRoleMention:
    def test_finds_first_role(self):
        from candid.controllers.helpers.mentions import extract_role_mention
        assert extract_role_mention("@admin please look at this") == "admin"

    def test_first_role_wins(self):
        from candid.controllers.helpers.mentions import extract_role_mention
        assert extract_role_mention("@expert @moderator") == "expert"

    def test_no_role(self):
        from candid.controllers.helpers.mentions import extract_role_mention
        assert extract_role_mention("@alice @bob") is None

    def test_empty_text(self):
        from candid.controllers.helpers.mentions import extract_role_mention
        assert extract_role_mention("") is None
        assert extract_role_mention(None) is None

    def test_all_roles(self):
        from candid.controllers.helpers.mentions import extract_role_mention
        for role in ['admin', 'moderator', 'facilitator', 'liaison', 'expert']:
            assert extract_role_mention(f"@{role}") == role

    def test_case_insensitive(self):
        from candid.controllers.helpers.mentions import extract_role_mention
        assert extract_role_mention("@Admin") == "admin"


# ---------------------------------------------------------------------------
# resolve_mentioned_users
# ---------------------------------------------------------------------------

class TestResolveMentionedUsers:
    def test_resolves_active_users(self):
        from candid.controllers.helpers.mentions import resolve_mentioned_users
        mock_db = MagicMock()
        mock_db.execute_query.return_value = [
            {"id": "uuid-1", "username": "alice"},
            {"id": "uuid-2", "username": "bob"},
        ]
        result = resolve_mentioned_users(["alice", "bob"], mock_db)
        assert result == {"alice": "uuid-1", "bob": "uuid-2"}

    def test_empty_list(self):
        from candid.controllers.helpers.mentions import resolve_mentioned_users
        mock_db = MagicMock()
        assert resolve_mentioned_users([], mock_db) == {}
        mock_db.execute_query.assert_not_called()

    def test_no_results(self):
        from candid.controllers.helpers.mentions import resolve_mentioned_users
        mock_db = MagicMock()
        mock_db.execute_query.return_value = None
        assert resolve_mentioned_users(["unknown"], mock_db) == {}


# ---------------------------------------------------------------------------
# resolve_role_users
# ---------------------------------------------------------------------------

class TestResolveRoleUsers:
    def test_admin_location_only(self):
        from candid.controllers.helpers.mentions import resolve_role_users
        mock_db = MagicMock()
        mock_db.execute_query.return_value = [
            {"user_id": "u1"},
            {"user_id": "u2"},
        ]
        result = resolve_role_users("admin", "loc1", "cat1", mock_db)
        assert result == ["u1", "u2"]
        # Admin is location-only, shouldn't use category_id
        call_args = mock_db.execute_query.call_args
        assert "admin" in call_args[0][1]
        assert "loc1" in call_args[0][1]

    def test_expert_exact_match_first(self):
        from candid.controllers.helpers.mentions import resolve_role_users
        mock_db = MagicMock()
        # First call: exact match returns results
        mock_db.execute_query.return_value = [{"user_id": "u1"}]
        result = resolve_role_users("expert", "loc1", "cat1", mock_db)
        assert result == ["u1"]
        # Should only make one query (exact match found)
        assert mock_db.execute_query.call_count == 1

    def test_expert_fallback_to_location_wide(self):
        from candid.controllers.helpers.mentions import resolve_role_users
        mock_db = MagicMock()
        # First call: exact match returns empty
        # Second call: location-wide returns results
        mock_db.execute_query.side_effect = [
            [],  # exact match
            [{"user_id": "u2"}],  # location-wide fallback
        ]
        result = resolve_role_users("expert", "loc1", "cat1", mock_db)
        assert result == ["u2"]
        assert mock_db.execute_query.call_count == 2

    def test_no_location(self):
        from candid.controllers.helpers.mentions import resolve_role_users
        mock_db = MagicMock()
        assert resolve_role_users("admin", None, None, mock_db) == []

    def test_empty_results(self):
        from candid.controllers.helpers.mentions import resolve_role_users
        mock_db = MagicMock()
        mock_db.execute_query.return_value = None
        assert resolve_role_users("admin", "loc1", None, mock_db) == []


# ---------------------------------------------------------------------------
# process_mentions
# ---------------------------------------------------------------------------

class TestProcessMentions:
    @patch("candid.controllers.helpers.mentions.send_or_queue_notification")
    @patch("candid.controllers.helpers.mentions._is_notification_type_enabled", return_value=True)
    def test_sends_user_mention_notifications(self, mock_enabled, mock_send):
        from candid.controllers.helpers.mentions import process_mentions
        mock_db = MagicMock()
        # resolve_mentioned_users query
        mock_db.execute_query.return_value = [
            {"id": "u-alice", "username": "alice"},
        ]
        process_mentions(
            "Hey @alice", "u-author", "Author Name",
            "post-1", "loc-1", "cat-1", mock_db)
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args[1]
        assert call_kwargs["notification_type"] == "mention"
        assert call_kwargs["recipient_user_id"] == "u-alice"

    @patch("candid.controllers.helpers.mentions.send_or_queue_notification")
    @patch("candid.controllers.helpers.mentions._is_notification_type_enabled", return_value=True)
    def test_skips_self_mention(self, mock_enabled, mock_send):
        from candid.controllers.helpers.mentions import process_mentions
        mock_db = MagicMock()
        mock_db.execute_query.return_value = [
            {"id": "u-author", "username": "author"},
        ]
        process_mentions(
            "I mention @author (myself)", "u-author", "Author",
            "post-1", "loc-1", None, mock_db)
        mock_send.assert_not_called()

    @patch("candid.controllers.helpers.mentions.send_or_queue_notification")
    @patch("candid.controllers.helpers.mentions._is_notification_type_enabled", return_value=False)
    def test_respects_notification_preference(self, mock_enabled, mock_send):
        from candid.controllers.helpers.mentions import process_mentions
        mock_db = MagicMock()
        mock_db.execute_query.return_value = [
            {"id": "u-alice", "username": "alice"},
        ]
        process_mentions(
            "@alice check this", "u-author", "Author",
            "post-1", "loc-1", None, mock_db)
        mock_send.assert_not_called()

    @patch("candid.controllers.helpers.mentions.send_or_queue_notification")
    @patch("candid.controllers.helpers.mentions._is_notification_type_enabled", return_value=True)
    @patch("candid.controllers.helpers.mentions.resolve_role_users", return_value=["u-mod1"])
    def test_sends_role_mention_notifications(self, mock_resolve_role, mock_enabled, mock_send):
        from candid.controllers.helpers.mentions import process_mentions
        mock_db = MagicMock()
        # User mention resolution returns empty
        mock_db.execute_query.return_value = None
        process_mentions(
            "@moderator please help", "u-author", "Author",
            "post-1", "loc-1", "cat-1", mock_db)
        mock_send.assert_called_once()
        call_kwargs = mock_send.call_args[1]
        assert call_kwargs["recipient_user_id"] == "u-mod1"

    def test_empty_body(self):
        from candid.controllers.helpers.mentions import process_mentions
        mock_db = MagicMock()
        process_mentions("", "u-author", "Author", "p-1", "l-1", None, mock_db)
        mock_db.execute_query.assert_not_called()
