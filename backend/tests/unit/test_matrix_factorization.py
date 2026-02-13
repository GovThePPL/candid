"""Unit tests for matrix_factorization.py — core MF algorithm and DB interactions."""

import math
from unittest.mock import patch, MagicMock, call

import numpy as np
import pytest

pytestmark = pytest.mark.unit

MF = "candid.controllers.helpers.matrix_factorization"


# ---------------------------------------------------------------------------
# Helper: generate synthetic vote data
# ---------------------------------------------------------------------------

def _make_two_group_votes(n_left=15, n_right=15, n_comments=10):
    """Create synthetic votes with two ideological groups.

    Left users upvote comments 0..n_comments//2-1, downvote the rest.
    Right users do the opposite. Creates a clear two-group signal.

    Returns:
        (votes, n_users, n_comments) tuple.
    """
    votes = []
    n_users = n_left + n_right
    mid = n_comments // 2

    for u in range(n_left):
        for c in range(n_comments):
            rating = 1 if c < mid else -1
            votes.append((u, c, rating))

    for u in range(n_right):
        u_idx = n_left + u
        for c in range(n_comments):
            rating = -1 if c < mid else 1
            votes.append((u_idx, c, rating))

    return votes, n_users, n_comments


def _make_all_upvote_votes(n_users=20, n_comments=5):
    """All users upvote all comments — tests universal quality intercept."""
    votes = []
    for u in range(n_users):
        for c in range(n_comments):
            votes.append((u, c, 1))
    return votes, n_users, n_comments


# ---------------------------------------------------------------------------
# _fit_mf_model: core math (pure numpy, no mocks)
# ---------------------------------------------------------------------------

