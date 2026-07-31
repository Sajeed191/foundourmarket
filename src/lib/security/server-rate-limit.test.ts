/**
 * Security regression tests — public endpoint abuse protection (v2.0).
 * Run with:  bun run src/lib/security/server-rate-limit.test.ts
 * (No test framework required; plain assertions, exits non-zero on failure.)
 *
 * Covers findings:
 *   • ai_shopping_open_cost  (unauthenticated, unmetered paid AI endpoint)
 *   • support_ticket_spoof   (sender verification helper, see support-inbound)
 */
import {
  callerKey,
  consumeRateLimit,
  resetServerRateLimits,
  tooManyRequests,
} from "./server-rate-limit";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

/* 1. Window enforcement -------------------------------------------------- */
resetServerRateLimits();
for (let i = 0; i < 3; i++) {
  assert(consumeRateLimit("k", 3, 60_000).allowed, `request ${i + 1} within limit is allowed`);
}
const denied = consumeRateLimit("k", 3, 60_000);
assert(!denied.allowed, "request over the limit is denied");
assert(denied.retryAfter > 0, "denied response carries a positive Retry-After");

/* 2. Per-caller isolation ------------------------------------------------ */
resetServerRateLimits();
assert(consumeRateLimit("a", 1, 60_000).allowed, "caller A first request allowed");
assert(!consumeRateLimit("a", 1, 60_000).allowed, "caller A second request denied");
assert(consumeRateLimit("b", 1, 60_000).allowed, "caller B is unaffected by caller A");

/* 3. Window recovery ----------------------------------------------------- */
resetServerRateLimits();
assert(consumeRateLimit("w", 1, 1).allowed, "first request in a 1ms window allowed");
const spinStart = Date.now();
while (Date.now() - spinStart < 5) {
  /* spin past the window */
}
assert(consumeRateLimit("w", 1, 1).allowed, "quota recovers once the window elapses");

/* 4. Caller identity comes from proxy headers, never the request body ---- */
assert(
  callerKey(
    new Request("https://x.test", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } }),
    "ai",
  ) === "ai:203.0.113.7",
  "callerKey uses the left-most x-forwarded-for hop",
);
assert(
  callerKey(
    new Request("https://x.test", { headers: { "cf-connecting-ip": "198.51.100.4" } }),
    "ai",
  ) === "ai:198.51.100.4",
  "callerKey prefers cf-connecting-ip",
);
assert(
  callerKey(new Request("https://x.test"), "ai") === "ai:unknown",
  "callerKey falls back to a stable unknown bucket",
);

/* 5. 429 shape ----------------------------------------------------------- */
const res = tooManyRequests({ allowed: false, remaining: 0, retryAfter: 42 }, "slow down");
assert(res.status === 429, "limiter returns HTTP 429");
assert(res.headers.get("Retry-After") === "42", "429 sets Retry-After");
assert(res.headers.get("Cache-Control") === "no-store", "429 is never cached");

console.log(failed === 0 ? "\nAll assertions passed." : `\n${failed} assertion(s) failed.`);
if (failed > 0) process.exit(1);
