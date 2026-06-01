import os
from redis import Redis
from rq import Queue

redis_url = os.getenv("REDIS_URL")
if not redis_url:
    rest_url = os.getenv("UPSTASH_REDIS_REST_URL", "")
    rest_token = os.getenv("UPSTASH_REDIS_REST_TOKEN", "")
    if rest_url and rest_token:
        # Extract host (e.g. fresh-leech-137039.upstash.io)
        host = rest_url.replace("https://", "").replace("http://", "")
        redis_url = f"rediss://default:{rest_token}@{host}:6379"
    else:
        redis_url = "redis://localhost:6379"

print(f"Connecting background queue worker to: {redis_url.split('@')[-1] if '@' in redis_url else redis_url}")
redis_conn = Redis.from_url(redis_url)
queue = Queue("ml-tasks", connection=redis_conn)
