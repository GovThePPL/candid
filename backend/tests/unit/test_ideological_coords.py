"""Unit tests for ideological_coords.py — mock DB, Redis, and Polis API."""

import json
import math
from unittest.mock import patch, MagicMock

import pytest

from candid.controllers.helpers.ideological_coords import (
    project_user,
    blended_coords,
    _lookup_group_id,
)

pytestmark = pytest.mark.unit

# Shorthand for the module path being patched
IC = "candid.controllers.helpers.ideological_coords"


# ---------------------------------------------------------------------------
# Helpers: create patched module functions to avoid real DB/Redis
# ---------------------------------------------------------------------------

class _SimpleRedis:
    """Minimal in-memory Redis fake for tests."""
    def __init__(self):
        self._data = {}
    def get(self, key):
        return self._data.get(key)
    def set(self, key, value):
        self._data[key] = value
    def setex(self, key, ttl, value):
        self._data[key] = value
    def delete(self, *keys):
        for k in keys:
            self._data.pop(k, None)


def _make_mock_redis(data=None):
    """Create a mock Redis instance with optional pre-loaded data."""
    r = _SimpleRedis()
    if data:
        for k, v in data.items():
            r.set(k, v)
    return r


# ---------------------------------------------------------------------------
# project_user (pure math, no mocks)
# ---------------------------------------------------------------------------

class TestProjectUser:
    def test_known_vote_vector(self):
        """Known input -> expected (x, y) with sparsity scaling."""
        comps = [
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
        ]
        center = [0.0, 0.0, 0.0]
        user_votes = {0: 1, 1: -1}

        x, y = project_user(user_votes, comps, center)

        scale = math.sqrt(3.0 / 2.0)
        assert abs(x - 1.0 * scale) < 1e-9
        assert abs(y - (-1.0) * scale) < 1e-9

    def test_centering(self):
        comps = [[1.0, 0.0], [0.0, 1.0]]
        center = [0.5, -0.5]
        user_votes = {0: 1, 1: -1}

        x, y = project_user(user_votes, comps, center)
        assert abs(x - 0.5) < 1e-9
        assert abs(y - (-0.5)) < 1e-9

    def test_sparsity_scaling(self):
        comps = [[1.0, 0.0, 0.0, 0.0], [0.0, 1.0, 0.0, 0.0]]
        center = [0.0, 0.0, 0.0, 0.0]

        x1, _ = project_user({0: 1}, comps, center)
        x2, _ = project_user({0: 1, 1: 1}, comps, center)

        assert abs(x1 - 2.0) < 1e-9
        assert abs(x2 - math.sqrt(2)) < 1e-9

    def test_empty_votes(self):
        assert project_user({}, [[1, 0], [0, 1]], [0, 0]) == (0.0, 0.0)

    def test_none_inputs(self):
        assert project_user(None, [[1]], [0]) == (0.0, 0.0)
        assert project_user({0: 1}, None, [0]) == (0.0, 0.0)
        assert project_user({0: 1}, [[1]], None) == (0.0, 0.0)

    def test_tid_beyond_range_ignored(self):
        comps = [[1.0, 0.0], [0.0, 1.0]]
        center = [0.0, 0.0]
        user_votes = {0: 1, 99: 1}

        x, y = project_user(user_votes, comps, center)
        assert abs(x - math.sqrt(2)) < 1e-9
        assert abs(y - 0.0) < 1e-9


# ---------------------------------------------------------------------------
# get_pca_cache
# ---------------------------------------------------------------------------

