"""Unit tests for bridging award detection in matrix_factorization.py."""

import math
import pytest
from unittest.mock import patch, MagicMock, call
import numpy as np

pytestmark = pytest.mark.unit


def _make_model(item_intercepts):
    """Build a minimal model dict with given item intercepts."""
    return {
        "mu": 0.0,
        "user_intercepts": np.zeros(1),
        "item_intercepts": np.array(item_intercepts, dtype=np.float64),
        "user_factors": np.zeros((1, 2)),
        "item_factors": np.zeros((len(item_intercepts), 2)),
        "final_loss": 0.01,
        "epochs": 10,
    }


def _make_idx_maps(item_ids):
    """Build idx_maps with given prefixed item IDs."""
    return {
        "idx_to_user_id": {0: "user-1"},
        "idx_to_item_id": {i: iid for i, iid in enumerate(item_ids)},
        "n_votes": 100,
        "duration_seconds": 1.0,
    }


class TestCheckBridgingAwards:
    """Test _check_bridging_awards detects threshold crossings correctly."""

    @patch("candid.controllers.helpers.matrix_factorization.db")
    @patch("candid.controllers.helpers.matrix_factorization.config")
    def test_awards_comment_above_threshold(self, mock_config, mock_db):
        mock_config.SCORING_BRIDGING_BASE = 0.40
        mock_config.SCORING_BRIDGING_MARGIN = 0.45

        # Comment with intercept 0.6, 100 votes -> threshold = 0.40 + 0.45/10 = 0.445
        model = _make_model([0.6])
        idx_maps = _make_idx_maps(["c:comment-1"])

        # Sequence of db calls:
        # 1. vote count
        # 2. existing award check
        # 3. author lookup
        # 4. thread title lookup
        # 5. insert award
        mock_db.execute_query = MagicMock(side_effect=[
            {"cnt": 100},              # vote count
            None,                       # no existing award
            {"creator_user_id": "author-1", "body": "Great point", "post_id": "post-1"},
            {"title": "Test Thread"},   # thread title
            None,                       # insert
        ])

        with patch("candid.controllers.helpers.push_notifications.send_or_queue_notification") as mock_notify:
            from candid.controllers.helpers.matrix_factorization import _check_bridging_awards
            _check_bridging_awards("conv-1", model, idx_maps)

            mock_notify.assert_called_once()
            call_kwargs = mock_notify.call_args
            assert call_kwargs[1]["notification_type"] == "bridging_kudos"
            assert call_kwargs[1]["recipient_user_id"] == "author-1"
            assert "bridging" in call_kwargs[1]["title"].lower()
            # Verify deep link data navigates to the comment
            data = call_kwargs[1]["data"]
            assert data["action"] == "open_post"
            assert data["postId"] == "post-1"
            assert data["commentId"] == "comment-1"

    @patch("candid.controllers.helpers.matrix_factorization.db")
    @patch("candid.controllers.helpers.matrix_factorization.config")
    def test_skips_below_threshold(self, mock_config, mock_db):
        mock_config.SCORING_BRIDGING_BASE = 0.40
        mock_config.SCORING_BRIDGING_MARGIN = 0.45

        # Comment with intercept 0.3, 100 votes -> threshold = 0.445, 0.3 < 0.445
        model = _make_model([0.3])
        idx_maps = _make_idx_maps(["c:comment-1"])

        mock_db.execute_query = MagicMock(return_value={"cnt": 100})

        with patch("candid.controllers.helpers.push_notifications.send_or_queue_notification") as mock_notify:
            from candid.controllers.helpers.matrix_factorization import _check_bridging_awards
            _check_bridging_awards("conv-1", model, idx_maps)

            mock_notify.assert_not_called()

    @patch("candid.controllers.helpers.matrix_factorization.db")
    @patch("candid.controllers.helpers.matrix_factorization.config")
    def test_skips_already_awarded(self, mock_config, mock_db):
        mock_config.SCORING_BRIDGING_BASE = 0.40
        mock_config.SCORING_BRIDGING_MARGIN = 0.45

        model = _make_model([0.6])
        idx_maps = _make_idx_maps(["c:comment-1"])

        mock_db.execute_query = MagicMock(side_effect=[
            {"cnt": 100},              # vote count
            {"1": 1},                  # existing award found
        ])

        with patch("candid.controllers.helpers.push_notifications.send_or_queue_notification") as mock_notify:
            from candid.controllers.helpers.matrix_factorization import _check_bridging_awards
            _check_bridging_awards("conv-1", model, idx_maps)

            mock_notify.assert_not_called()

    @patch("candid.controllers.helpers.matrix_factorization.db")
    @patch("candid.controllers.helpers.matrix_factorization.config")
    def test_vote_adjusted_threshold(self, mock_config, mock_db):
        """With few votes, threshold is higher so marginal items don't qualify."""
        mock_config.SCORING_BRIDGING_BASE = 0.40
        mock_config.SCORING_BRIDGING_MARGIN = 0.45

        # intercept = 0.55, 4 votes -> threshold = 0.40 + 0.45/2 = 0.625
        # 0.55 < 0.625, should not qualify
        model = _make_model([0.55])
        idx_maps = _make_idx_maps(["c:comment-1"])

        mock_db.execute_query = MagicMock(return_value={"cnt": 4})

        with patch("candid.controllers.helpers.push_notifications.send_or_queue_notification") as mock_notify:
            from candid.controllers.helpers.matrix_factorization import _check_bridging_awards
            _check_bridging_awards("conv-1", model, idx_maps)

            mock_notify.assert_not_called()

    @patch("candid.controllers.helpers.matrix_factorization.db")
    @patch("candid.controllers.helpers.matrix_factorization.config")
    def test_awards_post_above_threshold(self, mock_config, mock_db):
        mock_config.SCORING_BRIDGING_BASE = 0.40
        mock_config.SCORING_BRIDGING_MARGIN = 0.45

        model = _make_model([0.7])
        idx_maps = _make_idx_maps(["p:post-1"])

        mock_db.execute_query = MagicMock(side_effect=[
            {"cnt": 50},               # vote count
            None,                       # no existing award
            {"creator_user_id": "author-2", "body": "My post", "title": "Post Title"},
            None,                       # insert
        ])

        with patch("candid.controllers.helpers.push_notifications.send_or_queue_notification") as mock_notify:
            from candid.controllers.helpers.matrix_factorization import _check_bridging_awards
            _check_bridging_awards("conv-1", model, idx_maps)

            mock_notify.assert_called_once()
            assert "post" in mock_notify.call_args[1]["title"].lower()
            # Verify deep link data navigates to the post
            data = mock_notify.call_args[1]["data"]
            assert data["action"] == "open_post"
            assert data["postId"] == "post-1"
            assert "commentId" not in data

    @patch("candid.controllers.helpers.matrix_factorization.db")
    @patch("candid.controllers.helpers.matrix_factorization.config")
    def test_skips_items_with_no_votes(self, mock_config, mock_db):
        mock_config.SCORING_BRIDGING_BASE = 0.40
        mock_config.SCORING_BRIDGING_MARGIN = 0.45

        model = _make_model([0.9])
        idx_maps = _make_idx_maps(["c:comment-1"])

        mock_db.execute_query = MagicMock(return_value={"cnt": 0})

        with patch("candid.controllers.helpers.push_notifications.send_or_queue_notification") as mock_notify:
            from candid.controllers.helpers.matrix_factorization import _check_bridging_awards
            _check_bridging_awards("conv-1", model, idx_maps)

            mock_notify.assert_not_called()
