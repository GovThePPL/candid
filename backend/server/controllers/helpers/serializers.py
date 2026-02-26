"""Shared serialization helpers used across multiple controllers.

Centralizes:
- ``get_user_card(user_id)`` — single canonical User model builder
- ``build_creator_dict(row)`` — creator sub-object from joined DB rows
- ``clamp_pagination(limit, offset, ...)`` — pagination parameter clamping
"""

from candid.controllers import db
from candid.models.user import User


def get_user_card(user_id):
    """Fetch a lightweight User model for API responses.

    Replaces the 4 identical copies that previously lived in
    positions_controller, surveys_controller, helpers/admin, and
    helpers/moderation.
    """
    row = db.execute_query("""
        SELECT id, username, display_name, status, kudos_count
        FROM users WHERE id = %s
    """, (user_id,), fetchone=True)
    if row is not None:
        return User(
            id=str(row['id']),
            username=row['username'],
            display_name=row['display_name'],
            status=row['status'],
            kudos_count=row.get('kudos_count', 0),
        )
    return None


def build_creator_dict(row, prefix="creator_"):
    """Build a creator sub-object dict from a joined DB row.

    Expects columns like ``creator_user_id``, ``creator_display_name``,
    ``creator_username``, ``creator_avatar_icon_url``, ``creator_status``,
    ``creator_trust_score``, ``creator_kudos_count`` (all prefixed).

    Returns a dict suitable for API response, or a minimal ``{"id": ...}``
    fallback if only the user ID is present, or None if no creator info.
    """
    user_id_key = f"{prefix}user_id"
    display_name_key = f"{prefix}display_name"

    if row.get(display_name_key) is not None:
        trust_score_key = f"{prefix}trust_score"
        return {
            "id": str(row[user_id_key]),
            "username": row.get(f"{prefix}username"),
            "displayName": row.get(display_name_key),
            "avatarIconUrl": row.get(f"{prefix}avatar_icon_url"),
            "status": row.get(f"{prefix}status"),
            "trustScore": float(row[trust_score_key]) if row.get(trust_score_key) is not None else None,
            "kudosCount": row.get(f"{prefix}kudos_count", 0),
        }
    elif row.get(user_id_key):
        return {"id": str(row[user_id_key])}
    return None


def clamp_pagination(limit, offset, default_limit=20, max_limit=100):
    """Clamp and sanitize pagination parameters.

    Returns (clamped_limit, clamped_offset) tuple.

    >>> clamp_pagination(None, None)
    (20, 0)
    >>> clamp_pagination(500, -1, max_limit=100)
    (100, 0)
    >>> clamp_pagination(0, 5)
    (1, 5)
    """
    clamped_limit = min(max(limit or default_limit, 1), max_limit)
    clamped_offset = max(offset or 0, 0)
    return clamped_limit, clamped_offset
