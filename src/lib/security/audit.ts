/**
 * Lightweight security audit logging (Security Hardening v1.0).
 *
 * Records ONLY security-relevant events. Never log customer PII, tokens, or
 * request bodies. Best-effort: failures are swallowed so a logging problem can
 * never break a user flow.
 */
export type SecurityEvent =
  | "ai_unpublished_lookup_blocked"
  | "invalid_badge_event"
  | "permission_denied"
  | "rate_limit_exceeded"
  | "role_mismatch";

/** Console-level audit sink; intentionally minimal and PII-free. */
export function logSecurityEvent(
  event: SecurityEvent,
  meta: Record<string, string | number | boolean> = {},
) {
  try {
    // eslint-disable-next-line no-console
    console.warn(`[security] ${event}`, meta);
  } catch {
    /* never throw from audit logging */
  }
}
