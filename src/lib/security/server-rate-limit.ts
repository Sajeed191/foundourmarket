/**
 * Server-side sliding-window rate limiter (Enterprise Security Program v2.0).
 *
 * SERVER ONLY. Used to protect expensive or abusable public endpoints
 * (AI gateway calls, inbound webhooks) from scripted abuse and cost
 * exhaustion.
 *
 * Scope & honesty: state is in-memory and therefore per-worker-instance. It is
 * a cheap, zero-latency first line of defence that stops scripted floods from a
 * single client; it is NOT a distributed quota. Anything requiring hard
 * guarantees must additionally be enforced in the database / RLS layer.
 */

type Bucket = { hits: number[] };

const buckets = new Map<string, Bucket>();
/** Hard cap on tracked keys so a rotating-IP flood cannot grow memory. */
const MAX_KEYS = 5_000;

export type RateLimitResult = {
  allowed: boolean;
  /** Remaining actions in the current window (never negative). */
  remaining: number;
  /** Seconds until the caller may retry (0 when allowed). */
  retryAfter: number;
};

/**
 * Consume one token for `key`. Returns whether the action is allowed plus
 * retry metadata suitable for a 429 response.
 */
export function consumeRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  if (buckets.size > MAX_KEYS) {
    // Cheap eviction: drop fully-expired buckets, then oldest keys if needed.
    for (const [k, b] of buckets) {
      if (b.hits.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
    while (buckets.size > MAX_KEYS) {
      const oldest = buckets.keys().next().value as string | undefined;
      if (!oldest) break;
      buckets.delete(oldest);
    }
  }

  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    const oldest = bucket.hits[0] ?? now;
    return {
      allowed: false,
      remaining: 0,
      retryAfter: Math.max(1, Math.ceil((windowMs - (now - oldest)) / 1000)),
    };
  }

  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { allowed: true, remaining: Math.max(0, limit - bucket.hits.length), retryAfter: 0 };
}

/** Best-effort caller identity from proxy headers. Never trusts request body. */
export function callerKey(request: Request, prefix: string): string {
  const h = request.headers;
  const ip =
    h.get("cf-connecting-ip") ??
    h.get("x-real-ip") ??
    (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() ??
    "";
  return `${prefix}:${ip || "unknown"}`;
}

/** Standard 429 response with Retry-After. */
export function tooManyRequests(result: RateLimitResult, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(result.retryAfter),
      "Cache-Control": "no-store",
    },
  });
}

/** Test helper — clears all counters. */
export function resetServerRateLimits() {
  buckets.clear();
}
