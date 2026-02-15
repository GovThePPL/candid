"""
Helper functions for publishing discuss forum events to Redis pub/sub.

These events are consumed by the chat WebSocket server and broadcast
to clients viewing the relevant post.
"""

import json
import logging
from .redis_pool import get_redis

logger = logging.getLogger(__name__)

# Separate channel from chat events for clean separation of concerns
DISCUSS_EVENTS_CHANNEL = "discuss:events"


def publish_new_comment(post_id, comment_dict):
    """Publish a new_comment event for real-time updates.

    Args:
        post_id: The post ID the comment belongs to
        comment_dict: The comment response dict (same shape as API response)

    Returns:
        True if published successfully, False otherwise
    """
    try:
        r = get_redis()
        event = {
            "event": "new_comment",
            "postId": str(post_id),
            "comment": comment_dict,
        }
        r.publish(DISCUSS_EVENTS_CHANNEL, json.dumps(event))
        return True
    except Exception as e:
        logger.error("Error publishing new_comment event: %s", e)
        return False


def publish_vote_update(post_id, comment_id, counts):
    """Publish a vote_update event for real-time vote count sync.

    Args:
        post_id: The post ID the comment belongs to
        comment_id: The comment that was voted on
        counts: Dict with upvoteCount, downvoteCount, score

    Returns:
        True if published successfully, False otherwise
    """
    try:
        r = get_redis()
        event = {
            "event": "vote_update",
            "postId": str(post_id),
            "commentId": str(comment_id),
            "counts": counts,
        }
        r.publish(DISCUSS_EVENTS_CHANNEL, json.dumps(event))
        return True
    except Exception as e:
        logger.error("Error publishing vote_update event: %s", e)
        return False