class TestGetPcaCache:
    def test_cache_hit(self):
        """Returns cached data from Redis."""
        cache_data = {
            "comps": [[1, 0], [0, 1]],
            "center": [0, 0],
            "max_distance": 5.0,
            "math_tick": 42,
        }
        mock_r = _make_mock_redis({"pca:conv123": json.dumps(cache_data)})

        with patch(f"{IC}.get_redis", return_value=mock_r):
            from candid.controllers.helpers.ideological_coords import get_pca_cache
            result = get_pca_cache("conv123")

        assert result == cache_data

    def test_cache_miss_fetches_from_polis(self):
        """On cache miss, fetches from Polis API and caches."""
        mock_r = _make_mock_redis()
        mock_math_data = {
            "pca": {
                "asPOJO": {
                    "comps": [[1, 0], [0, 1]],
                    "center": [0.5, 0.5],
                    "base-clusters": {"x": [0.0, 3.0], "y": [0.0, 4.0]},
                    "group-clusters": [
                        {"members": [0, 1, 2]},
                        {"members": [3, 4]},
                    ],
                }
            },
            "math_tick": 7,
        }
        mock_client = MagicMock()
        mock_client.get_math_data.return_value = mock_math_data

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.get_client", return_value=mock_client):
            from candid.controllers.helpers.ideological_coords import get_pca_cache
            result = get_pca_cache("conv456")

        assert result is not None
        assert result["comps"] == [[1, 0], [0, 1]]
        assert abs(result["max_distance"] - 5.0) < 1e-9
        assert result["math_tick"] == 7
        assert result["group_members"] == [[0, 1, 2], [3, 4]]

        # Verify cached
        cached = mock_r.get("pca:conv456")
        assert cached is not None

    def test_polis_no_pca_data(self):
        """Returns None if Polis has no PCA data yet."""
        mock_r = _make_mock_redis()
        mock_client = MagicMock()
        mock_client.get_math_data.return_value = {}

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.get_client", return_value=mock_client):
            from candid.controllers.helpers.ideological_coords import get_pca_cache
            result = get_pca_cache("conv_empty")

        assert result is None

    def test_polis_error(self):
        """Returns None on Polis API error."""
        mock_r = _make_mock_redis()
        mock_client = MagicMock()
        mock_client.get_math_data.side_effect = Exception("connection refused")

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.get_client", return_value=mock_client):
            from candid.controllers.helpers.ideological_coords import get_pca_cache
            result = get_pca_cache("conv_err")

        assert result is None


# ---------------------------------------------------------------------------
# _lookup_group_id
# ---------------------------------------------------------------------------

class TestLookupGroupId:
    def test_returns_correct_group_index(self):
        """Returns group index when PID found in group members."""
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"polis_pid": 3}

        pca_cache = {"group_members": [[0, 1, 2], [3, 4]]}

        with patch(f"{IC}.db", mock_db):
            result = _lookup_group_id("user1", "conv1", pca_cache)

        assert result == 1

    def test_returns_first_group(self):
        """Returns 0 when PID found in first group."""
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"polis_pid": 1}

        pca_cache = {"group_members": [[0, 1, 2], [3, 4]]}

        with patch(f"{IC}.db", mock_db):
            result = _lookup_group_id("user1", "conv1", pca_cache)

        assert result == 0

    def test_returns_none_pid_not_in_any_group(self):
        """Returns None when PID not in any group member list."""
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"polis_pid": 99}

        pca_cache = {"group_members": [[0, 1, 2], [3, 4]]}

        with patch(f"{IC}.db", mock_db):
            result = _lookup_group_id("user1", "conv1", pca_cache)

        assert result is None

    def test_returns_none_no_participant_record(self):
        """Returns None when user has no polis_participant record."""
        mock_db = MagicMock()
        mock_db.execute_query.return_value = None

        pca_cache = {"group_members": [[0, 1, 2], [3, 4]]}

        with patch(f"{IC}.db", mock_db):
            result = _lookup_group_id("user_new", "conv1", pca_cache)

        assert result is None

    def test_returns_none_no_group_members(self):
        """Returns None when pca_cache has no group_members."""
        mock_db = MagicMock()
        pca_cache = {"group_members": []}

        with patch(f"{IC}.db", mock_db):
            result = _lookup_group_id("user1", "conv1", pca_cache)

        assert result is None
        # Should not even query DB
        mock_db.execute_query.assert_not_called()

    def test_returns_none_missing_group_members_key(self):
        """Returns None when pca_cache doesn't have group_members key."""
        mock_db = MagicMock()
        pca_cache = {"comps": [[1, 0]], "center": [0]}

        with patch(f"{IC}.db", mock_db):
            result = _lookup_group_id("user1", "conv1", pca_cache)

        assert result is None


# ---------------------------------------------------------------------------
# get_or_compute_coords
# ---------------------------------------------------------------------------

