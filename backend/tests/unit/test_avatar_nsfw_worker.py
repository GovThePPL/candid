"""Unit tests for avatar_nsfw_worker.py — deferred avatar NSFW checking."""

import pytest
from unittest.mock import patch, MagicMock, call

pytestmark = pytest.mark.unit


class TestAvatarNsfwWorkerProcessOne:
    """Tests for the _process_one method of AvatarNsfwWorker."""

    @patch("candid.controllers.helpers.avatar_nsfw_worker.send_or_queue_notification")
    @patch("candid.controllers.helpers.avatar_nsfw_worker.nlp")
    @patch("candid.controllers.helpers.avatar_nsfw_worker.db")
    def test_safe_image_no_action(self, mock_db, mock_nlp, mock_notify):
        """Safe images are dequeued with no further action."""
        mock_db.execute_query.return_value = {
            "id": "queue-id-1",
            "user_id": "user-id-1",
            "image_base64": "safe_image_data",
        }
        mock_nlp.check_nsfw.return_value = {"is_safe": True, "nsfw_score": 0.05}

        from candid.controllers.helpers.avatar_nsfw_worker import AvatarNsfwWorker
        worker = AvatarNsfwWorker()
        worker._process_one()

        # Should dequeue
        mock_db.execute_query.assert_called_once()
        # Should check NSFW
        mock_nlp.check_nsfw.assert_called_once_with("safe_image_data")
        # Should NOT remove avatar or notify
        mock_notify.assert_not_called()

    @patch("candid.controllers.helpers.avatar_nsfw_worker.send_or_queue_notification")
    @patch("candid.controllers.helpers.avatar_nsfw_worker.nlp")
    @patch("candid.controllers.helpers.avatar_nsfw_worker.db")
    def test_nsfw_image_removes_avatar_and_notifies(self, mock_db, mock_nlp, mock_notify):
        """NSFW images trigger avatar removal and notification."""
        # First call: dequeue; Second call: UPDATE users SET avatar_url = NULL
        mock_db.execute_query.side_effect = [
            {
                "id": "queue-id-1",
                "user_id": "user-id-1",
                "image_base64": "nsfw_image_data",
            },
            None,  # UPDATE result
        ]
        mock_nlp.check_nsfw.return_value = {"is_safe": False, "nsfw_score": 0.85}

        from candid.controllers.helpers.avatar_nsfw_worker import AvatarNsfwWorker
        worker = AvatarNsfwWorker()
        worker._process_one()

        # Should NULL out avatar
        update_call = mock_db.execute_query.call_args_list[1]
        assert "avatar_url = NULL" in update_call[0][0]
        assert "avatar_icon_url = NULL" in update_call[0][0]

        # Should send notification
        mock_notify.assert_called_once()
        notify_kwargs = mock_notify.call_args
        assert notify_kwargs[1]["notification_type"] == "avatar_rejected"
        assert notify_kwargs[1]["recipient_user_id"] == "user-id-1"

    @patch("candid.controllers.helpers.avatar_nsfw_worker.send_or_queue_notification")
    @patch("candid.controllers.helpers.avatar_nsfw_worker.nlp")
    @patch("candid.controllers.helpers.avatar_nsfw_worker.db")
    def test_empty_queue_does_nothing(self, mock_db, mock_nlp, mock_notify):
        """No-op when the queue is empty."""
        mock_db.execute_query.return_value = None

        from candid.controllers.helpers.avatar_nsfw_worker import AvatarNsfwWorker
        worker = AvatarNsfwWorker()
        worker._process_one()

        mock_nlp.check_nsfw.assert_not_called()
        mock_notify.assert_not_called()

    @patch("candid.controllers.helpers.avatar_nsfw_worker.send_or_queue_notification")
    @patch("candid.controllers.helpers.avatar_nsfw_worker.nlp")
    @patch("candid.controllers.helpers.avatar_nsfw_worker.db")
    def test_nlp_error_swallowed(self, mock_db, mock_nlp, mock_notify):
        """NLP service errors are logged but don't crash the worker."""
        mock_db.execute_query.return_value = {
            "id": "queue-id-1",
            "user_id": "user-id-1",
            "image_base64": "some_data",
        }
        from candid.controllers.helpers.nlp import NLPServiceError
        mock_nlp.check_nsfw.side_effect = NLPServiceError("service down")
        mock_nlp.NLPServiceError = NLPServiceError

        from candid.controllers.helpers.avatar_nsfw_worker import AvatarNsfwWorker
        worker = AvatarNsfwWorker()
        # Should not raise
        worker._process_one()

        mock_notify.assert_not_called()
