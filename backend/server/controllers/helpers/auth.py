"""Authorization helpers with hierarchical, location-scoped role system.

Role hierarchy:
  Admin (location-scoped, inherits DOWN)
    └─ Moderator (location-scoped, inherits DOWN)
        └─ Facilitator (location + session scoped, NO inheritance)
            ├─ Assistant Moderator
            ├─ Expert
            └─ Liaison

user_type is now only 'normal' or 'guest'. All privileged roles live in user_role.
"""

import functools
import logging
import time
from datetime import datetime, timezone

from candid.models.user import User
from candid.models.error_model import ErrorModel
from candid.controllers import config, db
from candid.controllers.helpers.constants import HIERARCHICAL_ROLES, STAGE_ORDER, STAGE_INDEX, WRITE_STAGES
from candid.controllers.helpers.redis_pool import get_redis

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# user_type ranking (only for guest vs normal checks)
# ---------------------------------------------------------------------------

_USER_ROLE_RANKING = {"guest": 1, "normal": 10}

# Scoped role hierarchy: each role is satisfied by any role above it
_SCOPED_ROLE_HIERARCHY = {
    "admin": {"admin"},
    "moderator": {"admin", "moderator"},
    "facilitator": {"admin", "moderator", "facilitator"},
    "assistant_moderator": {"admin", "moderator", "facilitator", "assistant_moderator"},
    "liaison": {"admin", "moderator", "facilitator", "liaison"},
    "expert": {"admin", "moderator", "facilitator", "expert"},
}

# HIERARCHICAL_ROLES imported from constants.py

# ---------------------------------------------------------------------------
# Location tree helpers (cached with TTL)
# ---------------------------------------------------------------------------

_LOCATION_CACHE_TTL = 300  # 5 minutes
_location_ancestor_cache = {}  # location_id -> (timestamp, [ancestor_ids])
_location_descendant_cache = {}  # location_id -> (timestamp, [descendant_ids])
_root_location_cache = {"value": None, "ts": 0}


def invalidate_location_cache():
    """Invalidate all location tree caches. Call after location rearrangement."""
    _location_ancestor_cache.clear()
    _location_descendant_cache.clear()
    _root_location_cache["value"] = None
    _root_location_cache["ts"] = 0


def _is_cache_valid(ts):
    return (time.time() - ts) < _LOCATION_CACHE_TTL


def get_root_location_id():
    """Get the root location (no parent). Cached."""
    if _root_location_cache["value"] and _is_cache_valid(_root_location_cache["ts"]):
        return _root_location_cache["value"]

    row = db.execute_query(
        "SELECT id FROM location WHERE parent_location_id IS NULL AND deleted_at IS NULL LIMIT 1",
        fetchone=True,
    )
    if row:
        _root_location_cache["value"] = str(row["id"])
        _root_location_cache["ts"] = time.time()
        return _root_location_cache["value"]
    return None


def get_location_ancestors(location_id):
    """Return [self, parent, ..., root] for the given location. Cached."""
    loc_str = str(location_id)
    cached = _location_ancestor_cache.get(loc_str)
    if cached and _is_cache_valid(cached[0]):
        return cached[1]

    rows = db.execute_query("""
        WITH RECURSIVE ancestors AS (
            SELECT id, parent_location_id, 0 AS depth
            FROM location WHERE id = %s AND deleted_at IS NULL
            UNION ALL
            SELECT l.id, l.parent_location_id, a.depth + 1
            FROM location l
            JOIN ancestors a ON l.id = a.parent_location_id
            WHERE l.deleted_at IS NULL
        )
        SELECT id FROM ancestors ORDER BY depth
    """, (loc_str,))

    result = [str(r["id"]) for r in rows] if rows else []
    _location_ancestor_cache[loc_str] = (time.time(), result)
    return result


def get_location_descendants(location_id):
    """Return all descendants (including self) of the given location. Cached."""
    loc_str = str(location_id)
    cached = _location_descendant_cache.get(loc_str)
    if cached and _is_cache_valid(cached[0]):
        return cached[1]

    rows = db.execute_query("""
        WITH RECURSIVE descendants AS (
            SELECT id FROM location WHERE id = %s AND deleted_at IS NULL
            UNION ALL
            SELECT l.id
            FROM location l
            JOIN descendants d ON l.parent_location_id = d.id
            WHERE l.deleted_at IS NULL
        )
        SELECT id FROM descendants
    """, (loc_str,))

    result = [str(r["id"]) for r in rows] if rows else []
    _location_descendant_cache[loc_str] = (time.time(), result)
    return result


