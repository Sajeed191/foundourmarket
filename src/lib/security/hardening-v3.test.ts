/**
 * Security regression tests — Enterprise Security Hardening v3.0.
 * Run with:  bun run src/lib/security/hardening-v3.test.ts
 *
 * Covers findings:
 *   • support_ticket_spoof   (secure reply tokens, reference parsing)
 *   • ai_shopping_open_cost  (layered abuse guard, visitor tokens, budgets)
 */
process.env.SUPPORT_REPLY_TOKEN_SECRET ||= "test-support-secret-value";
process.env.AI_VISITOR_TOKEN_SECRET ||= "test-visitor-secret-value";

import {
  buildReplyReference,
  parseTicketReference,
  replyToken,
  verifyReplyToken,
} from "./reply-token.server";
import {
  AI_LIMITS,
  evaluateAiRequest,
  issueVisitorToken,
  promptFingerprint,
  resetAiGuard,
  verifyVisitorToken,
} from "./ai-abuse-guard.server";
import { resetServerRateLimits } from "./server-rate-limit";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

/* ── Reply tokens: backward compatibility ──────────────────────────────── */
assert(parseTicketReference("Re: [FOM-000123] Order help")?.ticketNumber === "FOM-000123", "legacy ticket id still parses");
assert(parseTicketReference("Re: [FOM-000123] Order help")?.token === null, "legacy ticket id carries no token");

const ref = buildReplyReference("FOM-000123");
const parsed = parseTicketReference(`Re: [${ref}] Order help`);
assert(parsed?.ticketNumber === "FOM-000123", "tokenised reference yields the same ticket number");
assert(parsed?.token === replyToken("FOM-000123"), "tokenised reference round-trips the token");
assert(parseTicketReference("Re: no reference here") === null, "unrelated subjects parse to null");
assert(parseTicketReference("Re: FOM-12 broken") === null, "malformed ticket ids are rejected");

/* ── Reply tokens: verification ────────────────────────────────────────── */
assert(verifyReplyToken("FOM-000123", parsed?.token ?? null) === "valid", "correct token verifies");
assert(verifyReplyToken("FOM-000123", "0000000000000000") === "invalid", "forged token is rejected");
assert(verifyReplyToken("FOM-000999", parsed?.token ?? null) === "invalid", "token is bound to its own ticket");
assert(verifyReplyToken("FOM-000123", null) === "absent", "missing token falls back to identity checks");

/* ── Visitor tokens ────────────────────────────────────────────────────── */
const vt = issueVisitorToken();
assert(verifyVisitorToken(vt).valid, "freshly issued visitor token is valid");
assert(verifyVisitorToken(`${vt}x`).valid === false, "tampered visitor token is rejected");
assert(verifyVisitorToken("a.b.c").valid === false, "garbage visitor token is rejected");
assert(verifyVisitorToken(null).reason === "absent", "absent visitor token is reported, not fatal");
assert(
  verifyVisitorToken(issueVisitorToken(Date.now() - 60 * 24 * 60 * 60 * 1000)).reason === "expired",
  "stale visitor token expires",
);

/* ── Layer 1: IP rate limit ────────────────────────────────────────────── */
resetAiGuard();
resetServerRateLimits();
for (let i = 0; i < AI_LIMITS.ipPerMinute; i++) {
  assert(evaluateAiRequest({ callerKey: "ai:1.1.1.1", promptFingerprint: `p${i}` }).allowed, `IP request ${i + 1} allowed`);
}
const overIp = evaluateAiRequest({ callerKey: "ai:1.1.1.1", promptFingerprint: "px" });
assert(!overIp.allowed && overIp.reason === "rate_limit", "IP burst beyond the limit is denied");

/* ── Layer 2: visitor limiter ──────────────────────────────────────────── */
resetAiGuard();
resetServerRateLimits();
for (let i = 0; i < AI_LIMITS.visitorPerMinute; i++) {
  evaluateAiRequest({ callerKey: `ai:2.2.2.${i}`, visitorId: "v1", promptFingerprint: `q${i}` });
}
const overVisitor = evaluateAiRequest({ callerKey: "ai:2.2.2.99", visitorId: "v1", promptFingerprint: "qz" });
assert(!overVisitor.allowed, "one visitor rotating IPs is still limited");

/* ── Prompt flooding ───────────────────────────────────────────────────── */
resetAiGuard();
resetServerRateLimits();
const fp = promptFingerprint("  Best Headphones  ");
assert(fp === promptFingerprint("best headphones"), "prompt fingerprint is normalized and stable");
let floodDenied = false;
for (let i = 0; i <= AI_LIMITS.duplicatePromptLimit; i++) {
  const d = evaluateAiRequest({ callerKey: "ai:3.3.3.3", promptFingerprint: fp });
  if (!d.allowed) floodDenied = d.reason === "abuse_detected";
}
assert(floodDenied, "repeated identical prompts are flagged as abuse");

/* ── Bot signatures & payload caps ─────────────────────────────────────── */
resetAiGuard();
resetServerRateLimits();
const bot = evaluateAiRequest({ callerKey: "ai:4.4.4.4", userAgent: "python-requests/2.31" });
assert(!bot.allowed && bot.reason === "abuse_detected", "obvious bot signature is denied");
const big = evaluateAiRequest({ callerKey: "ai:5.5.5.5", payloadBytes: AI_LIMITS.maxPayloadBytes + 1 });
assert(!big.allowed && big.reason === "payload_too_large", "oversized payload is denied");
assert(
  evaluateAiRequest({ callerKey: "ai:6.6.6.6", userAgent: "Mozilla/5.0 (iPhone)" }).allowed,
  "a normal shopper's browser is unaffected",
);

/* ── Layer 10: cooldown after repeated denials ─────────────────────────── */
resetAiGuard();
resetServerRateLimits();
for (let i = 0; i < AI_LIMITS.cooldownAfterDenials; i++) {
  evaluateAiRequest({ callerKey: "ai:7.7.7.7", userAgent: "curl/8.0" });
}
const cooled = evaluateAiRequest({ callerKey: "ai:7.7.7.7", userAgent: "Mozilla/5.0" });
assert(!cooled.allowed && cooled.reason === "cooldown", "repeat offender enters automatic cooldown");
assert(!cooled.allowed && cooled.rate.retryAfter > 0, "cooldown response carries Retry-After");

/* ── Graceful behaviour for legitimate traffic ─────────────────────────── */
resetAiGuard();
resetServerRateLimits();
assert(
  evaluateAiRequest({ callerKey: "ai:8.8.8.8", visitorId: verifyVisitorToken(issueVisitorToken()).id, conversationId: "c1", promptFingerprint: promptFingerprint("hello") }).allowed,
  "a normal guest shopper request passes every layer",
);

console.log(failed === 0 ? "\nAll assertions passed." : `\n${failed} assertion(s) failed.`);
if (failed > 0) process.exit(1);
