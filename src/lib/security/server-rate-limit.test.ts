import { describe, expect, it, beforeEach } from "vitest";
import {
  callerKey,
  consumeRateLimit,
  resetServerRateLimits,
  tooManyRequests,
} from "./server-rate-limit";

describe("server rate limit", () => {
  beforeEach(() => resetServerRateLimits());

  it("allows up to the limit and then denies", () => {
    for (let i = 0; i < 3; i++) {
      expect(consumeRateLimit("k", 3, 60_000).allowed).toBe(true);
    }
    const denied = consumeRateLimit("k", 3, 60_000);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeGreaterThan(0);
  });

  it("keeps buckets isolated per key", () => {
    expect(consumeRateLimit("a", 1, 60_000).allowed).toBe(true);
    expect(consumeRateLimit("a", 1, 60_000).allowed).toBe(false);
    expect(consumeRateLimit("b", 1, 60_000).allowed).toBe(true);
  });

  it("recovers after the window elapses", () => {
    expect(consumeRateLimit("w", 1, 1).allowed).toBe(true);
    const start = Date.now();
    while (Date.now() - start < 5) {
      /* spin past the 1ms window */
    }
    expect(consumeRateLimit("w", 1, 1).allowed).toBe(true);
  });

  it("derives the caller key from proxy headers, never the body", () => {
    const req = new Request("https://x.test", {
      headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" },
    });
    expect(callerKey(req, "ai")).toBe("ai:203.0.113.7");
    expect(callerKey(new Request("https://x.test"), "ai")).toBe("ai:unknown");
  });

  it("returns a 429 with Retry-After", async () => {
    const res = tooManyRequests({ allowed: false, remaining: 0, retryAfter: 42 }, "slow down");
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(await res.json()).toEqual({ error: "slow down" });
  });
});
