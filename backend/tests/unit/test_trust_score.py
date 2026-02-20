"""Unit tests for trust score computation."""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# Helper: build a mock DB that returns prescribed values for execute_query
# ---------------------------------------------------------------------------

def _make_db(side_effects):
    """Create a mock Database whose execute_query returns from *side_effects*."""
    db = MagicMock()
    db.execute_query = MagicMock(side_effect=side_effects)
    return db


# ---------------------------------------------------------------------------
# _get_forum_signals
# ---------------------------------------------------------------------------

class TestGetForumSignals:

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_all_zeros_when_no_content(self, _mock_cls):
        from candid.controllers.helpers.trust_score import _get_forum_signals

        db = _make_db([
            {"cnt": 0},                   # bridging awards
            {"avg_mfi": 0, "wu": 0, "wd": 0, "cnt": 0},  # posts
            {"avg_mfi": 0, "wu": 0, "wd": 0, "cnt": 0},  # comments
        ])
        result = _get_forum_signals("user-1", db)
        assert result["total_eligible_content"] == 0
        assert result["bridging_awards"] == 0
        assert result["avg_bridging"] == 0.0

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_bridging_awards_counted(self, _mock_cls):
        from candid.controllers.helpers.trust_score import _get_forum_signals

        db = _make_db([
            {"cnt": 3},                   # 3 bridging awards
            {"avg_mfi": 0.65, "wu": 10.0, "wd": 2.0, "cnt": 5},  # posts
            {"avg_mfi": 0.55, "wu": 8.0, "wd": 3.0, "cnt": 3},   # comments
        ])
        result = _get_forum_signals("user-1", db)
        assert result["bridging_awards"] == 3
        assert result["total_eligible_content"] == 8
        assert result["total_weighted_up"] == 18.0
        assert result["total_weighted_down"] == 5.0
        # avg_bridging = (0.65*5 + 0.55*3) / 8 = (3.25 + 1.65) / 8 = 0.6125
        assert abs(result["avg_bridging"] - 0.6125) < 0.001


# ---------------------------------------------------------------------------
# _get_chat_signals
# ---------------------------------------------------------------------------

