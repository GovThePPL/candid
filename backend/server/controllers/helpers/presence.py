"""
Redis-based presence tracking for chat matching.

Tracks two presence states:
- "swiping": user is actively on the card queue (45s TTL, refreshed by swipe API calls)
- "in_app": user is in the app but on other pages (60s TTL, refreshed by heartbeat)
"""

from .redis_pool import get_redis

# Key prefixes
SWIPING_PREFIX = "presence:swiping:"
IN_APP_PREFIX = "presence:in_app:"

# TTLs in seconds
SWIPING_TTL = 45
IN_APP_TTL = 60


def record_swiping(user_id: str):
    """Record that a user is actively swiping cards. Sets both swiping and in_app keys."""
    try:
        r = get_redis()
        pipe = r.pipeline()
        pipe.setex(f"{SWIPING_PREFIX}{user_id}", SWIPING_TTL, "1")
        pipe.setex(f"{IN_APP_PREFIX}{user_id}", IN_APP_TTL, "1")
        pipe.execute()
    except Exception as e:
        print(f"Error recording swiping presence: {e}")


def record_heartbeat(user_id: str):
    """Record that a user is in the app (not necessarily swiping)."""
    try:
        r = get_redis()
        r.setex(f"{IN_APP_PREFIX}{user_id}", IN_APP_TTL, "1")
    except Exception as e:
        print(f"Error recording heartbeat presence: {e}")


def is_user_swiping(user_id: str) -> bool:
    """Check if a single user is currently swiping."""
    try:
        r = get_redis()
        result = r.exists(f"{SWIPING_PREFIX}{user_id}")
        return bool(result)
    except Exception as e:
        print(f"Error checking swiping presence: {e}")
        return False


def is_user_in_app(user_id: str) -> bool:
    """Check if a single user is currently in the app."""
    try:
        r = get_redis()
        result = r.exists(f"{IN_APP_PREFIX}{user_id}")
        return bool(result)
    except Exception as e:
        print(f"Error checking in_app presence: {e}")
        return False


def get_swiping_users(user_ids: list) -> set:
    """Batch check which users are currently swiping. Returns set of user_id strings."""
    if not user_ids:
        return set()
    try:
        r = get_redis()
        pipe = r.pipeline()
        for uid in user_ids:
            pipe.exists(f"{SWIPING_PREFIX}{uid}")
        results = pipe.execute()
        return {uid for uid, exists in zip(user_ids, results) if exists}
    except Exception as e:
        print(f"Error batch checking swiping presence: {e}")
        return set()


def get_in_app_users(user_ids: list) -> set:
    """Batch check which users are currently in the app. Returns set of user_id strings."""
    if not user_ids:
        return set()
    try:
        r = get_redis()
        pipe = r.pipeline()
        for uid in user_ids:
            pipe.exists(f"{IN_APP_PREFIX}{uid}")
        results = pipe.execute()
        return {uid for uid, exists in zip(user_ids, results) if exists}
    except Exception as e:
        print(f"Error batch checking in_app presence: {e}")
        return set()
