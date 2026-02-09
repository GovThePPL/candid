from datetime import datetime, timezone

from candid.models.user import User
from candid.models.error_model import ErrorModel
from candid.controllers import config, db
from candid.controllers.helpers.redis_pool import get_redis

_USER_ROLE_RANKING = {
    "guest": 1,
    "normal": 10,
    "moderator": 20,
    "admin": 30,
}

def get_user_type(user_id):
    ret = db.execute_query("""
        SELECT user_type
        FROM users
        WHERE id = %s
    """,
    (user_id,), fetchone=True)

    if ret:
        return ret["user_type"]
    else:
        return None

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
        # If cached == "banned" or cache miss, check DB
    except Exception:
        pass  # Redis failure falls through to DB check

    user_info = db.execute_query("""
        SELECT status FROM users WHERE id = %s
    """, (user_id,), fetchone=True)

    if not user_info or user_info['status'] != 'banned':
        # Cache non-banned status
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
            # Temp ban expired, restore user
            db.execute_query("UPDATE users SET status = 'active' WHERE id = %s", (user_id,))
            try:
                r = get_redis()
                r.setex(f"ban_status:{user_id}", BAN_CACHE_TTL, "not_banned")
            except Exception:
                pass
            return False, None

    return True, ErrorModel(403, "Your account has been suspended")


def authorization(required_level, token_info=None):
    if not token_info:
        return False, ErrorModel(401, "Authentication Required")
    user_id = token_info['sub']
    user_type = get_user_type(user_id)
    if user_type is None:
        return False, ErrorModel(401, "User not found")
    if _USER_ROLE_RANKING[user_type] < _USER_ROLE_RANKING[required_level]:
        return False, ErrorModel(403, "Unauthorized")

    # Check ban status
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
    if _USER_ROLE_RANKING[user_type] >= _USER_ROLE_RANKING[required_level]:
        return True, None
    else:
        return False, ErrorModel(403, "Unauthorized")
