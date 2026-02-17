"""Notification inbox controller."""

import base64 as b64
import json
import logging

from candid.controllers import db
from candid.controllers.helpers.auth import authorization, token_to_user

logger = logging.getLogger(__name__)


def _encode_cursor(created_time, item_id):
    payload = json.dumps({"v": str(created_time), "id": str(item_id)})
    return b64.urlsafe_b64encode(payload.encode()).decode()


def _decode_cursor(cursor):
    try:
        payload = json.loads(b64.urlsafe_b64decode(cursor))
        return payload["v"], payload["id"]
    except Exception:
        return None


def get_notifications(cursor=None, limit=None, token_info=None):  # noqa: E501
    """Get the current user's notification inbox."""
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)
    user_id = str(user.id)

    if limit is None:
        limit = 20
    limit = max(1, min(limit, 50))

    cursor_clause = ""
    params = [user_id]

    if cursor:
        cursor_vals = _decode_cursor(cursor)
        if cursor_vals:
            cursor_clause = (
                "AND (n.created_time < %s "
                "OR (n.created_time = %s AND n.id::text < %s))"
            )
            params.extend([cursor_vals[0], cursor_vals[0], cursor_vals[1]])

    rows = db.execute_query(f"""
        SELECT n.id, n.notification_type, n.actor_user_id,
               u.display_name AS actor_display_name,
               u.avatar_icon_url AS actor_avatar_icon_url,
               n.title, n.body, n.data, n.is_read, n.created_time
        FROM notification_inbox n
        LEFT JOIN users u ON u.id = n.actor_user_id
        WHERE n.user_id = %s
          {cursor_clause}
        ORDER BY n.created_time DESC, n.id DESC
        LIMIT %s
    """, tuple(params) + (limit + 1,))

    if rows is None:
        rows = []

    has_more = len(rows) > limit
    if has_more:
        rows = rows[:limit]

    items = []
    for row in rows:
        data = row["data"]
        if isinstance(data, str):
            try:
                data = json.loads(data)
            except Exception:
                data = {}

        items.append({
            "id": str(row["id"]),
            "type": row["notification_type"],
            "actorUserId": str(row["actor_user_id"]) if row["actor_user_id"] else None,
            "actorDisplayName": row["actor_display_name"],
            "actorAvatarIconUrl": row["actor_avatar_icon_url"],
            "title": row["title"],
            "body": row["body"],
            "data": data or {},
            "isRead": row["is_read"],
            "createdTime": row["created_time"].isoformat() if row["created_time"] else None,
        })

    next_cursor = None
    if has_more and items:
        last = rows[-1]
        next_cursor = _encode_cursor(last["created_time"], last["id"])

    return {"items": items, "nextCursor": next_cursor, "hasMore": has_more}


def get_notifications_unread_count(token_info=None):  # noqa: E501
    """Get the count of unread notifications."""
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)
    user_id = str(user.id)

    row = db.execute_query(
        "SELECT COUNT(*) AS count FROM notification_inbox "
        "WHERE user_id = %s AND is_read = false",
        (user_id,), fetchone=True)

    return {"count": row["count"] if row else 0}


def mark_notification_read(notification_id, token_info=None):  # noqa: E501
    """Mark a single notification as read."""
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)
    user_id = str(user.id)

    result = db.execute_query(
        "UPDATE notification_inbox SET is_read = true "
        "WHERE id = %s AND user_id = %s AND is_read = false "
        "RETURNING id",
        (str(notification_id), user_id), fetchone=True)

    # 204 whether it existed or was already read (idempotent)
    return '', 204


def mark_all_notifications_read(token_info=None):  # noqa: E501
    """Mark all notifications as read."""
    authorized, auth_err = authorization("normal", token_info)
    if not authorized:
        return auth_err, auth_err.code
    user = token_to_user(token_info)
    user_id = str(user.id)

    db.execute_query(
        "UPDATE notification_inbox SET is_read = true "
        "WHERE user_id = %s AND is_read = false",
        (user_id,))

    return '', 204
