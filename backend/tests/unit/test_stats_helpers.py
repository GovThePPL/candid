"""Unit tests for helpers/stats.py — demographics aggregation and vote helpers,
and stats_controller._get_cached_group_labels phase filtering."""

import pytest
from unittest.mock import patch, MagicMock

from candid.controllers.helpers.stats import (
    empty_demographics,
    aggregate_demographics,
    get_vote_dist_for_group,
    get_overall_vote_dist,
)

pytestmark = pytest.mark.unit

STATS_HELPERS = "candid.controllers.helpers.stats"
STATS_CONTROLLER = "candid.controllers.stats_controller"


class TestEmptyDemographics:
    def test_defaults(self):
        result = empty_demographics("0")
        assert result["groupId"] == "0"
        assert result["groupLabel"] == "All"
        assert result["memberCount"] == 0
        assert result["respondentCount"] == 0
        assert result["lean"] == {}
        assert result["sex"] == {}

    def test_custom_label_and_count(self):
        result = empty_demographics("1", "Group B", 42)
        assert result["groupLabel"] == "Group B"
        assert result["memberCount"] == 42

    def test_all_demographic_fields_present(self):
        result = empty_demographics("all")
        for key in ["lean", "education", "geoLocale", "sex", "race", "ageRange", "incomeRange"]:
            assert key in result
            assert result[key] == {}


class TestAggregateDemographics:
    def test_empty_list(self):
        result = aggregate_demographics([], "0", "A", 5)
        assert result["respondentCount"] == 0
        assert result["lean"] == {}

    def test_single_respondent(self):
        data = [{"lean": "left", "sex": "female", "education": "college"}]
        result = aggregate_demographics(data, "0", "A", 10)
        assert result["respondentCount"] == 1
        assert result["lean"] == {"left": 1}
        assert result["sex"] == {"female": 1}
        assert result["education"] == {"college": 1}
        assert result["race"] == {}

    def test_multiple_respondents(self):
        data = [
            {"lean": "left", "sex": "male"},
            {"lean": "right", "sex": "female"},
            {"lean": "left", "sex": "male"},
        ]
        result = aggregate_demographics(data, "1", "B", 20)
        assert result["respondentCount"] == 3
        assert result["lean"] == {"left": 2, "right": 1}
        assert result["sex"] == {"male": 2, "female": 1}

    def test_none_values_skipped(self):
        data = [
            {"lean": None, "sex": "male"},
            {"lean": "center", "sex": None},
        ]
        result = aggregate_demographics(data, "0", "A", 5)
        assert result["lean"] == {"center": 1}
        assert result["sex"] == {"male": 1}

    def test_preserves_group_metadata(self):
        result = aggregate_demographics([], "2", "C", 100)
        assert result["groupId"] == "2"
        assert result["groupLabel"] == "C"
        assert result["memberCount"] == 100


class TestGetVoteDistForGroup:
    def test_basic_distribution(self):
        group_votes = {
            "0": {"votes": {"5": {"A": 30, "D": 10, "S": 50}}}
        }
        result = get_vote_dist_for_group(group_votes, 5, "0")
        assert result["agree"] == 0.6
        assert result["disagree"] == 0.2
        assert result["pass"] == 0.2

    def test_no_votes(self):
        result = get_vote_dist_for_group({}, 5, "0")
        assert result == {"agree": 0, "disagree": 0, "pass": 0}

    def test_missing_group(self):
        group_votes = {"1": {"votes": {"5": {"A": 10, "D": 5, "S": 20}}}}
        result = get_vote_dist_for_group(group_votes, 5, "0")
        assert result == {"agree": 0, "disagree": 0, "pass": 0}

    def test_all_agree(self):
        group_votes = {"0": {"votes": {"1": {"A": 10, "D": 0, "S": 10}}}}
        result = get_vote_dist_for_group(group_votes, 1, "0")
        assert result["agree"] == 1.0
        assert result["disagree"] == 0.0
        assert result["pass"] == 0.0

    def test_rounding(self):
        group_votes = {"0": {"votes": {"1": {"A": 1, "D": 1, "S": 3}}}}
        result = get_vote_dist_for_group(group_votes, 1, "0")
        assert result["agree"] == 0.333
        assert result["disagree"] == 0.333
        assert result["pass"] == 0.333


class TestGetOverallVoteDist:
    def test_from_votes_base(self):
        votes_base = {"5": {"A": [10, 5], "D": [3, 2], "S": [15, 10]}}
        dist, total = get_overall_vote_dist(votes_base, {}, 5)
        assert dist["agree"] == 0.6  # 15/25
        assert dist["disagree"] == 0.2  # 5/25
        assert dist["pass"] == 0.2  # 5/25
        assert total == 25  # 15a + 5d + 5pass = 25

    def test_fallback_to_group_votes(self):
        group_votes = {
            "0": {"votes": {"3": {"A": 5, "D": 3, "S": 10}}},
            "1": {"votes": {"3": {"A": 4, "D": 2, "S": 8}}},
        }
        dist, total = get_overall_vote_dist({}, group_votes, 3)
        # total_a=9, total_d=5, total_saw=18, pass=4
        assert dist["agree"] == 0.5  # 9/18
        assert total == 18  # 9 + 5 + 4

    def test_no_data_returns_zero(self):
        dist, total = get_overall_vote_dist({}, {}, 99)
        assert dist == {"agree": 0, "disagree": 0, "pass": 0}
        assert total == 0