# ---------------------------------------------------------------------------
# Role queries
# ---------------------------------------------------------------------------

def get_user_roles(user_id):
    """Get all roles for a user from user_role table.

    Returns list of dicts with role, location, and session info.
    """
    rows = db.execute_query("""
        SELECT ur.role, ur.location_id, ur.session_id,
               l.name AS location_name, l.code AS location_code,
               pc.label AS session_label
        FROM user_role ur
        LEFT JOIN location l ON ur.location_id = l.id
        LEFT JOIN session pc ON ur.session_id = pc.id
        WHERE ur.user_id = %s
    """, (str(user_id),))
    if not rows:
        return []
    return [
        {
            "role": r["role"],
            "location_id": str(r["location_id"]) if r["location_id"] else None,
            "session_id": str(r["session_id"]) if r["session_id"] else None,
            "location_name": r.get("location_name"),
            "location_code": r.get("location_code"),
            "session_label": r.get("session_label"),
        }
        for r in rows
    ]


def has_any_scoped_role(user_id):
    """Check if a user has any entry in user_role."""
    row = db.execute_query(
        "SELECT 1 FROM user_role WHERE user_id = %s LIMIT 1",
        (str(user_id),), fetchone=True,
    )
    return row is not None


def is_admin_anywhere(user_id):
    """Check if user has admin role at any location."""
    row = db.execute_query(
        "SELECT 1 FROM user_role WHERE user_id = %s AND role = 'admin' LIMIT 1",
        (str(user_id),), fetchone=True,
    )
    return row is not None


def is_moderator_anywhere(user_id):
    """Check if user has moderator or admin role at any location."""
    row = db.execute_query(
        "SELECT 1 FROM user_role WHERE user_id = %s AND role IN ('admin', 'moderator') LIMIT 1",
        (str(user_id),), fetchone=True,
    )
    return row is not None


def get_facilitator_scopes(user_id):
    """All (location_id, session_id) pairs where user is a facilitator.

    Returns list of (location_id_str, session_id_str) tuples.
    Only includes rows where both location_id and session_id are non-null.
    """
    rows = db.execute_query("""
        SELECT location_id, session_id FROM user_role
        WHERE user_id = %s AND role IN ('facilitator', 'assistant_moderator')
        AND location_id IS NOT NULL AND session_id IS NOT NULL
    """, (str(user_id),))
    if not rows:
        return []
    return [(str(r['location_id']), str(r['session_id'])) for r in rows]


def get_user_type(user_id):
    """Get the user_type ('normal' or 'guest') from the users table."""
    ret = db.execute_query(
        "SELECT user_type FROM users WHERE id = %s",
        (user_id,), fetchone=True,
    )
    if ret:
        return ret["user_type"]
    return None


# ---------------------------------------------------------------------------
# Hierarchical authority checks
# ---------------------------------------------------------------------------

def is_root_admin(user_id):
    """Check if user is admin at the root location (= superadmin)."""
    root_id = get_root_location_id()
    if not root_id:
        return False
    return is_admin_at_location(user_id, root_id)


def is_admin_at_location(user_id, location_id):
    """Check if user has admin role at this location or any ancestor (inherits down)."""
    ancestors = get_location_ancestors(location_id)
    if not ancestors:
        return False
    row = db.execute_query("""
        SELECT 1 FROM user_role
        WHERE user_id = %s AND role = 'admin' AND location_id = ANY(%s::uuid[])
        LIMIT 1
    """, (str(user_id), ancestors), fetchone=True)
    return row is not None


def is_moderator_at_location(user_id, location_id):
    """Check if user has moderator (or admin) role at this location or any ancestor."""
    ancestors = get_location_ancestors(location_id)
    if not ancestors:
        return False
    row = db.execute_query("""
        SELECT 1 FROM user_role
        WHERE user_id = %s AND role IN ('admin', 'moderator') AND location_id = ANY(%s::uuid[])
        LIMIT 1
    """, (str(user_id), ancestors), fetchone=True)
    return row is not None


def is_facilitator_for(user_id, location_id, session_id=None):
    """Check if user is facilitator at exact location+session (no location inheritance).

    If session_id is None, checks for any facilitator role at the location.
    """
    if session_id:
        row = db.execute_query("""
            SELECT 1 FROM user_role
            WHERE user_id = %s AND role = 'facilitator'
            AND location_id = %s AND session_id = %s
            LIMIT 1
        """, (str(user_id), str(location_id), str(session_id)), fetchone=True)
    else:
        row = db.execute_query("""
            SELECT 1 FROM user_role
            WHERE user_id = %s AND role = 'facilitator' AND location_id = %s
            LIMIT 1
        """, (str(user_id), str(location_id)), fetchone=True)
    return row is not None