class TestGetChatSignals:

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_no_chats(self, _mock_cls):
        from candid.controllers.helpers.trust_score import _get_chat_signals

        db = _make_db([
            {"cnt": 0},  # kudos
            [],           # chat_logs (empty list)
        ])
        result = _get_chat_signals("user-1", db)
        assert result["total_completed_chats"] == 0
        assert result["total_messages_sent"] == 0

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_counts_signals_correctly(self, _mock_cls):
        from candid.controllers.helpers.trust_score import _get_chat_signals

        user_id = "user-A"
        chat_log = {
            "id": "chat-1",
            "end_type": "agreed_closure",
            "log": {
                "messages": [
                    {"senderId": user_id, "content": "hello", "type": "text"},
                    {"senderId": "user-B", "content": "hi", "type": "text"},
                    {"senderId": user_id, "content": "toxic msg", "type": "text",
                     "toxicityScore": 0.85},
                ],
                "agreedPositions": [
                    {"status": "accepted", "content": "we agree"},
                    {"status": "rejected", "content": "nope"},
                ],
                "explanations": [
                    {"status": "good_faith", "explainerId": user_id},
                    {"status": "pending", "explainerId": user_id},
                ],
                "definitions": [
                    {"status": "accepted"},
                    {"status": "both_defined"},
                    {"status": "pending"},
                ],
                "reactions": {
                    "msg-1": [
                        {"userId": user_id, "emoji": "appreciate"},
                        {"userId": "user-B", "emoji": "agree"},
                    ],
                    "msg-2": [
                        {"userId": user_id, "emoji": "angry"},  # not positive
                    ],
                },
                "abandonedByUserId": None,
            },
        }

        db = _make_db([
            {"cnt": 2},      # kudos received
            [chat_log],       # chat_logs
        ])

        result = _get_chat_signals(user_id, db)
        assert result["total_completed_chats"] == 1
        assert result["total_messages_sent"] == 2  # user-A sent 2 msgs
        assert result["agreed_closures"] == 1
        assert result["kudos_received"] == 2
        assert result["agreed_statements"] == 1  # 1 accepted
        assert result["good_faith_explanations"] == 1
        assert result["resolved_definitions"] == 2  # accepted + both_defined
        assert result["positive_reactions_sent"] == 1  # only 'appreciate'
        assert result["toxic_messages"] == 1
        assert result["abandonments"] == 0

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_abandonment_counted_via_jsonb_field(self, _mock_cls):
        from candid.controllers.helpers.trust_score import _get_chat_signals

        user_id = "user-A"
        chat_log = {
            "id": "chat-2",
            "end_type": "abandoned",
            "log": {
                "messages": [
                    {"senderId": user_id, "content": "bye", "type": "text"},
                ],
                "abandonedByUserId": user_id,
            },
        }
        db = _make_db([
            {"cnt": 0},
            [chat_log],
        ])

        result = _get_chat_signals(user_id, db)
        assert result["abandonments"] == 1
        assert result["agreed_closures"] == 0

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_abandonment_fallback_via_end_type(self, _mock_cls):
        """When abandonedByUserId is missing but end_type is 'abandoned',
        fall back to endedByUserId to attribute the abandonment."""
        from candid.controllers.helpers.trust_score import _get_chat_signals

        user_id = "user-A"
        chat_log = {
            "id": "chat-3",
            "end_type": "abandoned",
            "log": {
                "messages": [
                    {"senderId": user_id, "content": "bye", "type": "text"},
                ],
                "endedByUserId": user_id,
                # no abandonedByUserId field
            },
        }
        db = _make_db([
            {"cnt": 0},
            [chat_log],
        ])

        result = _get_chat_signals(user_id, db)
        assert result["abandonments"] == 1

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_user_exit_without_abandonment_not_counted(self, _mock_cls):
        """A normal user_exit (not an abandonment) should not be counted."""
        from candid.controllers.helpers.trust_score import _get_chat_signals

        user_id = "user-A"
        chat_log = {
            "id": "chat-4",
            "end_type": "user_exit",
            "log": {
                "messages": [
                    {"senderId": user_id, "content": "goodbye", "type": "text"},
                ],
                "endedByUserId": user_id,
            },
        }
        db = _make_db([
            {"cnt": 0},
            [chat_log],
        ])

        result = _get_chat_signals(user_id, db)
        assert result["abandonments"] == 0


# ---------------------------------------------------------------------------
# _compute_raw_score
# ---------------------------------------------------------------------------