class TestFitMfModel:
    """Tests for the SGD fitting function."""

    def _get_fit(self):
        """Import _fit_mf_model with mocked DB/config."""
        mock_config = MagicMock()
        mock_config.MF_LATENT_DIM = 2
        mock_config.MF_LEARNING_RATE = 0.005
        mock_config.MF_LAMBDA_REG = 0.02
        mock_config.MF_LAMBDA_POLIS = 0.1
        mock_config.MF_MAX_EPOCHS = 300
        mock_config.MF_CONVERGENCE_TOL = 1e-5

        with patch(f"{MF}.db", MagicMock()), \
             patch(f"{MF}.config", mock_config):
            from candid.controllers.helpers.matrix_factorization import _fit_mf_model
            return _fit_mf_model

    def test_convergence_on_synthetic_matrix(self):
        """Model converges to low loss on known two-group data."""
        fit = self._get_fit()
        votes, n_users, n_comments = _make_two_group_votes()

        model = fit(votes, n_users, n_comments, polis_coords={})

        assert model["final_loss"] < 0.5
        assert model["epochs"] < 300

    def test_user_factors_recover_group_structure(self):
        """Same-group users have similar factors; cross-group are distant."""
        fit = self._get_fit()
        votes, n_users, n_comments = _make_two_group_votes(n_left=15, n_right=15)

        model = fit(votes, n_users, n_comments, polis_coords={})

        f_u = model["user_factors"]
        # Left group: users 0-14, Right group: users 15-29
        left_center = np.mean(f_u[:15], axis=0)
        right_center = np.mean(f_u[15:], axis=0)

        # Within-group variance should be small relative to between-group distance
        between_dist = np.linalg.norm(left_center - right_center)
        left_var = np.mean([np.linalg.norm(f_u[i] - left_center) for i in range(15)])
        right_var = np.mean([np.linalg.norm(f_u[i] - right_center) for i in range(15, 30)])

        assert between_dist > left_var * 2
        assert between_dist > right_var * 2

    def test_polis_regularization_pulls_factors(self):
        """With Polis regularization, user factors stay closer to PCA coords."""
        fit = self._get_fit()
        votes, n_users, n_comments = _make_two_group_votes(n_left=10, n_right=10)

        # Polis coords: left users at (-1, 0), right users at (1, 0)
        polis_coords = {}
        for i in range(10):
            polis_coords[i] = np.array([-1.0, 0.0])
        for i in range(10, 20):
            polis_coords[i] = np.array([1.0, 0.0])

        # Train with Polis regularization
        cfg_with = {"lambda_polis": 0.5, "max_epochs": 200}
        model_with = fit(votes, n_users, n_comments, polis_coords, cfg=cfg_with)

        # Train without Polis regularization
        cfg_without = {"lambda_polis": 0.0, "max_epochs": 200}
        model_without = fit(votes, n_users, n_comments, polis_coords, cfg=cfg_without)

        # With regularization, user factors should be closer to PCA coords
        f_with = model_with["user_factors"]
        f_without = model_without["user_factors"]

        dist_with = np.mean([np.linalg.norm(f_with[i] - polis_coords[i])
                             for i in range(n_users)])
        dist_without = np.mean([np.linalg.norm(f_without[i] - polis_coords[i])
                                for i in range(n_users)])

        assert dist_with < dist_without

    def test_comment_intercept_captures_quality(self):
        """An all-upvote comment should have higher intercept than a split comment."""
        fit = self._get_fit()

        # 20 users, 3 comments:
        # comment 0: all upvote (universal quality)
        # comment 1: left up, right down (polarizing)
        # comment 2: all downvote
        votes = []
        for u in range(20):
            votes.append((u, 0, 1))   # all upvote comment 0
            votes.append((u, 2, -1))  # all downvote comment 2
            if u < 10:
                votes.append((u, 1, 1))
            else:
                votes.append((u, 1, -1))

        model = fit(votes, 20, 3, polis_coords={})

        i_c = model["comment_intercepts"]
        # Comment 0 (universal quality) > Comment 1 (polarizing) > Comment 2 (universal dislike)
        assert i_c[0] > i_c[1]
        assert i_c[1] > i_c[2]

    def test_global_mean_is_reasonable(self):
        """Global mean should be close to the average rating."""
        fit = self._get_fit()
        votes, n_users, n_comments = _make_all_upvote_votes()

        model = fit(votes, n_users, n_comments, polis_coords={})

        # All upvotes -> mean should be close to 1.0
        assert model["mu"] > 0.5

    def test_convergence_tolerance_triggers_early_stop(self):
        """Model stops before max_epochs if loss converges."""
        fit = self._get_fit()
        votes, n_users, n_comments = _make_two_group_votes(n_left=10, n_right=10, n_comments=6)

        cfg = {"max_epochs": 1000, "convergence_tol": 1e-3}
        model = fit(votes, n_users, n_comments, polis_coords={}, cfg=cfg)

        assert model["epochs"] < 1000

    def test_empty_votes_handling(self):
        """Empty vote list should still complete without errors."""
        fit = self._get_fit()

        # Edge case: 1 user, 1 comment, 1 vote (minimal)
        model = fit([(0, 0, 1)], 1, 1, polis_coords={})
        assert model is not None
        assert "mu" in model

    def test_single_user_degenerate(self):
        """Single user voting on multiple comments."""
        fit = self._get_fit()
        votes = [(0, c, 1 if c % 2 == 0 else -1) for c in range(5)]

        model = fit(votes, 1, 5, polis_coords={})
        assert model is not None
        assert model["user_factors"].shape == (1, 2)

    def test_single_comment_degenerate(self):
        """Multiple users voting on a single comment."""
        fit = self._get_fit()
        votes = [(u, 0, 1 if u < 5 else -1) for u in range(10)]

        model = fit(votes, 10, 1, polis_coords={})
        assert model is not None
        assert model["comment_factors"].shape == (1, 2)


# ---------------------------------------------------------------------------
# get_mf_coords: DB interaction (mocked)
# ---------------------------------------------------------------------------

