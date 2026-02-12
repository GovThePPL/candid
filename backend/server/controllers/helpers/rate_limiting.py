"""Sliding-window rate limiting using Redis sorted sets."""

import time

from candid.controllers.helpers.redis_pool import get_redis

# Centralized rate limits: action -> (max_count, window_seconds)
RATE_LIMITS = {
    "login":           (10,  300),    # 10 per 5min per IP
    "register":        (5,   3600),   # 5 per hour per IP
    "report":          (10,  3600),   # 10 per hour per user (all report types share)
    "chat_request":    (10,  3600),   # 10 per hour per user
    "post_create":     (5,   3600),   # 5 per hour per user
    "position_create": (5,   3600),   # 5 per hour per user
    "comment_create":  (30,  3600),   # 30 per hour per user
    "vote":            (100, 3600),   # 100 per hour per user
}


def check_rate_limit(identifier, action, limit, window_seconds=3600):
    """Check if action is within rate limit.

    Uses a Redis ZSET sliding window. Each entry is timestamped;
    expired entries are pruned on every check.

    In dev mode, rate limiting is skipped entirely to avoid friction.

    Args:
        identifier: User UUID or IP address string.
        action: Action identifier (e.g. 'post_create', 'vote').
        limit: Max allowed actions in the window.
        window_seconds: Window duration in seconds (default 1 hour).

    Returns:
        (allowed: bool, count: int) — count is the current total
        including this request if allowed.
    """
    from candid.controllers import config
    if config.DEV:
        return True, 0

    r = get_redis()
    key = f"rate:{identifier}:{action}"
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


def check_rate_limit_for(identifier, action):
    """Look up limits from RATE_LIMITS and call check_rate_limit.

    Args:
        identifier: User UUID or IP address string.
        action: Action key from RATE_LIMITS dict.

    Returns:
        (allowed: bool, count: int)
    """
    limit, window = RATE_LIMITS[action]
    return check_rate_limit(identifier, action, limit, window)
