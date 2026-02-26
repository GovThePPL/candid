"""Unit tests for card queue session filtering logic."""

import pytest
from unittest.mock import patch, MagicMock

pytestmark = pytest.mark.unit


class TestGetPendingSurveysSessionFilter:
    """Test that _get_pending_surveys filters by session_id."""

    @patch('candid.controllers.cards_controller._get_cached_surveys')
    @patch('candid.controllers.cards_controller.db')
    def test_no_session_filter_returns_all(self, mock_db, mock_cache):
        """Without session_id, all unanswered surveys are returned."""
        from candid.controllers.cards_controller import _get_pending_surveys

        mock_cache.return_value = [
            {"question_id": "q1", "question": "Q1", "survey_id": "s1",
             "survey_title": "S1", "session_id": "sess-a", "options": []},
            {"question_id": "q2", "question": "Q2", "survey_id": "s2",
             "survey_title": "S2", "session_id": "sess-b", "options": []},
            {"question_id": "q3", "question": "Q3", "survey_id": "s3",
             "survey_title": "S3", "session_id": None, "options": []},
        ]
        mock_db.execute_query.return_value = []  # No answered questions

        result = _get_pending_surveys("user-1", limit=10)
        assert len(result) == 3

    @patch('candid.controllers.cards_controller._get_cached_surveys')
    @patch('candid.controllers.cards_controller.db')
    def test_session_filter_matches(self, mock_db, mock_cache):
        """With session_id, only surveys for that session are returned."""
        from candid.controllers.cards_controller import _get_pending_surveys

        mock_cache.return_value = [
            {"question_id": "q1", "question": "Q1", "survey_id": "s1",
             "survey_title": "S1", "session_id": "sess-a", "options": []},
            {"question_id": "q2", "question": "Q2", "survey_id": "s2",
             "survey_title": "S2", "session_id": "sess-b", "options": []},
            {"question_id": "q3", "question": "Q3", "survey_id": "s3",
             "survey_title": "S3", "session_id": None, "options": []},
        ]
        mock_db.execute_query.return_value = []

        result = _get_pending_surveys("user-1", limit=10, session_id="sess-a")
        assert len(result) == 1
        assert result[0]["session_id"] == "sess-a"

    @patch('candid.controllers.cards_controller._get_cached_surveys')
    @patch('candid.controllers.cards_controller.db')
    def test_session_filter_no_match(self, mock_db, mock_cache):
        """With session_id that matches no surveys, returns empty."""
        from candid.controllers.cards_controller import _get_pending_surveys

        mock_cache.return_value = [
            {"question_id": "q1", "question": "Q1", "survey_id": "s1",
             "survey_title": "S1", "session_id": "sess-a", "options": []},
        ]
        mock_db.execute_query.return_value = []

        result = _get_pending_surveys("user-1", limit=10, session_id="sess-nonexistent")
        assert len(result) == 0