class TestGetOrComputeCoords:
    def _pca_cache_json(self, math_tick=42):
        return json.dumps({
            "comps": [[1.0, 0.0], [0.0, 1.0]],
            "center": [0.0, 0.0],
            "max_distance": 5.0,
            "math_tick": math_tick,
            "group_members": [[0, 1], [2, 3]],
        })

    def test_cache_hit_db(self):
        """Returns cached coords from DB if math_tick matches."""
        mock_r = _make_mock_redis({"pca:conv1": self._pca_cache_json(42)})
        mock_db = MagicMock()

        def db_side_effect(sql, params=None, fetchone=False, **kw):
            if "user_ideological_coords" in sql and "SELECT" in sql:
                return {"x": 1.5, "y": -0.3, "n_position_votes": 8, "n_comment_votes": 3, "math_tick": 42, "polis_group_id": 1}
            return None

        mock_db.execute_query.side_effect = db_side_effect

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.db", mock_db):
            from candid.controllers.helpers.ideological_coords import get_or_compute_coords
            result = get_or_compute_coords("user1", "conv1")

        assert result == {"x": 1.5, "y": -0.3, "n_position_votes": 8, "n_comment_votes": 3, "math_tick": 42, "polis_group_id": 1}

    def test_cache_hit_returns_polis_group_id(self):
        """Returns polis_group_id from DB cache when present."""
        mock_r = _make_mock_redis({"pca:conv1": self._pca_cache_json(42)})
        mock_db = MagicMock()

        def db_side_effect(sql, params=None, fetchone=False, **kw):
            if "user_ideological_coords" in sql and "SELECT" in sql:
                return {"x": 1.0, "y": 2.0, "n_position_votes": 5, "math_tick": 42, "polis_group_id": 0}
            return None

        mock_db.execute_query.side_effect = db_side_effect

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.db", mock_db):
            from candid.controllers.helpers.ideological_coords import get_or_compute_coords
            result = get_or_compute_coords("user1", "conv1")

        assert result["polis_group_id"] == 0

    def test_cache_miss_computes(self):
        """Computes coords from votes if not cached."""
        mock_r = _make_mock_redis({"pca:conv2": self._pca_cache_json(42)})
        mock_db = MagicMock()

        def db_side_effect(sql, params=None, fetchone=False, **kw):
            if "user_ideological_coords" in sql and "SELECT" in sql:
                return None  # no cached coords
            if "response" in sql and "polis_comment" in sql:
                return [
                    {"tid": 0, "vote_value": 1},
                    {"tid": 1, "vote_value": -1},
                ]
            if "polis_participant" in sql:
                return {"polis_pid": 2}
            if "polis_conversation" in sql and "SELECT" in sql:
                return {"location_id": "loc1", "category_id": "cat1"}
            return None

        mock_db.execute_query.side_effect = db_side_effect

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.db", mock_db):
            from candid.controllers.helpers.ideological_coords import get_or_compute_coords
            result = get_or_compute_coords("user2", "conv2")

        assert result is not None
        assert "x" in result and "y" in result
        assert result["n_position_votes"] == 2
        assert result["math_tick"] == 42
        assert result["polis_group_id"] == 1  # PID 2 is in group 1: [2, 3]

    def test_stale_math_tick_recomputes(self):
        """Recomputes if DB coords have old math_tick."""
        mock_r = _make_mock_redis({"pca:conv3": self._pca_cache_json(99)})
        mock_db = MagicMock()

        def db_side_effect(sql, params=None, fetchone=False, **kw):
            if "user_ideological_coords" in sql and "SELECT" in sql:
                return {"x": 1.0, "y": 2.0, "n_position_votes": 5, "math_tick": 42, "polis_group_id": None}
            if "response" in sql and "polis_comment" in sql:
                return [{"tid": 0, "vote_value": 1}]
            if "polis_participant" in sql:
                return None  # no participant record
            if "polis_conversation" in sql and "SELECT" in sql:
                return {"location_id": "loc1", "category_id": "cat1"}
            return None

        mock_db.execute_query.side_effect = db_side_effect

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.db", mock_db):
            from candid.controllers.helpers.ideological_coords import get_or_compute_coords
            result = get_or_compute_coords("user3", "conv3")

        assert result["math_tick"] == 99

    def test_no_votes_returns_none(self):
        """Returns None if user has no position votes."""
        mock_r = _make_mock_redis({"pca:conv4": self._pca_cache_json(42)})
        mock_db = MagicMock()

        def db_side_effect(sql, params=None, fetchone=False, **kw):
            if "user_ideological_coords" in sql and "SELECT" in sql:
                return None
            if "response" in sql:
                return []  # no votes
            return None

        mock_db.execute_query.side_effect = db_side_effect

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.db", mock_db):
            from candid.controllers.helpers.ideological_coords import get_or_compute_coords
            result = get_or_compute_coords("user4", "conv4")

        assert result is None

    def test_no_pca_data_returns_none(self):
        """Returns None if Polis has no PCA data."""
        mock_r = _make_mock_redis()
        mock_client = MagicMock()
        mock_client.get_math_data.return_value = {}

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.get_client", return_value=mock_client):
            from candid.controllers.helpers.ideological_coords import get_or_compute_coords
            result = get_or_compute_coords("user5", "conv_no_pca")

        assert result is None


