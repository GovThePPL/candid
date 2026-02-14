"""Unit tests for mf_worker.py — worker lifecycle and concurrency."""

import threading
from unittest.mock import patch, MagicMock, PropertyMock

import pytest

pytestmark = pytest.mark.unit

WORKER = "candid.controllers.helpers.mf_worker"


def _make_worker():
    """Create an MFWorker with mocked dependencies."""
    mock_config = MagicMock()
    mock_config.MF_TRAIN_INTERVAL = 60
    mock_config.MF_MIN_VOTERS = 20
    mock_config.MF_MIN_VOTES = 50

    with patch(f"{WORKER}.db", MagicMock()), \
         patch(f"{WORKER}.config", mock_config):
        from candid.controllers.helpers.mf_worker import MFWorker
        return MFWorker(train_interval=1, min_voters=2, min_votes=3)


class TestMFWorkerConstructor:
    def test_defaults(self):
        worker = _make_worker()
        assert worker.train_interval == 1
        assert worker.min_voters == 2
        assert worker.min_votes == 3
        assert worker._running is False
        assert worker._thread is None


class TestMFWorkerStart:
    def test_start_creates_thread(self):
        worker = _make_worker()
        # Don't actually run the loop
        with patch.object(worker, '_run_loop'):
            worker.start()
            assert worker._running is True
            assert worker._thread is not None
            assert worker._thread.daemon is True
            worker.stop()

    def test_double_start_is_idempotent(self):
        worker = _make_worker()
        with patch.object(worker, '_run_loop'):
            worker.start()
            first_thread = worker._thread
            worker.start()
            assert worker._thread is first_thread
            worker.stop()


class TestMFWorkerStop:
    def test_stop_joins_thread(self):
        worker = _make_worker()
        with patch.object(worker, '_run_loop'):
            worker.start()
            assert worker._thread is not None
            worker.stop()
            assert worker._running is False
            assert worker._thread is None

    def test_stop_when_not_started(self):
        worker = _make_worker()
        # Should not raise
        worker.stop()
        assert worker._running is False


class TestMFWorkerMaybeTrain:
    def test_advisory_lock_prevents_concurrent_training(self):
        """When advisory lock is not acquired, training is skipped."""
        mock_db = MagicMock()
        mock_db.execute_query.return_value = {"acquired": False}

        mock_config = MagicMock()
        mock_config.MF_TRAIN_INTERVAL = 60
        mock_config.MF_MIN_VOTERS = 20
        mock_config.MF_MIN_VOTES = 50

        with patch(f"{WORKER}.db", mock_db), \
             patch(f"{WORKER}.config", mock_config), \
             patch(f"{WORKER}.run_factorization") as mock_train:
            from candid.controllers.helpers.mf_worker import MFWorker
            worker = MFWorker()
            worker._maybe_train("conv1")

        mock_train.assert_not_called()

    def test_skips_when_no_new_votes(self):
        """When last training is newer than newest vote, skip."""
        from datetime import datetime, timezone

        last_time = datetime(2026, 2, 12, 10, 0, 0, tzinfo=timezone.utc)
        vote_time = datetime(2026, 2, 12, 9, 0, 0, tzinfo=timezone.utc)

        mock_db = MagicMock()
        call_count = [0]

        def db_side_effect(sql, params=None, fetchone=False, **kw):
            call_count[0] += 1
            if "pg_try_advisory_lock" in sql:
                return {"acquired": True}
            if "mf_training_log" in sql and "ORDER BY" in sql:
                return {"created_time": last_time}
            if "MAX(latest)" in sql:
                return {"latest": vote_time}
            if "pg_advisory_unlock" in sql:
                return None
            return None

        mock_db.execute_query.side_effect = db_side_effect

        mock_config = MagicMock()
        mock_config.MF_TRAIN_INTERVAL = 60
        mock_config.MF_MIN_VOTERS = 20
        mock_config.MF_MIN_VOTES = 50

        with patch(f"{WORKER}.db", mock_db), \
             patch(f"{WORKER}.config", mock_config), \
             patch(f"{WORKER}.run_factorization") as mock_train:
            from candid.controllers.helpers.mf_worker import MFWorker
            worker = MFWorker()
            worker._maybe_train("conv1")

        mock_train.assert_not_called()

    def test_trains_when_new_votes_exist(self):
        """When newest vote is after last training, run training."""
        from datetime import datetime, timezone

        last_time = datetime(2026, 2, 12, 9, 0, 0, tzinfo=timezone.utc)
        vote_time = datetime(2026, 2, 12, 10, 0, 0, tzinfo=timezone.utc)

        mock_db = MagicMock()

        def db_side_effect(sql, params=None, fetchone=False, **kw):
            if "pg_try_advisory_lock" in sql:
                return {"acquired": True}
            if "mf_training_log" in sql and "ORDER BY" in sql:
                return {"created_time": last_time}
            if "MAX(latest)" in sql:
                return {"latest": vote_time}
            if "pg_advisory_unlock" in sql:
                return None
            return None

        mock_db.execute_query.side_effect = db_side_effect

        mock_config = MagicMock()
        mock_config.MF_TRAIN_INTERVAL = 60
        mock_config.MF_MIN_VOTERS = 20
        mock_config.MF_MIN_VOTES = 50

        with patch(f"{WORKER}.db", mock_db), \
             patch(f"{WORKER}.config", mock_config), \
             patch(f"{WORKER}.run_factorization") as mock_train:
            from candid.controllers.helpers.mf_worker import MFWorker
            worker = MFWorker()
            worker._maybe_train("conv1")

        mock_train.assert_called_once_with("conv1")
