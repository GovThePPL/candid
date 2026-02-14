"""
Push notification helpers using the Expo Push API.
"""

import json
import logging
import urllib.request
import urllib.error
from datetime import datetime
from zoneinfo import ZoneInfo


logger = logging.getLogger(__name__)

EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"

# Maps notification_frequency (0-5) to daily cap
FREQUENCY_CAPS = {
    0: 0,       # off
    1: 2,       # rarely
    2: 5,       # less
    3: 10,      # normal
    4: 20,      # more
    5: 999999,  # often (effectively unlimited)
}


def send_push_notification(push_token, title, body, data=None, db=None, recipient_user_id=None):
    """Send a push notification via Expo Push API.

    Args:
        push_token: The recipient's Expo push token
        title: Notification title
        body: Notification body text
        data: Optional data dict for deep linking
        db: Database module (for incrementing daily counter)
        recipient_user_id: Recipient user ID (for daily counter)

    Returns:
        True if sent successfully, False otherwise
    """
    if not push_token:
        return False

    # Truncate body for notification
    short_body = body[:120] + "..." if len(body) > 120 else body

    payload = {
        "to": push_token,
        "sound": "default",
        "title": title,
        "body": short_body,
    }
    if data:
        payload["data"] = data

    try:
        encoded = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            EXPO_PUSH_URL,
            data=encoded,
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            json.loads(response.read().decode("utf-8"))

        # Increment daily notification counter
        if db and recipient_user_id:
            today = datetime.now().date()
            db.execute_query("""
                UPDATE users
                SET notifications_sent_today = CASE
                        WHEN notifications_sent_date = %s THEN notifications_sent_today + 1
                        ELSE 1
                    END,
                    notifications_sent_date = %s
                WHERE id = %s
            """, (today, today, recipient_user_id))

        return True

    except Exception as e:
        logger.error("Error sending push notification: %s", e)
        return False


def send_chat_request_notification(push_token, initiator_display_name, position_statement, db=None, recipient_user_id=None):
    """Send a push notification for a new chat request.

    Wrapper around send_push_notification for backward compatibility.
    """
    short_statement = position_statement[:80] + "..." if len(position_statement) > 80 else position_statement
    return send_push_notification(
        push_token,
        f"{initiator_display_name} wants to chat",
        short_statement,
        data={"action": "open_cards"},
        db=db,
        recipient_user_id=recipient_user_id,
    )


def _is_notification_type_enabled(user_id, notification_type, db):
    """Check if a notification type is enabled for a user.

    Absent rows default to enabled.
    """
    pref = db.execute_query(
        "SELECT enabled FROM notification_type_preferences "
        "WHERE user_id = %s AND notification_type = %s",
        (str(user_id), notification_type), fetchone=True)
    if pref and not pref["enabled"]:
        return False
    return True


def send_comment_reply_notification(parent_author_id, replier_display_name,
                                    comment_snippet, post_id, db):
    """Send a push notification when someone replies to a comment.

    Checks per-type preference before sending.

    Args:
        parent_author_id: User ID of the parent comment's author.
        replier_display_name: Display name of the replier.
        comment_snippet: Body text of the reply (truncated).
        post_id: Post ID for deep linking.
        db: Database module.
    """
    if not _is_notification_type_enabled(parent_author_id, 'comment_reply', db):
        return

    snippet = comment_snippet[:80] + "..." if len(comment_snippet) > 80 else comment_snippet
    send_or_queue_notification(
        title=f"{replier_display_name} replied to your comment",
        body=snippet,
        data={"action": "open_post", "postId": str(post_id)},
        recipient_user_id=parent_author_id,
        db=db,
    )


def _is_in_quiet_hours(user_row):
    """Check if a user is currently in their quiet hours.

    Args:
        user_row: Dict with quiet_hours_start, quiet_hours_end, timezone

    Returns:
        True if currently in quiet hours, False otherwise
    """
    quiet_start = user_row.get("quiet_hours_start")
    quiet_end = user_row.get("quiet_hours_end")

    if quiet_start is None or quiet_end is None:
        return False

    tz_name = user_row.get("timezone") or "America/New_York"
    try:
        tz = ZoneInfo(tz_name)
        now_local = datetime.now(tz)
        current_hour = now_local.hour

        if quiet_start <= quiet_end:
            return quiet_start <= current_hour < quiet_end
        else:
            # Wraps midnight (e.g., 22-7)
            return current_hour >= quiet_start or current_hour < quiet_end
    except Exception:
        return False