# ---------------------------------------------------------------------------
# get_effective_coords
# ---------------------------------------------------------------------------

class TestGetEffectiveCoords:
    def _pca_cache_json(self):
        return json.dumps({
            "comps": [[1.0, 0.0], [0.0, 1.0]],
            "center": [0.0, 0.0],
            "max_distance": 5.0,
            "math_tick": 42,
            "group_members": [[0, 1], [2, 3]],
        })

    def _setup(self, mock_db_obj, n_comment_votes=0, polis_x=1.0, polis_y=2.0, polis_group_id=0):
        """Configure mock DB for effective coords tests."""
        def db_side_effect(sql, params=None, fetchone=False, **kw):
            if "user_ideological_coords" in sql and "SELECT" in sql:
                return {"x": polis_x, "y": polis_y, "n_position_votes": 10,
                        "n_comment_votes": n_comment_votes, "math_tick": 42, "polis_group_id": polis_group_id}
            return None
        mock_db_obj.execute_query.side_effect = db_side_effect

    def test_pure_polis_zero_comment_votes(self):
        """With 0 comment votes and MF stub -> pure Polis coords."""
        mock_r = _make_mock_redis({"pca:conv1": self._pca_cache_json()})
        mock_db = MagicMock()
        self._setup(mock_db, n_comment_votes=0)

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.db", mock_db), \
             patch(f"{IC}.mf") as mock_mf:
            mock_mf.get_mf_coords.return_value = None
            from candid.controllers.helpers.ideological_coords import get_effective_coords
            result = get_effective_coords("user1", "conv1")

        assert abs(result["x"] - 1.0) < 1e-9
        assert abs(result["y"] - 2.0) < 1e-9

    def test_blended_half(self):
        """With 15 comment votes -> alpha=0.5."""
        mock_r = _make_mock_redis({"pca:conv1": self._pca_cache_json()})
        mock_db = MagicMock()
        self._setup(mock_db, n_comment_votes=15)

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.db", mock_db), \
             patch(f"{IC}.mf") as mock_mf:
            mock_mf.get_mf_coords.return_value = (3.0, 4.0)
            from candid.controllers.helpers.ideological_coords import get_effective_coords
            result = get_effective_coords("user1", "conv1")

        assert abs(result["x"] - 2.0) < 1e-9
        assert abs(result["y"] - 3.0) < 1e-9

    def test_pure_mf_30_plus_votes(self):
        """With 30+ comment votes -> alpha=1.0, pure MF."""
        mock_r = _make_mock_redis({"pca:conv1": self._pca_cache_json()})
        mock_db = MagicMock()
        self._setup(mock_db, n_comment_votes=30)

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.db", mock_db), \
             patch(f"{IC}.mf") as mock_mf:
            mock_mf.get_mf_coords.return_value = (5.0, 6.0)
            from candid.controllers.helpers.ideological_coords import get_effective_coords
            result = get_effective_coords("user1", "conv1")

        assert abs(result["x"] - 5.0) < 1e-9
        assert abs(result["y"] - 6.0) < 1e-9

    def test_mf_none_falls_back_to_polis(self):
        """When MF returns None, use pure Polis regardless of n_comment_votes."""
        mock_r = _make_mock_redis({"pca:conv1": self._pca_cache_json()})
        mock_db = MagicMock()
        self._setup(mock_db, n_comment_votes=50)

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.db", mock_db), \
             patch(f"{IC}.mf") as mock_mf:
            mock_mf.get_mf_coords.return_value = None
            from candid.controllers.helpers.ideological_coords import get_effective_coords
            result = get_effective_coords("user1", "conv1")

        assert abs(result["x"] - 1.0) < 1e-9
        assert abs(result["y"] - 2.0) < 1e-9

    def test_no_coords_at_all(self):
        """Returns None if user has no Polis coords."""
        mock_r = _make_mock_redis()
        mock_client = MagicMock()
        mock_client.get_math_data.return_value = {}

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.get_client", return_value=mock_client):
            from candid.controllers.helpers.ideological_coords import get_effective_coords
            result = get_effective_coords("user_new", "conv_empty")

        assert result is None

    def test_returns_polis_group_id(self):
        """Returns polis_group_id from underlying coords."""
        mock_r = _make_mock_redis({"pca:conv1": self._pca_cache_json()})
        mock_db = MagicMock()
        self._setup(mock_db, n_comment_votes=0, polis_group_id=1)

        with patch(f"{IC}.get_redis", return_value=mock_r), \
             patch(f"{IC}.db", mock_db), \
             patch(f"{IC}.mf") as mock_mf:
            mock_mf.get_mf_coords.return_value = None
            from candid.controllers.helpers.ideological_coords import get_effective_coords
            result = get_effective_coords("user1", "conv1")

        assert result["polis_group_id"] == 1


