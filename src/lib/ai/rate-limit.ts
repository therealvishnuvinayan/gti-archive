type AiRateLimitInput = {
  key: string;
  limit: number;
  windowMs?: number;
};

type AiRateLimitBucket = {
  count: number;
  resetAt: number;
};

const DEFAULT_WINDOW_MS = 60_000;
const buckets = new Map<string, AiRateLimitBucket>();

export function checkAiRateLimit({
  key,
  limit,
  windowMs = DEFAULT_WINDOW_MS,
}: AiRateLimitInput) {
  const now = Date.now();

  for (const [bucketKey, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(bucketKey);
    }
  }

  const currentBucket = buckets.get(key);

  if (!currentBucket || currentBucket.resetAt <= now) {
    buckets.set(key, {
      count: 1,
      resetAt: now + windowMs,
    });

    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  }

  if (currentBucket.count >= limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((currentBucket.resetAt - now) / 1000),
      ),
    };
  }

  currentBucket.count += 1;

  return {
    allowed: true,
    retryAfterSeconds: 0,
  };
}
