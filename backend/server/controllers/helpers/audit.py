"""Audit logging for admin and moderator actions.

Records a structured trail of privileged actions (bans, role changes,
content removals, etc.) to the audit_log table.
"""

import json
import logging
from typing import Any, Dict, Optional

from candid.controllers import db

logger = logging.getLogger(__name__)


def log_action(
    actor_id: str,
    action: str,
    target_type: str,
    target_id: Optional[str] = None,
    location_id: Optional[str] = None,
    session_id: Optional[str] = None,
    details: Optional[Dict[str, Any]] = None,
) -> None:
    """Write an entry to the audit_log table.

    Args:
        actor_id:    UUID of the user performing the action.
        action:      Machine-readable action name, e.g. 'ban_user', 'assign_role',
                     'remove_post', 'approve_role_request'.
        target_type: Kind of target — 'user', 'post', 'comment', 'position', 'role', etc.
        target_id:   UUID of the affected entity (nullable for bulk actions).
        location_id: Scope of the action (nullable).
        session_id:  Scope of the action (nullable).
        details:     Optional JSON-serialisable dict with extra context
                     (e.g. role name, ban duration, reason text).
    """
    try:
        db.execute_query(
            """INSERT INTO audit_log
               (actor_id, action, target_type, target_id,
                location_id, session_id, details)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (
                actor_id,
                action,
                target_type,
                target_id,
                location_id,
                session_id,
                json.dumps(details) if details else None,
            ),
        )
    except Exception:
        # Audit logging must never break the main request
        logger.exception("Failed to write audit log entry")
