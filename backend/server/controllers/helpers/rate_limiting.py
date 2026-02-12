"""Sliding-window rate limiting using Redis sorted sets."""

import time

from candid.controllers.helpers.redis_pool import get_redis


def check_rate_limit(user_id, action, limit, window_seconds=3600):
    """Check if action is within rate limit.

    Uses a Redis ZSET sliding window. Each entry is timestamped;
    expired entries are pruned on every check.

    Args:
        user_id: User UUID string.
        action: Action identifier (e.g. 'post_create', 'vote').
        limit: Max allowed actions in the window.
        window_seconds: Window duration in seconds (default 1 hour).

    Returns:
        (allowed: bool, count: int) — count is the current total
        including this request if allowed.
    """
    r = get_redis()
    key = f"rate:{user_id}:{action}"
    now = time.time()
    cutoff = now - window_seconds

    pipe = r.pipeline()
    pipe.zremrangebyscore(key, 0, cutoff)   # prune expired
    pipe.zcard(key)                          # current count
    pipe.zadd(key, {str(now): now})          # optimistic add
    pipe.expire(key, window_seconds + 60)    # auto-cleanup
    results = pipe.execute()

    count = results[1]  # count BEFORE adding current
    if count >= limit:
        # Over limit — remove the optimistic add
        r.zrem(key, str(now))
        return False, count
    return True, count + 1