class TestComputeRawScore:

    def _make_forum_db_calls(self, bridging=0, p_cnt=0, p_mfi=0, p_wu=0, p_wd=0,
                              c_cnt=0, c_mfi=0, c_wu=0, c_wd=0):
        """Build the 3 DB call returns for forum signals."""
        return [
            {"cnt": bridging},
            {"avg_mfi": p_mfi, "wu": p_wu, "wd": p_wd, "cnt": p_cnt},
            {"avg_mfi": c_mfi, "wu": c_wu, "wd": c_wd, "cnt": c_cnt},
        ]

    def _make_chat_db_calls(self, kudos=0, chat_logs=None):
        """Build the 2 DB call returns for chat signals."""
        return [
            {"cnt": kudos},
            chat_logs or [],
        ]

    def _make_mod_db_calls(self, rows=None):
        """Build the 1 DB call return for moderation signals."""
        return [rows or []]

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_no_activity_returns_none(self, _mock_cls):
        from candid.controllers.helpers.trust_score import _compute_raw_score

        db = _make_db(
            self._make_forum_db_calls()
            + self._make_chat_db_calls()
            + self._make_mod_db_calls()
        )
        assert _compute_raw_score("user-1", db) is None

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_only_bridging_awards(self, _mock_cls):
        from candid.controllers.helpers.trust_score import _compute_raw_score

        db = _make_db(
            self._make_forum_db_calls(bridging=2, p_cnt=4, p_mfi=0.5, p_wu=8, p_wd=2)
            + self._make_chat_db_calls()
            + self._make_mod_db_calls()
        )
        score = _compute_raw_score("user-1", db)
        assert score is not None
        assert score > 0

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_moderation_penalty_reduces_score(self, _mock_cls):
        from candid.controllers.helpers.trust_score import _compute_raw_score

        # User with some activity
        base_forum = self._make_forum_db_calls(bridging=1, p_cnt=5, p_mfi=0.4, p_wu=10, p_wd=5)
        base_chat = self._make_chat_db_calls()

        # Without moderation
        db_clean = _make_db(base_forum + base_chat + self._make_mod_db_calls())
        score_clean = _compute_raw_score("user-1", db_clean)

        # With warning
        db_warned = _make_db(
            self._make_forum_db_calls(bridging=1, p_cnt=5, p_mfi=0.4, p_wu=10, p_wd=5)
            + self._make_chat_db_calls()
            + self._make_mod_db_calls([{"action": "warning", "cnt": 1}])
        )
        score_warned = _compute_raw_score("user-1", db_warned)

        assert score_warned < score_clean

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_toxicity_reduces_score(self, _mock_cls):
        from candid.controllers.helpers.trust_score import _compute_raw_score

        user_id = "user-A"
        # Chat with all toxic messages
        toxic_chat = {
            "id": "chat-1", "end_type": "user_exit",
            "log": {
                "messages": [
                    {"senderId": user_id, "content": "msg", "toxicityScore": 0.9},
                    {"senderId": user_id, "content": "msg2", "toxicityScore": 0.8},
                ],
            },
        }
        db = _make_db(
            self._make_forum_db_calls()
            + self._make_chat_db_calls(chat_logs=[toxic_chat])
            + self._make_mod_db_calls()
        )
        score = _compute_raw_score(user_id, db)
        assert score is not None
        # High toxicity rate should produce a very low (near-zero) score
        assert score < 0.05

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_raw_score_floor_at_zero(self, _mock_cls):
        from candid.controllers.helpers.trust_score import _compute_raw_score

        user_id = "user-A"
        # User with ban + toxic messages
        toxic_chat = {
            "id": "chat-1", "end_type": "user_exit",
            "log": {
                "messages": [
                    {"senderId": user_id, "content": "x", "toxicityScore": 0.95},
                ],
                "abandonedByUserId": user_id,
            },
        }
        db = _make_db(
            self._make_forum_db_calls()
            + self._make_chat_db_calls(chat_logs=[toxic_chat])
            + self._make_mod_db_calls([{"action": "permanent_ban", "cnt": 1}])
        )
        score = _compute_raw_score(user_id, db)
        assert score is not None
        assert score == 0.0

    @patch("candid.controllers.helpers.trust_score.Database")
    def test_all_signals_combined(self, _mock_cls):
        from candid.controllers.helpers.trust_score import _compute_raw_score

        user_id = "user-A"
        chat_log = {
            "id": "chat-1", "end_type": "agreed_closure",
            "log": {
                "messages": [
                    {"senderId": user_id, "content": "good msg"},
                    {"senderId": user_id, "content": "nice msg"},
                ],
                "agreedPositions": [{"status": "accepted", "content": "agree"}],
                "explanations": [{"status": "good_faith", "explainerId": user_id}],
                "definitions": [{"status": "accepted"}],
                "reactions": {"m1": [{"userId": user_id, "emoji": "appreciate"}]},
            },
        }
        db = _make_db(
            self._make_forum_db_calls(bridging=2, p_cnt=3, p_mfi=0.6, p_wu=15, p_wd=3)
            + self._make_chat_db_calls(kudos=1, chat_logs=[chat_log])
            + self._make_mod_db_calls()
        )
        score = _compute_raw_score(user_id, db)
        assert score is not None
        assert score > 0.2  # Healthy score with all positive signals


