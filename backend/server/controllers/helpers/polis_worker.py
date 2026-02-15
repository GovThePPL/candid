"""
Polis Background Worker

Processes the polis_sync_queue table, syncing positions and votes to Polis.
Runs as a background thread with retry logic and exponential backoff.
"""

import json
import threading
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from candid.controllers import db, config
from candid.controllers.helpers.polis_sync import sync_position, sync_vote
from candid.controllers.helpers.polis_client import PolisUnavailableError, PolisAuthError


class PolisWorker:
    """Background worker for processing Polis sync queue."""

    def __init__(
        self,
        poll_interval: int = 5,
        batch_size: int = 10,
        max_retries: int = 3,
        base_backoff: int = 60
    ):
        """
        Initialize the worker.

        Args:
            poll_interval: Seconds between queue checks
            batch_size: Number of items to process per cycle
            max_retries: Maximum retry attempts before marking as failed
            base_backoff: Base seconds for exponential backoff
        """
        self.poll_interval = poll_interval
        self.batch_size = batch_size
        self.max_retries = max_retries
        self.base_backoff = base_backoff

        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self):
        """Start the background worker thread."""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        print("Polis sync worker started", flush=True)

    def stop(self):
        """Stop the background worker."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=10)
            self._thread = None
        print("Polis sync worker stopped", flush=True)

    def _run_loop(self):
        """Main worker loop."""
        while self._running:
            try:
                processed = self.process_batch()
                if processed == 0:
                    # No items to process, sleep longer
                    time.sleep(self.poll_interval)
                else:
                    # Process next batch immediately
                    time.sleep(0.1)
            except Exception as e:
                print(f"Polis worker error: {e}", flush=True)
                time.sleep(self.poll_interval)

    def process_batch(self) -> int:
        """
        Process a batch of pending sync items.

        Returns the number of items processed.
        """
        now = datetime.now(timezone.utc)

        # Atomically claim pending items using FOR UPDATE SKIP LOCKED
        # to prevent multiple gunicorn workers from processing the same items
        items = db.execute_query("""
            UPDATE polis_sync_queue
            SET status = 'processing', updated_time = %s
            WHERE id IN (
                SELECT id FROM polis_sync_queue
                WHERE status IN ('pending', 'partial')
                  AND next_retry_time <= %s
                ORDER BY created_time ASC
                LIMIT %s
                FOR UPDATE SKIP LOCKED
            )
            RETURNING id, operation_type, payload, retry_count
        """, (now, now, self.batch_size))

        if not items:
            return 0

        processed = 0

        for item in items:
            item_id = str(item["id"])

            try:
                payload = item["payload"]
                if isinstance(payload, str):
                    payload = json.loads(payload)

                if item["operation_type"] == "position":
                    success, error = sync_position(payload)
                elif item["operation_type"] == "vote":
                    success, error = sync_vote(payload)
                else:
                    success, error = False, f"Unknown operation: {item['operation_type']}"

                if success:
                    if error:  # Partial success
                        self._mark_completed(item_id, error)
                    else:
                        self._mark_completed(item_id)
                else:
                    self._handle_failure(item, error)

                processed += 1

            except PolisUnavailableError as e:
                # Polis is down, retry with backoff
                self._handle_failure(item, str(e), polis_down=True)
                processed += 1

            except PolisAuthError as e:
                # Authentication failed - retry with longer backoff
                # This could be temporary (token expired) or permanent (wrong credentials)
                print(f"Polis auth error for {item_id}: {e}", flush=True)
                self._handle_failure(item, str(e), polis_down=True)  # Use longer backoff
                processed += 1

            except Exception as e:
                # Unexpected error
                print(f"Sync error for {item_id}: {e}", flush=True)
                self._handle_failure(item, str(e))
                processed += 1

        return processed

    def _mark_completed(self, item_id: str, message: Optional[str] = None):
        """Mark an item as successfully completed."""
        db.execute_query("""
            UPDATE polis_sync_queue
            SET status = 'completed',
                error_message = %s,
                updated_time = %s
            WHERE id = %s
        """, (message, datetime.now(timezone.utc), item_id))

    def _handle_failure(
        self,
        item: dict,
        error: str,
        polis_down: bool = False
    ):
        """Handle a failed sync attempt."""
        item_id = str(item["id"])
        retry_count = item["retry_count"] + 1
        now = datetime.now(timezone.utc)

        if retry_count >= self.max_retries:
            # Max retries exceeded, mark as failed
            db.execute_query("""
                UPDATE polis_sync_queue
                SET status = 'failed',
                    retry_count = %s,
                    error_message = %s,
                    updated_time = %s
                WHERE id = %s
            """, (retry_count, error, now, item_id))
            print(f"Sync permanently failed for {item_id}: {error}", flush=True)

        else:
            # Calculate next retry time with exponential backoff
            backoff_seconds = self.base_backoff * (2 ** (retry_count - 1))

            # If Polis is down, use longer backoff
            if polis_down:
                backoff_seconds = max(backoff_seconds, 300)  # At least 5 minutes

            next_retry = now + timedelta(seconds=backoff_seconds)

            db.execute_query("""
                UPDATE polis_sync_queue
                SET status = 'pending',
                    retry_count = %s,
                    next_retry_time = %s,
                    error_message = %s,
                    updated_time = %s
                WHERE id = %s
            """, (retry_count, next_retry, error, now, item_id))

            print(
                f"Sync retry {retry_count}/{self.max_retries} for {item_id}, "
                f"next attempt at {next_retry}",
                flush=True
            )


# ========== Queue Status Functions ==========

def get_queue_stats() -> dict:
    """Get statistics about the sync queue."""
    stats = db.execute_query("""
        SELECT
            status,
            COUNT(*) as count
        FROM polis_sync_queue
        GROUP BY status
    """)

    result = {
        "pending": 0,
        "processing": 0,
        "completed": 0,
        "failed": 0,
        "partial": 0,
    }

    for row in (stats or []):
        result[row["status"]] = row["count"]

    result["total"] = sum(result.values())
    return result


def get_failed_items(limit: int = 20) -> list:
    """Get recently failed sync items for monitoring."""
    items = db.execute_query("""
        SELECT id, operation_type, payload, error_message, retry_count, created_time, updated_time
        FROM polis_sync_queue
        WHERE status = 'failed'
        ORDER BY updated_time DESC
        LIMIT %s
    """, (limit,))

    return items or []


def retry_failed_items() -> int:
    """Reset failed items to pending for retry. Returns count reset."""
    result = db.execute_query("""
        UPDATE polis_sync_queue
        SET status = 'pending',
            retry_count = 0,
            next_retry_time = CURRENT_TIMESTAMP,
            error_message = NULL,
            updated_time = CURRENT_TIMESTAMP
        WHERE status = 'failed'
    """)

    # Get count of affected rows
    count = db.execute_query("""
        SELECT COUNT(*) as count FROM polis_sync_queue WHERE status = 'pending' AND retry_count = 0
    """, fetchone=True)

    return count["count"] if count else 0


def cleanup_old_completed(days: int = 7) -> int:
    """Remove completed items older than N days. Returns count deleted."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    db.execute_query("""
        DELETE FROM polis_sync_queue
        WHERE status = 'completed'
          AND updated_time < %s
    """, (cutoff,))

    return 0  # Can't easily get delete count with current db helper


# ========== Singleton Worker ==========

_worker: Optional[PolisWorker] = None


def get_worker() -> PolisWorker:
    """Get or create the singleton worker instance."""
    global _worker
    if _worker is None:
        _worker = PolisWorker()
    return _worker


def start_worker():
    """Start the singleton worker."""
    if config.POLIS_ENABLED:
        get_worker().start()


def stop_worker():
    """Stop the singleton worker."""
    global _worker
    if _worker:
        _worker.stop()
        _worker = None
