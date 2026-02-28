"""
Avatar NSFW Background Worker

Polls the avatar_nsfw_queue table for pending NSFW checks.
If an avatar is flagged as NSFW, it NULLs out the user's avatar
and sends an avatar_rejected notification.
"""

import logging
import threading
from typing import Optional

from candid.controllers import db, config
from candid.controllers.helpers import nlp
from candid.controllers.helpers.push_notifications import send_or_queue_notification

logger = logging.getLogger(__name__)


class AvatarNsfwWorker:
    """Background worker for deferred avatar NSFW checking."""

    def __init__(self, poll_interval: int = None):
        self.poll_interval = poll_interval or config.AVATAR_NSFW_POLL_INTERVAL
        self._running = False
        self._stop_event = threading.Event()
        self._thread: Optional[threading.Thread] = None

    def start(self):
        """Start the background worker thread."""
        if self._running:
            return

        self._running = True
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()
        print("Avatar NSFW worker started", flush=True)

    def stop(self):
        """Stop the background worker."""
        self._running = False
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=10)
            self._thread = None
        print("Avatar NSFW worker stopped", flush=True)

    def _run_loop(self):
        """Main worker loop: poll queue, check NSFW, handle results."""
        while self._running:
            try:
                self._process_one()
            except Exception as e:
                logger.error("Avatar NSFW worker error: %s", e, exc_info=True)

            self._stop_event.wait(self.poll_interval)

    def _process_one(self):
        """Dequeue and process one avatar NSFW check."""
        row = db.execute_query("""
            DELETE FROM avatar_nsfw_queue
            WHERE id = (
                SELECT id FROM avatar_nsfw_queue
                ORDER BY created_time
                LIMIT 1
            )
            RETURNING id, user_id, image_base64
        """, fetchone=True)

        if not row:
            return

        user_id = str(row['user_id'])
        image_base64 = row['image_base64']

        try:
            result = nlp.check_nsfw(image_base64)
        except nlp.NLPServiceError as e:
            logger.error("NSFW check failed for user %s: %s", user_id, e)
            return

        if not result.get('is_safe', True):
            logger.info("Avatar rejected for user %s (nsfw_score=%.2f)",
                        user_id, result.get('nsfw_score', 0))

            # Remove the avatar
            db.execute_query("""
                UPDATE users SET avatar_url = NULL, avatar_icon_url = NULL
                WHERE id = %s
            """, (user_id,))

            # Send notification
            send_or_queue_notification(
                title="Avatar removed",
                body="Your avatar was removed because it contains inappropriate content. Please upload a different image.",
                data={"type": "avatar_rejected"},
                recipient_user_id=user_id,
                db=db,
                notification_type='avatar_rejected',
            )


_worker: Optional[AvatarNsfwWorker] = None


def start_worker():
    """Start the global avatar NSFW worker."""
    global _worker
    _worker = AvatarNsfwWorker()
    _worker.start()


def stop_worker():
    """Stop the global avatar NSFW worker."""
    global _worker
    if _worker:
        _worker.stop()
        _worker = None
