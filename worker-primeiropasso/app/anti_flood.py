"""
Redis-based debouncing to prevent duplicate processing of rapid messages.
Same pattern as n8n Wait node.
"""
import redis
from app.config import get_settings

_redis: redis.Redis | None = None


def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(get_settings().REDIS_URL, decode_responses=True)
    return _redis


def should_process(phone: str) -> bool:
    """Returns True if this message should be processed (not flooded)."""
    r = get_redis()
    key = f"antiflood:{phone}"
    ttl = get_settings().ANTI_FLOOD_SECONDS
    if r.exists(key):
        r.expire(key, ttl)
        return False
    r.setex(key, ttl, "1")
    return True


def mark_processing_done(phone: str) -> None:
    get_redis().delete(f"antiflood:{phone}")