class TestGetPendingPairwiseSessionFilter:
    """Test that _get_pending_pairwise filters by session_id."""

    @patch('candid.controllers.cards_controller._get_cached_pairwise_surveys')
    @patch('candid.controllers.cards_controller.db')
    def test_no_session_filter_returns_all(self, mock_db, mock_cache):
        """Without session_id, all pairwise surveys are considered."""
        from candid.controllers.cards_controller import _get_pending_pairwise

        mock_cache.return_value = [
            {"id": "ps1", "survey_title": "PS1", "comparison_question": "Which?",
             "session_id": "sess-a", "location_code": "OR", "location_name": "Oregon",
             "session_name": "Healthcare", "items": [
                {"id": "i1", "item_text": "A"},
                {"id": "i2", "item_text": "B"},
             ]},
            {"id": "ps2", "survey_title": "PS2", "comparison_question": "Which?",
             "session_id": "sess-b", "location_code": "OR", "location_name": "Oregon",
             "session_name": "Economy", "items": [
                {"id": "i3", "item_text": "C"},
                {"id": "i4", "item_text": "D"},
             ]},
        ]
        mock_db.execute_query.return_value = []  # No responses yet

        result = _get_pending_pairwise("user-1", limit=10)
        # Should return cards from both surveys
        assert len(result) >= 1

    @patch('candid.controllers.cards_controller._get_cached_pairwise_surveys')
    @patch('candid.controllers.cards_controller.db')
    def test_session_filter_restricts(self, mock_db, mock_cache):
        """With session_id, only pairwise surveys for that session are used."""
        from candid.controllers.cards_controller import _get_pending_pairwise

        mock_cache.return_value = [
            {"id": "ps1", "survey_title": "PS1", "comparison_question": "Which?",
             "session_id": "sess-a", "location_code": "OR", "location_name": "Oregon",
             "session_name": "Healthcare", "items": [
                {"id": "i1", "item_text": "A"},
                {"id": "i2", "item_text": "B"},
             ]},
            {"id": "ps2", "survey_title": "PS2", "comparison_question": "Which?",
             "session_id": "sess-b", "location_code": "OR", "location_name": "Oregon",
             "session_name": "Economy", "items": [
                {"id": "i3", "item_text": "C"},
                {"id": "i4", "item_text": "D"},
             ]},
        ]
        mock_db.execute_query.return_value = []

        result = _get_pending_pairwise("user-1", limit=10, session_id="sess-a")
        # All returned cards should be from ps1 (sess-a)
        for card in result:
            assert card["data"]["surveyId"] == "ps1"

    @patch('candid.controllers.cards_controller._get_cached_pairwise_surveys')
    @patch('candid.controllers.cards_controller.db')
    def test_session_filter_no_match_returns_empty(self, mock_db, mock_cache):
        """With session_id that matches no pairwise surveys, returns empty."""
        from candid.controllers.cards_controller import _get_pending_pairwise

        mock_cache.return_value = [
            {"id": "ps1", "survey_title": "PS1", "comparison_question": "Which?",
             "session_id": "sess-a", "location_code": "OR", "location_name": "Oregon",
             "session_name": "Healthcare", "items": [
                {"id": "i1", "item_text": "A"},
                {"id": "i2", "item_text": "B"},
             ]},
        ]
        mock_db.execute_query.return_value = []

        result = _get_pending_pairwise("user-1", limit=10, session_id="sess-nonexistent")
        assert len(result) == 0


class TestCachedSurveysIncludeSessionId:
    """Test that cached survey dicts include session_id."""

    @patch('candid.controllers.cards_controller.db')
    def test_session_id_in_cached_surveys(self, mock_db):
        """_get_cached_surveys includes session_id in each question dict."""
        from candid.controllers import cards_controller
        # Clear cache to force fresh fetch
        cards_controller._survey_cache = None
        cards_controller._survey_cache_time = 0

        mock_db.execute_query.return_value = [
            {"question_id": "q1", "question": "Q1", "survey_id": "s1",
             "survey_title": "S1", "end_time": None, "session_id": "sess-123",
             "option_id": "o1", "option_text": "Opt A"},
        ]

        result = cards_controller._get_cached_surveys()
        assert len(result) == 1
        assert result[0]["session_id"] == "sess-123"

    @patch('candid.controllers.cards_controller.db')
    def test_null_session_id_in_cached_surveys(self, mock_db):
        """_get_cached_surveys handles NULL session_id."""
        from candid.controllers import cards_controller
        cards_controller._survey_cache = None
        cards_controller._survey_cache_time = 0

        mock_db.execute_query.return_value = [
            {"question_id": "q1", "question": "Q1", "survey_id": "s1",
             "survey_title": "S1", "end_time": None, "session_id": None,
             "option_id": "o1", "option_text": "Opt A"},
        ]

        result = cards_controller._get_cached_surveys()
        assert len(result) == 1
        assert result[0]["session_id"] is None


class TestCachedPairwiseSurveysIncludeSessionId:
    """Test that cached pairwise survey dicts include session_id."""

    @patch('candid.controllers.cards_controller.db')
    def test_session_id_in_cached_pairwise(self, mock_db):
        """_get_cached_pairwise_surveys includes session_id in each survey dict."""
        from candid.controllers import cards_controller
        cards_controller._pairwise_cache = None
        cards_controller._pairwise_cache_time = 0

        mock_db.execute_query.return_value = [
            {"id": "ps1", "survey_title": "PS1", "comparison_question": "Which?",
             "session_id": "sess-456", "location_code": "OR", "location_name": "Oregon",
             "session_name": "Healthcare", "item_id": "i1", "item_text": "A", "item_order": 1},
            {"id": "ps1", "survey_title": "PS1", "comparison_question": "Which?",
             "session_id": "sess-456", "location_code": "OR", "location_name": "Oregon",
             "session_name": "Healthcare", "item_id": "i2", "item_text": "B", "item_order": 2},
        ]

        result = cards_controller._get_cached_pairwise_surveys()
        assert len(result) == 1
        assert result[0]["session_id"] == "sess-456"
