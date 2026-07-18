import type { MiddlewareHandler } from "hono";
import { redisClient } from "../queue";

const TOKEN_BUCKET_SCRIPT = `
  local key = KEYS[1]
  local capacity = tonumber(ARGV[1])
  local refillRate = tonumber(ARGV[2])
  local now = tonumber(ARGV[3])

  local bucket = redis.call('HMGET', key, 'tokens', 'lastRefill')
  local tokens = tonumber(bucket[1]) or capacity
  local lastRefill = tonumber(bucket[2]) or now

  -- Calculate tokens to add based on elapsed time
  local elapsed = math.max(0, now - lastRefill)
  local tokensToAdd = math.floor(elapsed * refillRate)

  if tokensToAdd > 0 then
    tokens = math.min(capacity, tokens + tokensToAdd)
    lastRefill = now
  end

  if tokens >= 1 then
    tokens = tokens - 1
    redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
    redis.call('EXPIRE', key, 60) -- Cleanup keys after 60 seconds of inactivity
    return {1, tokens}
  else
    redis.call('HMSET', key, 'tokens', tokens, 'lastRefill', lastRefill)
    return {0, tokens}
  end
`;

export const rateLimitMiddleware: MiddlewareHandler = async (c, next) => {
  const tenantId = c.get("tenantId") as string;

  const rateLimitKey = `rate_limit:${tenantId}`;

  const CAPACITY = 500;
  const REFILL_RATE_PER_SEC = 100;
  const now = Math.floor(Date.now() / 1000);

  const result = (await redisClient.eval(
    TOKEN_BUCKET_SCRIPT,
    1,
    rateLimitKey,
    CAPACITY,
    REFILL_RATE_PER_SEC,
    now,
  )) as [number, number];

  const [allowed, remainingTokens] = result;

  c.header("X-RateLimit-Limit", String(CAPACITY));
  c.header("X-RateLimit-Remaining", String(remainingTokens));

  if (allowed === 0) {
    return c.json({ error: "Too Many Requests", retryAfter: 1 }, 429);
  }

  await next();
};