class TestGetUserVotes:
    def test_with_session(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"position_id": "p1", "response": "agree"},
            {"position_id": "p2", "response": "disagree"},
        ])

        with patch(f"{STATS_HELPERS}.db", mock_db):
            from candid.controllers.helpers.stats import get_user_votes
            result = get_user_votes("user1", "cat1", "loc1")
            assert result == {"p1": "agree", "p2": "disagree"}
            sql = mock_db.execute_query.call_args[0][0]
            assert "session_id" in sql

    def test_without_session(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[])

        with patch(f"{STATS_HELPERS}.db", mock_db):
            from candid.controllers.helpers.stats import get_user_votes
            result = get_user_votes("user1", None, "loc1")
            assert result == {}
            sql = mock_db.execute_query.call_args[0][0]
            assert "session_id" not in sql

    def test_none_votes_returns_empty(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch(f"{STATS_HELPERS}.db", mock_db):
            from candid.controllers.helpers.stats import get_user_votes
            assert get_user_votes("user1", "cat1", "loc1") == {}


class TestGetUserPositionIds:
    def test_with_session(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"id": "p1"}, {"id": "p2"},
        ])

        with patch(f"{STATS_HELPERS}.db", mock_db):
            from candid.controllers.helpers.stats import get_user_position_ids
            result = get_user_position_ids("user1", "cat1", "loc1")
            assert result == ["p1", "p2"]

    def test_without_session(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[{"id": "p1"}])

        with patch(f"{STATS_HELPERS}.db", mock_db):
            from candid.controllers.helpers.stats import get_user_position_ids
            result = get_user_position_ids("user1", None, "loc1")
            assert result == ["p1"]

    def test_none_returns_empty(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch(f"{STATS_HELPERS}.db", mock_db):
            from candid.controllers.helpers.stats import get_user_position_ids
            assert get_user_position_ids("user1", "cat1", "loc1") == []


class TestGetCachedGroupLabelsPhase:
    """Test phase filtering in _get_cached_group_labels."""

    def _call(self, **kwargs):
        """Import and call _get_cached_group_labels, clearing cache first."""
        import candid.controllers.stats_controller as sc
        sc._label_cache.clear()
        return sc._get_cached_group_labels(**kwargs)

    def test_phase_specific_survey_found(self):
        """When phase='proposal' and a matching survey exists, it should be found."""
        mock_db = MagicMock()
        # First call (polis_conv_id lookup) returns None
        # Second call (phase-specific session query) returns survey
        mock_db.execute_query = MagicMock(side_effect=[
            None,  # polis_conv_id lookup
            {"id": "survey-123"},  # phase='proposal' query
            [],  # items
        ])

        with patch(f"{STATS_CONTROLLER}.db", mock_db):
            result = self._call(
                polis_conv_id="conv1",
                math_data={"pca": {"asPOJO": {"group-clusters": []}}},
                location_id="loc1",
                session_id="sess1",
                phase="proposal",
            )
        assert result == {}
        # Should have called with phase parameter in the query
        calls = mock_db.execute_query.call_args_list
        # Second call should include phase='proposal'
        assert "proposal" in str(calls[1])

    def test_phase_null_fallback(self):
        """When phase='opinion' but no phase-specific survey, falls back to NULL phase."""
        mock_db = MagicMock()
        # polis_conv_id lookup → None
        # phase='opinion' query → None
        # phase IS NULL fallback → survey found
        mock_db.execute_query = MagicMock(side_effect=[
            None,  # polis_conv_id lookup
            None,  # phase='opinion' query
            {"id": "survey-legacy"},  # phase IS NULL fallback
            [],  # items
        ])

        with patch(f"{STATS_CONTROLLER}.db", mock_db):
            result = self._call(
                polis_conv_id="conv2",
                math_data={"pca": {"asPOJO": {"group-clusters": []}}},
                location_id="loc1",
                session_id="sess1",
                phase="opinion",
            )
        assert result == {}
        calls = mock_db.execute_query.call_args_list
        assert len(calls) >= 3  # polis lookup + phase query + NULL fallback

    def test_no_phase_skips_phase_query(self):
        """When phase=None, should use the old code path (no phase filter)."""
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(side_effect=[
            None,  # polis_conv_id lookup
            {"id": "survey-old"},  # phase IS NULL query (old path)
            [],  # items
        ])

        with patch(f"{STATS_CONTROLLER}.db", mock_db):
            result = self._call(
                polis_conv_id="conv3",
                math_data={"pca": {"asPOJO": {"group-clusters": []}}},
                location_id="loc1",
                session_id="sess1",
                phase=None,
            )
        assert result == {}
        calls = mock_db.execute_query.call_args_list
        # Only 2 calls: polis lookup + NULL fallback (no phase-specific query)
        assert len(calls) == 3  # polis + null fallback + items

    def test_cache_key_includes_phase(self):
        """Cache keys should differ by phase."""
        import candid.controllers.stats_controller as sc
        sc._label_cache.clear()

        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch(f"{STATS_CONTROLLER}.db", mock_db):
            sc._get_cached_group_labels(
                polis_conv_id="conv4",
                math_data={"pca": {"asPOJO": {"group-clusters": []}}},
                location_id="loc1",
                session_id="sess1",
                phase="proposal",
            )
            sc._get_cached_group_labels(
                polis_conv_id="conv4",
                math_data={"pca": {"asPOJO": {"group-clusters": []}}},
                location_id="loc1",
                session_id="sess1",
                phase="opinion",
            )

        assert "labels:conv4:proposal" in sc._label_cache
        assert "labels:conv4:opinion" in sc._label_cache