# ---------------------------------------------------------------------------
# recalculate_all_trust_scores
# ---------------------------------------------------------------------------

class TestRecalculateAllTrustScores:

    @patch("candid.controllers.helpers.trust_score._compute_raw_score")
    def test_percentile_ranking(self, mock_raw):
        from candid.controllers.helpers.trust_score import recalculate_all_trust_scores

        # Simulate 10 users with different raw scores
        users = [{"id": f"user-{i}"} for i in range(10)]
        # Raw scores: 0.1, 0.2, ..., 1.0
        mock_raw.side_effect = [i * 0.1 + 0.1 for i in range(10)]

        db = MagicMock()
        db.execute_query = MagicMock(side_effect=[
            users,  # SELECT all users
            # Then 10 UPDATE calls + 1 NULL-out call
            *[None] * 11,
        ])

        count = recalculate_all_trust_scores(db)
        assert count == 10

        # Check that UPDATE calls were made with percentile values
        update_calls = [
            c for c in db.execute_query.call_args_list
            if "UPDATE users SET trust_score" in str(c)
            and "NULL" not in str(c)
        ]
        assert len(update_calls) == 10

        # Bottom user should get percentile ~0.0, top should get ~1.0
        # Extract (percentile, user_id) tuples
        percentiles = {}
        for call in update_calls:
            args = call[0]  # positional args to execute_query
            params = args[1]  # (percentile, user_id)
            percentiles[params[1]] = params[0]

        assert percentiles["user-0"] == pytest.approx(0.0, abs=0.01)
        assert percentiles["user-9"] == pytest.approx(0.99999, abs=0.01)

    @patch("candid.controllers.helpers.trust_score._compute_raw_score")
    def test_fallback_clamped_raw_scores_when_few_users(self, mock_raw):
        from candid.controllers.helpers.trust_score import recalculate_all_trust_scores

        # Only 3 users — below MIN_USERS_FOR_PERCENTILE (10)
        users = [{"id": f"user-{i}"} for i in range(3)]
        mock_raw.side_effect = [0.15, 0.50, 1.5]  # 1.5 should be clamped to 1.0

        db = MagicMock()
        db.execute_query = MagicMock(side_effect=[
            users,
            *[None] * 4,  # 3 UPDATEs + 1 NULL-out
        ])

        count = recalculate_all_trust_scores(db)
        assert count == 3

        update_calls = [
            c for c in db.execute_query.call_args_list
            if "UPDATE users SET trust_score" in str(c)
            and "NULL" not in str(c)
        ]
        assert len(update_calls) == 3

        # Check clamping
        percentiles = {}
        for call in update_calls:
            args = call[0]
            params = args[1]
            percentiles[params[1]] = params[0]

        assert percentiles["user-0"] == pytest.approx(0.15, abs=0.01)
        assert percentiles["user-1"] == pytest.approx(0.50, abs=0.01)
        assert percentiles["user-2"] == pytest.approx(0.99999, abs=0.01)

    @patch("candid.controllers.helpers.trust_score._compute_raw_score")
    def test_none_raw_scores_excluded(self, mock_raw):
        from candid.controllers.helpers.trust_score import recalculate_all_trust_scores

        users = [{"id": f"user-{i}"} for i in range(5)]
        # 3 have scores, 2 return None
        mock_raw.side_effect = [0.3, None, 0.5, None, 0.7]

        db = MagicMock()
        db.execute_query = MagicMock(side_effect=[
            users,
            *[None] * 4,  # 3 UPDATEs + 1 NULL-out
        ])

        count = recalculate_all_trust_scores(db)
        # Only 3 users scored, but < 10, so clamped raw scores used
        assert count == 3

    @patch("candid.controllers.helpers.trust_score._compute_raw_score")
    def test_no_users_returns_zero(self, mock_raw):
        from candid.controllers.helpers.trust_score import recalculate_all_trust_scores

        db = MagicMock()
        db.execute_query = MagicMock(return_value=[])  # no active users
        count = recalculate_all_trust_scores(db)
        assert count == 0
