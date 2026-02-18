"""
Approval Reminder Background Worker

Periodically checks for pending role/rule change requests approaching their
auto-approve deadline (within 24 hours) and sends reminder notifications to
approval peers. Runs as a daemon thread.
"""

import json
import logging
import threading
import time
from typing import Optional

from candid.controllers import db, config
from candid.controllers.helpers.admin import (
    find_approval_peer,
    find_rule_approval_peer,
    send_auto_approve_reminder,
)

logger = logging.getLogger(__name__)


class ApprovalReminderWorker:
    """Background worker for sending auto-approve reminder notifications."""

    def __init__(self, check_interval: int = None):
        self.check_interval = check_interval or config.APPROVAL_REMINDER_INTERVAL
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self):
        """Start the background worker thread."""
        if self._running:
            return

        self._running = True
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        print("Approval reminder worker started", flush=True)

    def stop(self):
        """Stop the background worker."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=10)
            self._thread = None
        print("Approval reminder worker stopped", flush=True)

    def _run_loop(self):
        """Main worker loop: initial delay, then check + sleep."""
        # Initial delay to let DB stabilize after startup
        time.sleep(120)

        while self._running:
            try:
                self._check_and_send_reminders()
            except Exception as e:
                logger.error("Approval reminder worker error: %s", e,
                             exc_info=True)

            # Sleep in small increments so stop() is responsive
            for _ in range(self.check_interval):
                if not self._running:
                    return
                time.sleep(1)

    def _check_and_send_reminders(self):
        """Check both request tables for upcoming auto-approvals."""
        self._check_role_requests()
        self._check_rule_requests()

    def _check_role_requests(self):
        """Send reminders for role change requests within 24h of auto-approve."""
        rows = db.execute_query("""
            SELECT * FROM role_change_request
            WHERE status = 'pending'
              AND auto_approve_at <= CURRENT_TIMESTAMP + INTERVAL '24 hours'
              AND auto_approve_at > CURRENT_TIMESTAMP
              AND reminder_sent_at IS NULL
        """)

        for row in (rows or []):
            peers = find_approval_peer(row)
            if not peers:
                continue

            loc = db.execute_query(
                "SELECT name FROM location WHERE id = %s",
                (str(row['location_id']),), fetchone=True
            ) if row.get('location_id') else None
            loc_name = loc['name'] if loc else 'Unknown'
            desc = f"{row['action']} {row['role']} at {loc_name}"

            send_auto_approve_reminder(
                peers, desc, 'role_change',
                requester_user_id=str(row['requested_by']))

            db.execute_query("""
                UPDATE role_change_request
                SET reminder_sent_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (str(row['id']),))

    def _check_rule_requests(self):
        """Send reminders for rule change requests within 24h of auto-approve."""
        rows = db.execute_query("""
            SELECT * FROM rule_change_request
            WHERE status = 'pending'
              AND auto_approve_at <= CURRENT_TIMESTAMP + INTERVAL '24 hours'
              AND auto_approve_at > CURRENT_TIMESTAMP
              AND reminder_sent_at IS NULL
        """)

        for row in (rows or []):
            peers = find_rule_approval_peer(row)
            if not peers:
                continue

            proposed = row.get('proposed_rule') or {}
            if isinstance(proposed, str):
                proposed = json.loads(proposed)
            desc = proposed.get('title', 'Rule change')

            send_auto_approve_reminder(
                peers, desc, 'rule_change',
                requester_user_id=str(row['requested_by']))

            db.execute_query("""
                UPDATE rule_change_request
                SET reminder_sent_at = CURRENT_TIMESTAMP
                WHERE id = %s
            """, (str(row['id']),))


# ========== Singleton Worker ==========

_worker: Optional[ApprovalReminderWorker] = None


def start_worker():
    """Start the singleton approval reminder worker."""
    global _worker
    if _worker is None:
        _worker = ApprovalReminderWorker()
    _worker.start()


def stop_worker():
    """Stop the singleton approval reminder worker."""
    global _worker
    if _worker:
        _worker.stop()
        _worker = None
