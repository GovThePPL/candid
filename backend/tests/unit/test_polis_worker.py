"""Unit tests for polis_worker.py — background worker logic."""

import json
import pytest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta

pytestmark = pytest.mark.unit


# ---------------------------------------------------------------------------
# PolisWorker construction
# ---------------------------------------------------------------------------

class TestPolisWorkerInit:
    def test_default_values(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        w = PolisWorker()
        assert w.poll_interval == 5
        assert w.batch_size == 10
        assert w.max_retries == 3
        assert w.base_backoff == 60

    def test_custom_values(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        w = PolisWorker(poll_interval=10, batch_size=5, max_retries=5, base_backoff=120)
        assert w.poll_interval == 10
        assert w.batch_size == 5
        assert w.max_retries == 5
        assert w.base_backoff == 120


# ---------------------------------------------------------------------------
# Exponential backoff
# ---------------------------------------------------------------------------

class TestExponentialBackoff:
    def test_backoff_formula(self):
        """backoff = base * 2^(retry-1)"""
        from candid.controllers.helpers.polis_worker import PolisWorker
        w = PolisWorker(base_backoff=60)
        # retry_count starts at 0, incremented to 1 on first failure
        # backoff = 60 * 2^(1-1) = 60
        assert 60 * (2 ** 0) == 60
        # Second retry: 60 * 2^1 = 120
        assert 60 * (2 ** 1) == 120
        # Third retry: 60 * 2^2 = 240
        assert 60 * (2 ** 2) == 240

    def test_handle_failure_retries(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        mock_db = MagicMock()

        with patch("candid.controllers.helpers.polis_worker.db", mock_db):
            w = PolisWorker(base_backoff=60, max_retries=3)
            item = {"id": "item-1", "retry_count": 0}
            w._handle_failure(item, "test error")

            call = mock_db.execute_query.call_args
            args = call[0][1]
            assert args[0] == 1  # retry_count incremented
            # next_retry_time should be in the future
            assert args[1] > datetime.now(timezone.utc) - timedelta(seconds=1)

    def test_max_retries_marks_failed(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        mock_db = MagicMock()

        with patch("candid.controllers.helpers.polis_worker.db", mock_db):
            w = PolisWorker(max_retries=3)
            item = {"id": "item-1", "retry_count": 2}  # Will become 3 = max
            w._handle_failure(item, "final error")

            call = mock_db.execute_query.call_args
            sql = call[0][0]
            assert "failed" in sql

    def test_polis_down_uses_longer_backoff(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        mock_db = MagicMock()

        with patch("candid.controllers.helpers.polis_worker.db", mock_db):
            w = PolisWorker(base_backoff=60, max_retries=3)
            item = {"id": "item-1", "retry_count": 0}
            w._handle_failure(item, "polis down", polis_down=True)

            call = mock_db.execute_query.call_args
            next_retry = call[0][1][1]
            # polis_down guarantees at least 300s (5 min) backoff
            now = datetime.now(timezone.utc)
            assert (next_retry - now).total_seconds() >= 299


# ---------------------------------------------------------------------------
# process_batch
# ---------------------------------------------------------------------------

class TestProcessBatch:
    def test_no_items_returns_zero(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_worker.db", mock_db):
            w = PolisWorker()
            assert w.process_batch() == 0

    def test_processes_position_item(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        mock_db = MagicMock()

        payload = json.dumps({
            "position_id": "pos-1", "statement": "test",
            "category_id": "cat-1", "location_id": "loc-1",
            "creator_user_id": "user-1",
        })

        # First call: get pending items. Second+: status updates
        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": "q-1", "operation_type": "position", "payload": payload, "retry_count": 0}],
            None,  # mark processing
            None,  # mark completed
        ])

        with patch("candid.controllers.helpers.polis_worker.db", mock_db), \
             patch("candid.controllers.helpers.polis_worker.sync_position", return_value=(True, None)):
            w = PolisWorker()
            processed = w.process_batch()
            assert processed == 1

    def test_processes_vote_item(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        mock_db = MagicMock()

        payload = json.dumps({
            "position_id": "pos-1", "user_id": "user-1",
            "response": "agree", "polis_vote": -1,
        })

        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": "q-2", "operation_type": "vote", "payload": payload, "retry_count": 0}],
            None,  # mark processing
            None,  # mark completed
        ])

        with patch("candid.controllers.helpers.polis_worker.db", mock_db), \
             patch("candid.controllers.helpers.polis_worker.sync_vote", return_value=(True, None)):
            w = PolisWorker()
            processed = w.process_batch()
            assert processed == 1

    def test_handles_polis_unavailable(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        from candid.controllers.helpers.polis_client import PolisUnavailableError
        mock_db = MagicMock()

        payload = json.dumps({"position_id": "pos-1", "statement": "test",
                               "category_id": "cat-1", "location_id": "loc-1",
                               "creator_user_id": "user-1"})

        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": "q-3", "operation_type": "position", "payload": payload, "retry_count": 0}],
            None,  # mark processing
            None,  # handle_failure update
        ])

        with patch("candid.controllers.helpers.polis_worker.db", mock_db), \
             patch("candid.controllers.helpers.polis_worker.sync_position",
                   side_effect=PolisUnavailableError("down")):
            w = PolisWorker()
            processed = w.process_batch()
            assert processed == 1


# ---------------------------------------------------------------------------
# Status transitions
# ---------------------------------------------------------------------------

class TestStatusTransitions:
    def test_pending_to_processing(self):
        """Items should be marked 'processing' before being worked on."""
        from candid.controllers.helpers.polis_worker import PolisWorker
        mock_db = MagicMock()

        payload = json.dumps({"position_id": "pos-1", "statement": "t",
                               "category_id": "c", "location_id": "l",
                               "creator_user_id": "u"})

        mock_db.execute_query = MagicMock(side_effect=[
            [{"id": "q-1", "operation_type": "position", "payload": payload, "retry_count": 0}],
            None,  # mark processing
            None,  # mark completed
        ])

        with patch("candid.controllers.helpers.polis_worker.db", mock_db), \
             patch("candid.controllers.helpers.polis_worker.sync_position", return_value=(True, None)):
            w = PolisWorker()
            w.process_batch()

            # Second call should be the "processing" update
            second_call_sql = mock_db.execute_query.call_args_list[1][0][0]
            assert "processing" in second_call_sql

    def test_success_to_completed(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        mock_db = MagicMock()

        with patch("candid.controllers.helpers.polis_worker.db", mock_db):
            w = PolisWorker()
            w._mark_completed("item-1")

            call_sql = mock_db.execute_query.call_args[0][0]
            assert "completed" in call_sql


# ---------------------------------------------------------------------------
# get_queue_stats
# ---------------------------------------------------------------------------

class TestGetQueueStats:
    def test_aggregation(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=[
            {"status": "pending", "count": 5},
            {"status": "completed", "count": 20},
            {"status": "failed", "count": 2},
        ])

        with patch("candid.controllers.helpers.polis_worker.db", mock_db):
            from candid.controllers.helpers.polis_worker import get_queue_stats
            stats = get_queue_stats()
            assert stats["pending"] == 5
            assert stats["completed"] == 20
            assert stats["failed"] == 2
            assert stats["total"] == 27

    def test_empty_queue(self):
        mock_db = MagicMock()
        mock_db.execute_query = MagicMock(return_value=None)

        with patch("candid.controllers.helpers.polis_worker.db", mock_db):
            from candid.controllers.helpers.polis_worker import get_queue_stats
            stats = get_queue_stats()
            assert stats["total"] == 0


# ---------------------------------------------------------------------------
# Worker start/stop
# ---------------------------------------------------------------------------

class TestWorkerLifecycle:
    def test_start_creates_thread(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        w = PolisWorker()
        with patch("candid.controllers.helpers.polis_worker.threading") as mock_threading:
            mock_thread = MagicMock()
            mock_threading.Thread.return_value = mock_thread
            w.start()
            assert w._running is True
            mock_thread.start.assert_called_once()
            w._running = False  # Prevent actual thread issues

    def test_double_start_is_noop(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        w = PolisWorker()
        w._running = True
        with patch("candid.controllers.helpers.polis_worker.threading") as mock_threading:
            w.start()
            mock_threading.Thread.assert_not_called()

    def test_stop(self):
        from candid.controllers.helpers.polis_worker import PolisWorker
        w = PolisWorker()
        w._running = True
        mock_thread = MagicMock()
        w._thread = mock_thread
        w.stop()
        assert w._running is False
        mock_thread.join.assert_called_once()
        assert w._thread is None  # stop sets it to None