def get_highest_role_at_location(user_id, location_id, session_id=None):
    """Get user's highest role relevant to a location (+ optional session).

    Checks hierarchical roles (admin, moderator) at location ancestors,
    then session-scoped roles at exact location.
    Returns role name string or None.
    """
    # Check hierarchical roles (admin > moderator) at ancestors
    ancestors = get_location_ancestors(location_id)
    if ancestors:
        row = db.execute_query("""
            SELECT role FROM user_role
            WHERE user_id = %s AND role IN ('admin', 'moderator')
            AND location_id = ANY(%s::uuid[])
            ORDER BY CASE role WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 END
            LIMIT 1
        """, (str(user_id), ancestors), fetchone=True)
        if row:
            return row["role"]

    # Check session-scoped roles at exact location
    if session_id:
        row = db.execute_query("""
            SELECT role FROM user_role
            WHERE user_id = %s AND location_id = %s AND session_id = %s
            ORDER BY CASE role
                WHEN 'facilitator' THEN 1
                WHEN 'assistant_moderator' THEN 2
                WHEN 'expert' THEN 3
                WHEN 'liaison' THEN 4
            END
            LIMIT 1
        """, (str(user_id), str(location_id), str(session_id)), fetchone=True)
        if row:
            return row["role"]

    # Check session-scoped roles without specific session
    row = db.execute_query("""
        SELECT role FROM user_role
        WHERE user_id = %s AND location_id = %s
        AND role IN ('facilitator', 'assistant_moderator', 'expert', 'liaison')
        ORDER BY CASE role
            WHEN 'facilitator' THEN 1
            WHEN 'assistant_moderator' THEN 2
            WHEN 'expert' THEN 3
            WHEN 'liaison' THEN 4
        END
        LIMIT 1
    """, (str(user_id), str(location_id)), fetchone=True)
    if row:
        return row["role"]

    return None


# ---------------------------------------------------------------------------
# Authorization functions
# ---------------------------------------------------------------------------

def authorization_site_admin(token_info=None):
    """Check if the user is a root admin (admin at root location).

    Returns (True, None) or (False, ErrorModel).
    """
    if not token_info:
        return False, ErrorModel(401, "Authentication Required")

    user_id = token_info["sub"]
    user_type = get_user_type(user_id)
    if user_type is None:
        return False, ErrorModel(401, "User not found")

    is_banned, ban_err = _check_ban_status(user_id)
    if is_banned:
        return False, ban_err

    if is_root_admin(user_id):
        return True, None
    return False, ErrorModel(403, "Unauthorized")


def authorization(required_level, token_info=None):
    """Basic user_type authorization (guest vs normal).

    For scoped role checks, use authorization_scoped() instead.
    This only checks user_type ('normal' >= 'guest').
    """
    if not token_info:
        return False, ErrorModel(401, "Authentication Required")
    user_id = token_info['sub']
    user_type = get_user_type(user_id)
    if user_type is None:
        return False, ErrorModel(401, "User not found")
    if _USER_ROLE_RANKING.get(user_type, 0) < _USER_ROLE_RANKING.get(required_level, 0):
        return False, ErrorModel(403, "Unauthorized")

    is_banned, ban_err = _check_ban_status(user_id)
    if is_banned:
        return False, ban_err

    return True, None


def authorization_allow_banned(required_level, token_info=None):
    """Same as authorization() but skips ban check.
    Used for endpoints banned users still need: card queue, profile, appeal creation.
    """
    if not token_info:
        return False, ErrorModel(401, "Authentication Required")
    user_id = token_info['sub']
    user_type = get_user_type(user_id)
    if user_type is None:
        return False, ErrorModel(401, "User not found")
    if _USER_ROLE_RANKING.get(user_type, 0) >= _USER_ROLE_RANKING.get(required_level, 0):
        return True, None
    return False, ErrorModel(403, "Unauthorized")


# ---------------------------------------------------------------------------
# Auth decorator — eliminates 3-line boilerplate in endpoints
# ---------------------------------------------------------------------------

