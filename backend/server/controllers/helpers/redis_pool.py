"""
Shared Redis connection pool.

All Redis consumers should use get_redis() from this module instead of
creating their own connections. Pooled connections are returned automatically
when the Redis object goes out of scope — do NOT call r.close().
"""

import os
import redis

_pool = None


def get_redis():
    """Get a Redis client backed by a shared connection pool."""
    global _pool
    if _pool is None:
        redis_url = os.environ.get('REDIS_URL', 'redis://redis:6379')
        max_connections = int(os.environ.get('REDIS_POOL_MAX', 20))
        _pool = redis.ConnectionPool.from_url(
            redis_url, max_connections=max_connections, decode_responses=True
        )
    return redis.Redis(connection_pool=_pool)
