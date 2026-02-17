"""
Helper functions for publishing notification events to Redis pub/sub.

These events are consumed by the chat WebSocket server and delivered
to the recipient's personal room for real-time notification updates.
"""

import json
import logging
from .redis_pool import get_redis

logger = logging.getLogger(__name__)

NOTIFICATION_EVENTS_CHANNEL = "notifications:events"


def publish_notification(user_id, inbox_id, notification_type, title, body,
                         data=None, actor_user_id=None, actor_display_name=None,
                         actor_avatar_icon_url=None, created_time=None):
    """Publish a notification event for real-time delivery via Socket.IO.

    Args:
        user_id: Recipient user ID
        inbox_id: The notification_inbox row ID
        notification_type: Type string (comment_reply, post_comment, etc.)
        title: Notification title
        body: Notification body
        data: Deep link data dict
        actor_user_id: Who triggered the notification
        actor_display_name: Actor's display name
        actor_avatar_icon_url: Actor's avatar icon URL
        created_time: Timestamp string

    Returns:
        True if published successfully, False otherwise
    """
    try:
        r = get_redis()
        event = {
            "event": "notification",
            "userId": str(user_id),
            "notification": {
                "id": str(inbox_id),
                "type": notification_type,
                "actorUserId": str(actor_user_id) if actor_user_id else None,
                "actorDisplayName": actor_display_name,
                "actorAvatarIconUrl": actor_avatar_icon_url,
                "title": title,
                "body": body,
                "data": data or {},
                "isRead": False,
                "createdTime": str(created_time) if created_time else None,
            },
        }
        r.publish(NOTIFICATION_EVENTS_CHANNEL, json.dumps(event))
        return True
    except Exception as e:
        logger.error("Error publishing notification event: %s", e)
        return False