def require_auth(level="normal", allow_banned=False):
    """Decorator that handles user_type auth check and injects ``user_id``.

    Replaces the common boilerplate::

        authorized, auth_err = authorization("normal", token_info)
        if not authorized:
            return auth_err, auth_err.code
        user_id = token_info["sub"]

    Usage::

        @require_auth("normal")
        def my_endpoint(param1, token_info=None, user_id=None):
            # user_id is guaranteed to be set here
            ...

        @require_auth("normal", allow_banned=True)
        def card_queue(token_info=None, user_id=None):
            ...

    The decorated function's signature is preserved for Connexion routing.
    ``user_id`` must be declared as a keyword parameter with a default.
    """
    def decorator(fn):
        @functools.wraps(fn)
        def wrapper(*args, **kwargs):
            token_info = kwargs.get("token_info")
            if allow_banned:
                ok, err = authorization_allow_banned(level, token_info)
            else:
                ok, err = authorization(level, token_info)
            if not ok:
                return err, err.code
            kwargs["user_id"] = token_info["sub"]
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def authorization_scoped(required_role, token_info=None, location_id=None, session_id=None):
    """Hierarchical, location-scoped authorization check.

    Checks whether the user has `required_role` (or higher) at the given
    location/session scope. The hierarchy:
      1. Admin at location (or ancestor)? → pass
      2. Moderator at location (or ancestor)? → pass if required_role is moderator or below
      3. Facilitator at location+session? → pass if required_role is facilitator or below
      4. Exact scoped role match? → pass

    Returns (True, None) or (False, ErrorModel).
    """
    if not token_info:
        return False, ErrorModel(401, "Authentication Required")

    user_id = token_info["sub"]
    user_type = get_user_type(user_id)
    if user_type is None:
        return False, ErrorModel(401, "User not found")

    is_banned, ban_err = _check_ban_status(user_id)
    if is_banned:
        return False, ban_err

    # Get the set of roles that satisfy the required_role
    satisfying_roles = _SCOPED_ROLE_HIERARCHY.get(required_role)
    if not satisfying_roles:
        return False, ErrorModel(403, "Unauthorized")

    if location_id:
        ancestors = get_location_ancestors(location_id)

        # Check hierarchical roles (admin, moderator) at ancestors
        if ancestors:
            for role in ("admin", "moderator"):
                if role in satisfying_roles:
                    row = db.execute_query("""
                        SELECT 1 FROM user_role
                        WHERE user_id = %s AND role = %s AND location_id = ANY(%s::uuid[])
                        LIMIT 1
                    """, (str(user_id), role, ancestors), fetchone=True)
                    if row:
                        return True, None

        # Check session-scoped roles at exact location
        non_hierarchical = satisfying_roles - HIERARCHICAL_ROLES
        if non_hierarchical:
            if session_id:
                row = db.execute_query("""
                    SELECT 1 FROM user_role
                    WHERE user_id = %s AND role = ANY(%s)
                    AND location_id = %s AND session_id = %s
                    LIMIT 1
                """, (str(user_id), list(non_hierarchical), str(location_id), str(session_id)),
                    fetchone=True)
                if row:
                    return True, None

            # Also check roles without session constraint
            row = db.execute_query("""
                SELECT 1 FROM user_role
                WHERE user_id = %s AND role = ANY(%s)
                AND location_id = %s AND session_id IS NULL
                LIMIT 1
            """, (str(user_id), list(non_hierarchical), str(location_id)),
                fetchone=True)
            if row:
                return True, None
    else:
        # No location specified — check if user has any satisfying role anywhere
        row = db.execute_query("""
            SELECT 1 FROM user_role
            WHERE user_id = %s AND role = ANY(%s)
            LIMIT 1
        """, (str(user_id), list(satisfying_roles)), fetchone=True)
        if row:
            return True, None

    return False, ErrorModel(403, "Unauthorized")


# ---------------------------------------------------------------------------
# User model helper
# ---------------------------------------------------------------------------

QA_QUALIFYING_ROLES = {'admin', 'moderator', 'facilitator', 'expert', 'liaison'}


def has_qa_authority(user_id, location_id, session_id):
    """Check if user has any qualifying role for Q&A at this location+session."""
    role = get_highest_role_at_location(user_id, location_id, session_id)
    return role in QA_QUALIFYING_ROLES