def _is_under_frequency_cap(user_row):
    """Check if user is under their daily notification frequency cap."""
    freq = user_row.get("notification_frequency", 3)
    cap = FREQUENCY_CAPS.get(freq, 10)
    if cap == 0:
        return False

    today = datetime.now().date()
    sent_date = user_row.get("notifications_sent_date")
    sent_today = user_row.get("notifications_sent_today", 0)

    if sent_date and sent_date == today:
        return sent_today < cap

    return True  # Different date, counter is effectively 0


def send_or_queue_notification(title, body, data, recipient_user_id, db):
    """Send a notification immediately or queue it if user is in quiet hours.

    1. Load recipient's notification settings
    2. If notifications disabled or over cap → drop silently
    3. If in quiet hours → queue in notification_queue table
    4. Otherwise → send immediately

    Args:
        title: Notification title
        body: Notification body
        data: Data dict for deep linking
        recipient_user_id: Target user's ID
        db: Database module
    """
    user_row = db.execute_query("""
        SELECT push_token, notifications_enabled, quiet_hours_start, quiet_hours_end,
               timezone, notification_frequency, notifications_sent_today,
               notifications_sent_date
        FROM users WHERE id = %s
    """, (str(recipient_user_id),), fetchone=True)

    if not user_row:
        return

    # Check if notifications are enabled
    if not user_row.get("notifications_enabled"):
        return

    # Check frequency cap
    if not _is_under_frequency_cap(user_row):
        return

    # Check quiet hours
    if _is_in_quiet_hours(user_row):
        # Queue for later delivery
        db.execute_query("""
            INSERT INTO notification_queue (user_id, title, body, data)
            VALUES (%s, %s, %s, %s)
        """, (str(recipient_user_id), title, body, json.dumps(data or {})))
        return

    # Send immediately
    push_token = user_row.get("push_token")
    if push_token:
        send_push_notification(push_token, title, body, data, db, str(recipient_user_id))


def drain_notification_queue(user_id, db):
    """Drain queued notifications for a user if they're outside quiet hours.

    Called on heartbeat. If user is still in quiet hours, does nothing.

    Args:
        user_id: User ID to drain notifications for
        db: Database module
    """
    # Check if user is currently in quiet hours
    user_row = db.execute_query("""
        SELECT push_token, notifications_enabled, quiet_hours_start, quiet_hours_end,
               timezone, notification_frequency, notifications_sent_today,
               notifications_sent_date
        FROM users WHERE id = %s
    """, (str(user_id),), fetchone=True)

    if not user_row:
        return

    if not user_row.get("notifications_enabled"):
        # Notifications disabled — clear the queue
        db.execute_query("DELETE FROM notification_queue WHERE user_id = %s", (str(user_id),))
        return

    if _is_in_quiet_hours(user_row):
        return  # Still in quiet hours, try again next heartbeat

    push_token = user_row.get("push_token")
    if not push_token:
        db.execute_query("DELETE FROM notification_queue WHERE user_id = %s", (str(user_id),))
        return

    # Fetch and send queued notifications
    queued = db.execute_query("""
        SELECT id, title, body, data FROM notification_queue
        WHERE user_id = %s ORDER BY created_time ASC
    """, (str(user_id),))

    if not queued:
        return

    for notification in queued:
        if not _is_under_frequency_cap(user_row):
            break  # Hit daily cap, stop sending

        data = notification.get("data")
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except Exception:
                data = {}

        send_push_notification(
            push_token,
            notification["title"],
            notification["body"],
            data,
            db,
            str(user_id),
        )

        # Delete sent notification
        db.execute_query("DELETE FROM notification_queue WHERE id = %s", (notification["id"],))

        # Refresh user row for updated counter
        user_row = db.execute_query("""
            SELECT notification_frequency, notifications_sent_today, notifications_sent_date
            FROM users WHERE id = %s
        """, (str(user_id),), fetchone=True)
