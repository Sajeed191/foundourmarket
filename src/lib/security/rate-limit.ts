/**
 * Shared client-side rate limiter (Security Hardening v1.0).
 *
 * Lightweight, dependency-free sliding-window limiter used to protect
 * high-volume anonymous analytics endpoints (e.g. badge events) from
 * accidental or malicious flooding. It is a first line of defence only —
 * it complements, never replaces, server/RLS protections.
 */

type Window = { hits: number[]; };

const buckets = new Map<string, Window>();

/**
 * Returns true when the action is allowed, false when the caller has exceeded
 * `limit` actions inside `windowMs` for the given key.
 */
export function allowAction(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return true;
}

/** Drops all counters (tests / sign-out hygiene). */
export function resetRateLimits() {
  buckets.clear();
}