def token_to_user(token_info):
    res = db.execute_query("""
        SELECT *
        FROM users
        WHERE id = %s
    """, (token_info["sub"],), fetchone=True)
    if res is not None:
        return User(
            id=str(res['id']),
            username=res['username'],
            display_name=res['display_name'],
            avatar_url=res.get('avatar_url'),
            avatar_icon_url=res.get('avatar_icon_url'),
            status=res['status'],
            trust_score=float(res['trust_score']) if res.get('trust_score') is not None else None,
            kudos_count=res.get('kudos_count', 0),
        )
    return None


# ---------------------------------------------------------------------------
# Session stage gating
# ---------------------------------------------------------------------------

def get_session_stage(session_id):
    """Fetch the current stage of a session.

    Returns stage string or None if session not found.
    """
    if not session_id:
        return None
    row = db.execute_query(
        "SELECT stage FROM session WHERE id = %s",
        (str(session_id),), fetchone=True,
    )
    return row["stage"] if row else None


def check_session_stage(session_id, content_type):
    """Check if the session's current stage allows creating the given content type.

    Returns (True, None) if allowed, (False, ErrorModel) if blocked.
    None session_id always passes (unscoped content).
    """
    if not session_id:
        return True, None

    stage = get_session_stage(session_id)
    if stage is None:
        return False, ErrorModel(404, "Session not found")

    allowed_stages = WRITE_STAGES.get(content_type)
    if allowed_stages is None:
        return True, None  # Unknown content type — don't gate

    if stage in allowed_stages:
        return True, None

    return False, ErrorModel(403, f"This action is not allowed during the '{stage}' stage")


def validate_stage_advance(current_stage, requested_stage):
    """Validate that requested_stage is the next stage after current_stage.

    Returns (True, None) if valid, (False, error_message) if invalid.
    """
    current_idx = STAGE_INDEX.get(current_stage)
    requested_idx = STAGE_INDEX.get(requested_stage)

    if current_idx is None:
        return False, f"Unknown current stage: {current_stage}"
    if requested_idx is None:
        return False, f"Unknown requested stage: {requested_stage}"
    if requested_idx != current_idx + 1:
        if requested_idx <= current_idx:
            return False, f"Cannot move backward from '{current_stage}' to '{requested_stage}'"
        expected = STAGE_ORDER[current_idx + 1]
        return False, f"Must advance to '{expected}', not '{requested_stage}'"

    return True, None


# ---------------------------------------------------------------------------
# Ban checking (unchanged from original)
# ---------------------------------------------------------------------------

BAN_CACHE_TTL = 60  # seconds


def invalidate_ban_cache(user_id):
    """Invalidate cached ban status. Call after banning/unbanning a user."""
    try:
        r = get_redis()
        r.delete(f"ban_status:{user_id}")
    except Exception:
        pass  # Redis failure shouldn't break moderation


def _check_ban_status(user_id):
    """Check if user is banned and handle temp ban expiry.

    Returns (is_banned, error_model) where is_banned is True if actively banned.
    Caches non-banned status in Redis for 60s to avoid DB queries on every request.
    """
    # Check Redis cache first
    try:
        r = get_redis()
        cached = r.get(f"ban_status:{user_id}")
        if cached == "not_banned":
            return False, None
    except Exception:
        pass  # Redis failure falls through to DB check

    user_info = db.execute_query("""
        SELECT status FROM users WHERE id = %s
    """, (user_id,), fetchone=True)

    if not user_info or user_info['status'] != 'banned':
        try:
            r = get_redis()
            r.setex(f"ban_status:{user_id}", BAN_CACHE_TTL, "not_banned")
        except Exception:
            pass
        return False, None

    # Check if there's a temp ban that has expired
    active_ban = db.execute_query("""
        SELECT mac.action_end_time
        FROM mod_action_target mat
        JOIN mod_action_class mac ON mat.mod_action_class_id = mac.id
        WHERE mat.user_id = %s AND mac.action IN ('permanent_ban', 'temporary_ban')
        ORDER BY mac.action_start_time DESC LIMIT 1
    """, (user_id,), fetchone=True)

    if active_ban and active_ban['action_end_time']:
        now = datetime.now(timezone.utc)
        if active_ban['action_end_time'].tzinfo is None:
            end_time = active_ban['action_end_time'].replace(tzinfo=timezone.utc)
        else:
            end_time = active_ban['action_end_time']
        if end_time < now:
            db.execute_query("UPDATE users SET status = 'active' WHERE id = %s", (user_id,))
            try:
                r = get_redis()
                r.setex(f"ban_status:{user_id}", BAN_CACHE_TTL, "not_banned")
            except Exception:
                pass
            return False, None

    return True, ErrorModel(403, "Your account has been suspended")
