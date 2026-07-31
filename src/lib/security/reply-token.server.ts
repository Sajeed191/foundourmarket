/**
 * Secure support reply tokens (Enterprise Security Hardening v3.0).
 *
 * SERVER ONLY.
 *
 * Problem: `FOM-000123` ticket numbers are short and sequential, so a subject
 * line alone is a *claim*, never proof (finding `support_ticket_spoof`).
 *
 * This module adds an OPTIONAL cryptographic reply token appended to the ticket
 * reference:
 *
 *     FOM-000123            → legacy format, still accepted (identity-verified)
 *     FOM-000123.8f1a…      → tokenised format, HMAC-bound to the ticket
 *
 * Backward compatibility is absolute: existing tickets keep working, no
 * migration is required, and a missing secret simply disables token checks
 * (identity verification still applies).
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

export const TICKET_NUMBER_RE = /^FOM-\d{6}$/

export type TicketReference = {
  /** Canonical `FOM-XXXXXX` ticket number. */
  ticketNumber: string
  /** Reply token when the sender quoted the tokenised format. */
  token: string | null
}

/** Returns the configured signing secret, or null when tokens are disabled. */
function secret(): string | null {
  const s = process.env.SUPPORT_REPLY_TOKEN_SECRET || process.env.SUPPORT_INBOUND_SECRET
  return s && s.length >= 8 ? s : null
}

/** Deterministic per-ticket token. 16 hex chars ≈ 64 bits — ample for a reply id. */
export function replyToken(ticketNumber: string, signingSecret?: string | null): string | null {
  const key = signingSecret ?? secret()
  if (!key) return null
  return createHmac('sha256', key).update(`support-reply:${ticketNumber.toUpperCase()}`).digest('hex').slice(0, 16)
}

/** Reference string to embed in outbound support email subjects. */
export function buildReplyReference(ticketNumber: string): string {
  const t = replyToken(ticketNumber)
  return t ? `${ticketNumber.toUpperCase()}.${t}` : ticketNumber.toUpperCase()
}

/**
 * Extracts a ticket reference from a subject line. Accepts both the legacy and
 * the tokenised formats, with or without surrounding brackets.
 */
export function parseTicketReference(subject: string | undefined | null): TicketReference | null {
  if (!subject) return null
  const m = String(subject).match(/\[?(FOM-\d{6})(?:\.([A-Za-z0-9]{8,64}))?\]?/i)
  if (!m) return null
  return { ticketNumber: m[1].toUpperCase(), token: m[2] ? m[2].toLowerCase() : null }
}

export type TokenVerdict = 'valid' | 'invalid' | 'absent' | 'unavailable'

/** Timing-safe verification of a quoted reply token. */
export function verifyReplyToken(ticketNumber: string, token: string | null): TokenVerdict {
  if (!token) return 'absent'
  const expected = replyToken(ticketNumber)
  if (!expected) return 'unavailable'
  const a = Buffer.from(token.toLowerCase())
  const b = Buffer.from(expected)
  if (a.length !== b.length) return 'invalid'
  return timingSafeEqual(a, b) ? 'valid' : 'invalid'
}