# ---------------------------------------------------------------------------
# blended_coords (pure math)
# ---------------------------------------------------------------------------

class TestBlendedCoords:
    def test_no_mf_returns_polis(self):
        result = blended_coords((1.0, 2.0), None, 100)
        assert result == (1.0, 2.0)

    def test_zero_comment_votes_pure_polis(self):
        result = blended_coords((1.0, 2.0), (5.0, 6.0), 0)
        assert abs(result[0] - 1.0) < 1e-9
        assert abs(result[1] - 2.0) < 1e-9

    def test_alpha_half(self):
        result = blended_coords((0.0, 0.0), (2.0, 4.0), 15, threshold=30)
        assert abs(result[0] - 1.0) < 1e-9
        assert abs(result[1] - 2.0) < 1e-9

    def test_alpha_full(self):
        result = blended_coords((0.0, 0.0), (2.0, 4.0), 30, threshold=30)
        assert abs(result[0] - 2.0) < 1e-9
        assert abs(result[1] - 4.0) < 1e-9

    def test_alpha_capped_at_one(self):
        result = blended_coords((0.0, 0.0), (2.0, 4.0), 100, threshold=30)
        assert abs(result[0] - 2.0) < 1e-9
        assert abs(result[1] - 4.0) < 1e-9

    def test_custom_threshold(self):
        result = blended_coords((0.0, 0.0), (10.0, 10.0), 5, threshold=10)
        assert abs(result[0] - 5.0) < 1e-9
        assert abs(result[1] - 5.0) < 1e-9


# ---------------------------------------------------------------------------
# invalidate_coords
# ---------------------------------------------------------------------------

class TestInvalidateCoords:
    def test_deletes_from_db(self):
        """Calls DELETE on user_ideological_coords."""
        mock_db = MagicMock()

        with patch(f"{IC}.db", mock_db):
            from candid.controllers.helpers.ideological_coords import invalidate_coords
            invalidate_coords("user1", "conv1")

        calls = mock_db.execute_query.call_args_list
        assert len(calls) >= 1
        sql = calls[-1][0][0]
        assert "DELETE" in sql
        assert "user_ideological_coords" in sql


# ---------------------------------------------------------------------------
# get_conversation_for_post
# ---------------------------------------------------------------------------

class TestGetConversationForPost:
    def setup_method(self):
        """Clear the process-local conversation cache between tests."""
        from candid.controllers.helpers import ideological_coords
        ideological_coords._conversation_cache.clear()

    def test_with_category(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"polis_conversation_id": "conv_abc"}

        with patch(f"{IC}.db", mock_db):
            from candid.controllers.helpers.ideological_coords import get_conversation_for_post
            result = get_conversation_for_post("loc1", "cat1")

        assert result == "conv_abc"

    def test_without_category(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"polis_conversation_id": "conv_xyz"}

        with patch(f"{IC}.db", mock_db):
            from candid.controllers.helpers.ideological_coords import get_conversation_for_post
            result = get_conversation_for_post("loc1", None)

        assert result == "conv_xyz"

    def test_none_when_no_conversation(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = None

        with patch(f"{IC}.db", mock_db):
            from candid.controllers.helpers.ideological_coords import get_conversation_for_post
            result = get_conversation_for_post("loc1", "cat1")

        assert result is None
