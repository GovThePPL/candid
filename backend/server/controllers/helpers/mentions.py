"""
Mention parsing, resolution, and notification helpers for @username and @role mentions.

- @username mentions: up to 3 per post/comment, resolved to user IDs
- @role mentions: @admin, @moderator, @facilitator, @liaison, @expert — one per post/comment (first wins)
  Role mentions don't count toward the 3-user-mention limit.
"""

import logging
import re

from candid.controllers.helpers.push_notifications import (
    send_or_queue_notification,
    _is_notification_type_enabled,
)

logger = logging.getLogger(__name__)

MENTION_REGEX = re.compile(r'(?<!\w)@([a-zA-Z0-9_]{1,30})(?!\w)')
MAX_USER_MENTIONS = 3
ROLE_KEYWORDS = frozenset({'admin', 'moderator', 'facilitator', 'liaison', 'expert'})


def extract_mentions(text):
    """Extract up to MAX_USER_MENTIONS unique @username mentions from text.

    Role keywords (@admin, @moderator, etc.) are excluded.
    Returns list of lowercase usernames in order of first appearance, max 3.
    """
    if not text:
        return []
    seen = set()
    result = []
    for match in MENTION_REGEX.finditer(text):
        username = match.group(1).lower()
        if username in ROLE_KEYWORDS:
            continue
        if username not in seen:
            seen.add(username)
            result.append(username)
            if len(result) >= MAX_USER_MENTIONS:
                break
    return result


def extract_role_mention(text):
    """Extract the first @role mention from text, or None.

    Only one role mention per post/comment (first wins).
    """
    if not text:
        return None
    for match in MENTION_REGEX.finditer(text):
        keyword = match.group(1).lower()
        if keyword in ROLE_KEYWORDS:
            return keyword
    return None


def resolve_mentioned_users(usernames, db):
    """Resolve a list of usernames to {lowercase_username: user_id} dict.

    Only includes active users.
    """
    if not usernames:
        return {}
    placeholders = ', '.join(['%s'] * len(usernames))
    rows = db.execute_query(
        f"SELECT id, LOWER(username) AS username FROM users "
        f"WHERE LOWER(username) IN ({placeholders}) AND status = 'active'",
        tuple(usernames),
    )
    if not rows:
        return {}
    return {row['username']: str(row['id']) for row in rows}


def resolve_role_users(role, location_id, session_id, db):
    """Resolve a role keyword to a list of user_ids at the given location/session.

    Session-scoped roles (facilitator, liaison, expert):
      First try exact match (location_id + session_id).
      If empty, fall back to location-wide (session_id IS NULL).

    Location-only roles (admin, moderator):
      location_id match only.
    """
    if not role or not location_id:
        return []

    session_scoped = role in ('facilitator', 'liaison', 'expert')

    if session_scoped and session_id:
        # Try exact location + session match first
        rows = db.execute_query(
            "SELECT user_id FROM user_role "
            "WHERE role = %s AND location_id = %s AND session_id = %s",
            (role, location_id, session_id),
        )
        if rows:
            return [str(r['user_id']) for r in rows]
        # Fall back to location-wide (session IS NULL)
        rows = db.execute_query(
            "SELECT user_id FROM user_role "
            "WHERE role = %s AND location_id = %s AND session_id IS NULL",
            (role, location_id),
        )
    elif session_scoped:
        # No session provided — location-wide only
        rows = db.execute_query(
            "SELECT user_id FROM user_role "
            "WHERE role = %s AND location_id = %s AND session_id IS NULL",
            (role, location_id),
        )
    else:
        # Location-only roles (admin, moderator)
        rows = db.execute_query(
            "SELECT user_id FROM user_role "
            "WHERE role = %s AND location_id = %s",
            (role, location_id),
        )

    return [str(r['user_id']) for r in rows] if rows else []


def process_mentions(body, author_id, author_display_name, post_id,
                     location_id, session_id, db, comment_id=None):
    """Orchestrator: extract, resolve, and send mention notifications.

    Args:
        body: The post/comment body text.
        author_id: The user who wrote the content.
        author_display_name: Display name of the author.
        post_id: The post ID (for deep linking).
        location_id: Location scope for role resolution.
        session_id: Session scope for role resolution (may be None).
        db: Database module.
        comment_id: Comment ID if this is a comment mention (for deep linking).
    """
    if not body:
        return

    # --- User mentions ---
    usernames = extract_mentions(body)
    if usernames:
        user_map = resolve_mentioned_users(usernames, db)
        for username, user_id in user_map.items():
            # Don't self-notify
            if user_id == str(author_id):
                continue
            # Check per-type preference
            if not _is_notification_type_enabled(user_id, 'mention', db):
                continue
            _send_mention_notification(
                recipient_user_id=user_id,
                author_display_name=author_display_name,
                author_id=author_id,
                post_id=post_id,
                comment_id=comment_id,
                db=db,
            )

    # --- Role mention (first one wins) ---
    role = extract_role_mention(body)
    if role:
        role_user_ids = resolve_role_users(role, location_id, session_id, db)
        for user_id in role_user_ids:
            # Don't self-notify
            if user_id == str(author_id):
                continue
            # Check per-type preference
            if not _is_notification_type_enabled(user_id, 'mention', db):
                continue
            _send_mention_notification(
                recipient_user_id=user_id,
                author_display_name=author_display_name,
                author_id=author_id,
                post_id=post_id,
                comment_id=comment_id,
                db=db,
                role=role,
            )


def _send_mention_notification(recipient_user_id, author_display_name,
                                author_id, post_id, db,
                                comment_id=None, role=None):
    """Send a single mention notification via send_or_queue_notification."""
    if role:
        title = f"{author_display_name} mentioned @{role}"
    else:
        title = f"{author_display_name} mentioned you"

    data = {"action": "open_post", "postId": str(post_id)}
    if comment_id:
        data["commentId"] = str(comment_id)

    try:
        send_or_queue_notification(
            title=title,
            body=title,
            data=data,
            recipient_user_id=recipient_user_id,
            db=db,
            notification_type='mention',
            actor_user_id=str(author_id),
        )
    except Exception as e:
        logger.error("Mention notification error: %s", e)