class TestGetMfCoords:
    def test_returns_tuple_when_db_has_values(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"mf_x": 1.5, "mf_y": -0.3}

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", MagicMock()):
            from candid.controllers.helpers.matrix_factorization import get_mf_coords
            result = get_mf_coords("user1", "conv1")

        assert result == (1.5, -0.3)

    def test_returns_none_when_mf_x_null(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"mf_x": None, "mf_y": None}

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", MagicMock()):
            from candid.controllers.helpers.matrix_factorization import get_mf_coords
            result = get_mf_coords("user1", "conv1")

        assert result is None

    def test_returns_none_when_no_row(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = None

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", MagicMock()):
            from candid.controllers.helpers.matrix_factorization import get_mf_coords
            result = get_mf_coords("user1", "conv1")

        assert result is None


# ---------------------------------------------------------------------------
# get_comment_intercept: DB interaction (mocked)
# ---------------------------------------------------------------------------

class TestGetCommentIntercept:
    def test_returns_float(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"mf_intercept": 0.42}

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", MagicMock()):
            from candid.controllers.helpers.matrix_factorization import get_comment_intercept
            result = get_comment_intercept("comment1")

        assert abs(result - 0.42) < 1e-9

    def test_returns_none_when_null(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"mf_intercept": None}

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", MagicMock()):
            from candid.controllers.helpers.matrix_factorization import get_comment_intercept
            result = get_comment_intercept("comment1")

        assert result is None

    def test_returns_none_when_no_row(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = None

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", MagicMock()):
            from candid.controllers.helpers.matrix_factorization import get_comment_intercept
            result = get_comment_intercept("comment1")

        assert result is None


# ---------------------------------------------------------------------------
# _load_vote_matrix: DB interaction (mocked)
# ---------------------------------------------------------------------------

class TestLoadVoteMatrix:
    def test_returns_correct_sparse_format(self):
        mock_db = MagicMock()
        mock_config = MagicMock()
        mock_config.MF_MIN_VOTERS = 2
        mock_config.MF_MIN_VOTES = 3

        mock_db.execute_query.return_value = [
            {"user_id": "u1", "comment_id": "c1", "rating": 1},
            {"user_id": "u1", "comment_id": "c2", "rating": -1},
            {"user_id": "u2", "comment_id": "c1", "rating": -1},
            {"user_id": "u2", "comment_id": "c2", "rating": 1},
        ]

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", mock_config):
            from candid.controllers.helpers.matrix_factorization import _load_vote_matrix
            result = _load_vote_matrix("conv1")

        assert result is not None
        assert result["n_users"] == 2
        assert result["n_comments"] == 2
        assert len(result["votes"]) == 4

    def test_returns_none_below_min_voters(self):
        mock_db = MagicMock()
        mock_config = MagicMock()
        mock_config.MF_MIN_VOTERS = 20
        mock_config.MF_MIN_VOTES = 50

        mock_db.execute_query.return_value = [
            {"user_id": "u1", "comment_id": "c1", "rating": 1},
        ]

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", mock_config):
            from candid.controllers.helpers.matrix_factorization import _load_vote_matrix
            result = _load_vote_matrix("conv1")

        assert result is None

    def test_returns_none_on_empty_rows(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = None

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", MagicMock()):
            from candid.controllers.helpers.matrix_factorization import _load_vote_matrix
            result = _load_vote_matrix("conv1")

        assert result is None


# ---------------------------------------------------------------------------
# _load_polis_coords: PCA cache + DB interaction (mocked)
# ---------------------------------------------------------------------------

class TestLoadPolisCoords:
    """Tests for _load_polis_coords.

    get_pca_cache is a lazy import inside the function, so we patch it
    on the ideological_coords module where it's defined.
    """

    IC = "candid.controllers.helpers.ideological_coords"

    def test_normalizes_by_max_distance(self):
        """Coords are divided by max_distance from PCA cache."""
        mock_db = MagicMock()
        mock_db.execute_query.return_value = [
            {"user_id": "u1", "x": 5.0, "y": 10.0},
        ]
        pca_cache = {"max_distance": 5.0, "comps": [], "center": []}

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", MagicMock()), \
             patch(f"{self.IC}.get_pca_cache", return_value=pca_cache):
            from candid.controllers.helpers.matrix_factorization import _load_polis_coords
            result = _load_polis_coords({"u1": 0}, "conv1")

        assert 0 in result
        np.testing.assert_allclose(result[0], [1.0, 2.0])

    def test_returns_empty_when_pca_cache_none(self):
        """Returns empty dict if no PCA data available."""
        with patch(f"{MF}.db", MagicMock()), \
             patch(f"{MF}.config", MagicMock()), \
             patch(f"{self.IC}.get_pca_cache", return_value=None):
            from candid.controllers.helpers.matrix_factorization import _load_polis_coords
            result = _load_polis_coords({"u1": 0}, "conv1")

        assert result == {}

    def test_returns_empty_when_no_user_ids(self):
        """Returns empty dict for empty user_id_to_idx."""
        pca_cache = {"max_distance": 5.0}

        with patch(f"{MF}.db", MagicMock()), \
             patch(f"{MF}.config", MagicMock()), \
             patch(f"{self.IC}.get_pca_cache", return_value=pca_cache):
            from candid.controllers.helpers.matrix_factorization import _load_polis_coords
            result = _load_polis_coords({}, "conv1")

        assert result == {}

    def test_returns_empty_when_db_returns_none(self):
        """Returns empty dict if DB query returns no rows."""
        mock_db = MagicMock()
        mock_db.execute_query.return_value = None
        pca_cache = {"max_distance": 5.0}

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", MagicMock()), \
             patch(f"{self.IC}.get_pca_cache", return_value=pca_cache):
            from candid.controllers.helpers.matrix_factorization import _load_polis_coords
            result = _load_polis_coords({"u1": 0}, "conv1")

        assert result == {}

    def test_fallback_max_distance_when_zero(self):
        """Uses 1.0 as max_distance when PCA cache has 0 or None."""
        mock_db = MagicMock()
        mock_db.execute_query.return_value = [
            {"user_id": "u1", "x": 3.0, "y": 4.0},
        ]
        pca_cache = {"max_distance": 0}

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", MagicMock()), \
             patch(f"{self.IC}.get_pca_cache", return_value=pca_cache):
            from candid.controllers.helpers.matrix_factorization import _load_polis_coords
            result = _load_polis_coords({"u1": 0}, "conv1")

        # With max_dist=1.0 fallback, coords are unchanged
        np.testing.assert_allclose(result[0], [3.0, 4.0])

    def test_maps_user_ids_to_indices(self):
        """Only includes users present in user_id_to_idx, mapped correctly."""
        mock_db = MagicMock()
        mock_db.execute_query.return_value = [
            {"user_id": "u1", "x": 1.0, "y": 2.0},
            {"user_id": "u2", "x": 3.0, "y": 4.0},
            {"user_id": "u_unknown", "x": 99.0, "y": 99.0},
        ]
        pca_cache = {"max_distance": 1.0}

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", MagicMock()), \
             patch(f"{self.IC}.get_pca_cache", return_value=pca_cache):
            from candid.controllers.helpers.matrix_factorization import _load_polis_coords
            result = _load_polis_coords({"u1": 0, "u2": 1}, "conv1")

        assert len(result) == 2
        assert 0 in result and 1 in result
        np.testing.assert_allclose(result[0], [1.0, 2.0])
        np.testing.assert_allclose(result[1], [3.0, 4.0])


# ---------------------------------------------------------------------------
# _store_mf_results: DB interaction (mocked)
# ---------------------------------------------------------------------------

class TestStoreMfResults:
    def test_issues_correct_sql(self):
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"location_id": "loc1", "category_id": "cat1"}

        model = {
            "user_factors": np.array([[0.1, 0.2], [0.3, 0.4]]),
            "comment_intercepts": np.array([0.5, -0.3]),
            "final_loss": 0.01,
            "epochs": 50,
        }
        idx_maps = {
            "idx_to_user_id": {0: "u1", 1: "u2"},
            "idx_to_comment_id": {0: "c1", 1: "c2"},
            "n_votes": 100,
            "duration_seconds": 1.5,
        }

        with patch(f"{MF}.db", mock_db), \
             patch(f"{MF}.config", MagicMock()):
            from candid.controllers.helpers.matrix_factorization import _store_mf_results
            _store_mf_results("conv1", model, idx_maps)

        # Should have called execute_query multiple times:
        # 2 user updates + 2 comment updates + 1 bulk vote count + 1 conv lookup + 1 log insert
        calls = mock_db.execute_query.call_args_list
        assert len(calls) >= 5

        # Check user coordinate updates
        user_update_calls = [c for c in calls if "mf_x" in str(c) and "UPDATE user_ideological" in str(c)]
        assert len(user_update_calls) == 2

        # Check comment intercept updates
        comment_update_calls = [c for c in calls if "mf_intercept" in str(c)]
        assert len(comment_update_calls) == 2

        # Check training log insert
        log_calls = [c for c in calls if "mf_training_log" in str(c)]
        assert len(log_calls) == 1
