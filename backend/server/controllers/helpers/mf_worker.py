"""
Matrix Factorization Background Worker

Periodically trains MF models on comment vote matrices for all active
Polis conversations. Runs as a daemon thread with advisory-lock
concurrency control so multiple gunicorn workers don't duplicate training.
"""

import hashlib
import logging
import threading
import time
from typing import Optional

from candid.controllers import db, config
from candid.controllers.helpers.matrix_factorization import run_factorization

logger = logging.getLogger(__name__)


def _advisory_lock_key(conversation_id):
    """Deterministic int64 from conversation_id for pg_try_advisory_lock."""
    h = hashlib.sha256(conversation_id.encode()).digest()
    return int.from_bytes(h[:8], "big", signed=True)


class MFWorker:
    """Background worker for periodic MF training."""

    def __init__(
        self,
        train_interval: int = None,
        min_voters: int = None,
        min_votes: int = None,
    ):
        self.train_interval = train_interval or config.MF_TRAIN_INTERVAL
        self.min_voters = min_voters or config.MF_MIN_VOTERS
        self.min_votes = min_votes or config.MF_MIN_VOTES
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self):
        """Start the background worker thread."""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        print("MF training worker started", flush=True)

    def stop(self):
        """Stop the background worker."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=10)
            self._thread = None
        print("MF training worker stopped", flush=True)

    def _run_loop(self):
        """Main worker loop: initial delay, then train + sleep."""
        # Initial delay to let DB stabilize after startup
        time.sleep(60)

        while self._running:
            try:
                self._train_all_conversations()
            except Exception as e:
                logger.error("MF worker error: %s", e, exc_info=True)

            # Sleep in small increments so stop() is responsive
            for _ in range(self.train_interval):
                if not self._running:
                    return
                time.sleep(1)

    def _train_all_conversations(self):
        """Find active conversations and train MF models."""
        conversations = db.execute_query("""
            SELECT polis_conversation_id, location_id, category_id
            FROM polis_conversation
            WHERE status = 'active'
              AND active_from <= CURRENT_DATE
              AND active_until > CURRENT_DATE
        """)

        if not conversations:
            return

        for conv in conversations:
            if not self._running:
                return
            self._maybe_train(conv["polis_conversation_id"])

    def _maybe_train(self, conversation_id):
        """Train MF for one conversation if new votes exist.

        Uses pg_try_advisory_lock to prevent concurrent training of the
        same conversation across gunicorn workers.
        """
        lock_key = _advisory_lock_key(conversation_id)

        # Try to acquire advisory lock (non-blocking)
        lock_row = db.execute_query(
            "SELECT pg_try_advisory_lock(%s) AS acquired",
            (lock_key,), fetchone=True
        )

        if not lock_row or not lock_row.get("acquired"):
            return  # Another worker is training this conversation

        try:
            # Check if there are new votes since last training
            last_training = db.execute_query("""
                SELECT created_time
                FROM mf_training_log
                WHERE polis_conversation_id = %s
                ORDER BY created_time DESC LIMIT 1
            """, (conversation_id,), fetchone=True)

            newest_vote = db.execute_query("""
                SELECT MAX(cv.created_time) AS latest
                FROM comment_vote cv
                JOIN comment c ON cv.comment_id = c.id
                JOIN post p ON c.post_id = p.id
                JOIN polis_conversation pc ON p.location_id = pc.location_id
                     AND COALESCE(p.category_id::text, '') = COALESCE(pc.category_id::text, '')
                WHERE pc.polis_conversation_id = %s
                  AND pc.status = 'active'
            """, (conversation_id,), fetchone=True)

            if not newest_vote or newest_vote["latest"] is None:
                return

            if last_training and last_training["created_time"] >= newest_vote["latest"]:
                return  # No new votes since last training

            # Train
            run_factorization(conversation_id)

        except Exception as e:
            # Log error to mf_training_log
            conv_row = db.execute_query("""
                SELECT location_id, category_id
                FROM polis_conversation
                WHERE polis_conversation_id = %s
            """, (conversation_id,), fetchone=True)

            location_id = conv_row["location_id"] if conv_row else None
            category_id = conv_row.get("category_id") if conv_row else None

            db.execute_query("""
                INSERT INTO mf_training_log
                    (polis_conversation_id, location_id, category_id,
                     n_users, n_comments, n_votes, error_message)
                VALUES (%s, %s, %s, 0, 0, 0, %s)
            """, (conversation_id, location_id, category_id, str(e)))

            logger.error("MF training failed for %s: %s", conversation_id, e,
                         exc_info=True)

        finally:
            # Release advisory lock
            db.execute_query(
                "SELECT pg_advisory_unlock(%s)",
                (lock_key,)
            )


# ========== Singleton Worker ==========

_worker: Optional[MFWorker] = None


def start_worker():
    """Start the singleton MF training worker."""
    global _worker
    if _worker is None:
        _worker = MFWorker()
    _worker.start()


def stop_worker():
    """Stop the singleton MF training worker."""
    global _worker
    if _worker:
        _worker.stop()
        _worker = None
