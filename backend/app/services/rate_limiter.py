import math
import time
from uuid import uuid4

from fastapi import HTTPException, Request
from redis.asyncio import Redis

from app.config import settings

_SCRIPT = """
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ARGV[2])
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[3]) then
  local oldest = redis.call('ZRANGE', KEYS[1], 0, 0, 'WITHSCORES')
  if oldest[2] then
    return {0, oldest[2]}
  end
  return {0, 0}
end
redis.call('ZADD', KEYS[1], ARGV[1], ARGV[5])
redis.call('EXPIRE', KEYS[1], ARGV[4])
return {1, 0}
"""

_redis_client: Redis | None = None


def get_redis_client() -> Redis:
    global _redis_client
    if _redis_client is None:
        _redis_client = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    return _redis_client


def get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimitDependency:
    def __init__(self, scope: str, limit: int, window_seconds: int) -> None:
        self.scope = scope
        self.limit = limit
        self.window_seconds = window_seconds

    async def __call__(self, request: Request) -> None:
        redis = get_redis_client()
        now = time.time()
        window_start = now - self.window_seconds
        ip_address = get_client_ip(request)
        key = f"rate_limit:{self.scope}:{ip_address}"
        member = f"{now}:{uuid4()}"

        allowed, oldest_score = await redis.eval(
            _SCRIPT,
            1,
            key,
            now,
            window_start,
            self.limit,
            self.window_seconds,
            member,
        )

        if int(allowed) == 1:
            return

        retry_after = self.window_seconds
        if float(oldest_score) > 0:
            retry_after = max(
                1,
                math.ceil(float(oldest_score) + self.window_seconds - now),
            )

        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded for {self.scope}",
            headers={"Retry-After": str(retry_after)},
        )


upload_rate_limit = RateLimitDependency("upload", 10, 3600)
generation_rate_limit = RateLimitDependency("generation", 50, 3600)
