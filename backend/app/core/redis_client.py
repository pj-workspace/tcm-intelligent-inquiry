"""Redis 异步客户端（会话缓存、限流等，健康检查会 ping）。"""

from functools import lru_cache

import redis.asyncio as redis


@lru_cache(maxsize=16)
def get_redis_for_url(redis_url: str) -> redis.Redis:
    """Return a cached async Redis client for ``redis_url``."""
    return redis.from_url(redis_url, decode_responses=True)


def get_redis() -> redis.Redis:
    """Return Redis client using ``Settings.redis_url``."""
    from app.core.config import get_settings

    return get_redis_for_url(get_settings().redis_url)


async def ping_redis() -> bool:
    """Health-check helper: ``PING`` the configured Redis instance."""
    r = get_redis()
    pong = await r.ping()
    return bool(pong)
