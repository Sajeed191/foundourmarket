/**
 * AI endpoint abuse guard (Enterprise Security Hardening v3.0).
 *
 * SERVER ONLY. Protects the public `/api/ai-shopping` endpoint against cost
 * exhaustion (finding `ai_shopping_open_cost`) WITHOUT requiring login.
 *
 * Layered protection (all in-memory, zero database work, sub-millisecond):
 *   1. IP rate limiter                  — burst floods
 *   2. Visitor/session limiter          — one browser hammering from many IPs
 *   3. Conversation limiter             — a single thread looping
 *   4. Daily per-caller request budget  — sustained abuse
 *   5. Global emergency budget          — platform-wide credit protection
 *   6/7. Prompt + history size caps     — enforced by the route
 *   8. Tool iteration cap               — enforced by the route
 *   9. Response token cap               — enforced by the route
 *  10. Automatic cooldown               — after repeated denials
 *
 * Honesty about scope: state is per worker instance. This is a cheap first line
 * of defence, not a distributed quota. Hard guarantees belong in the database.
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { consumeRateLimit, type RateLimitResult } from './server-rate-limit'

/* ─── Tunables (never exposed to clients) ─────────────────────────────── */
export const AI_LIMITS = {
  ipPerMinute: 20,
  visitorPerMinute: 12,
  conversationPerMinute: 10,
  dailyPerCaller: 300,
  globalDaily: 20_000,
  cooldownAfterDenials: 5,
  cooldownMs: 5 * 60_000,
  duplicatePromptWindowMs: 60_000,
  duplicatePromptLimit: 4,
  maxPayloadBytes: 64 * 1024,
} as const

const DAY_MS = 24 * 60 * 60 * 1000
const TOKEN_MAX_AGE_MS = 30 * DAY_MS

/* ─── Ephemeral state ─────────────────────────────────────────────────── */
type DailyCounter = { day: number; count: number }
const dailyByCaller = new Map<string, DailyCounter>()
const globalDaily: DailyCounter = { day: 0, count: 0 }
const denials = new Map<string, { count: number; until: number }>()
const promptHits = new Map<string, number[]>()
const MAX_KEYS = 5_000

function today(now: number) {
  return Math.floor(now / DAY_MS)
}

function trim<T>(map: Map<string, T>) {
  if (map.size <= MAX_KEYS) return
  const excess = map.size - MAX_KEYS
  let i = 0
  for (const k of map.keys()) {
    map.delete(k)
    if (++i >= excess) break
  }
}

/* ─── Visitor token (signed, no login) ────────────────────────────────── */
let ephemeralSecret: string | null = null
function tokenSecret(): string {
  const env = process.env.AI_VISITOR_TOKEN_SECRET
  if (env && env.length >= 8) return env
  if (!ephemeralSecret) ephemeralSecret = randomBytes(32).toString('hex')
  return ephemeralSecret
}

function sign(payload: string): string {
  return createHmac('sha256', tokenSecret()).update(payload).digest('hex').slice(0, 32)
}

/** Issues a lightweight signed visitor token. No PII, no login required. */
export function issueVisitorToken(now = Date.now()): string {
  const payload = `${randomBytes(9).toString('hex')}.${now}`
  return `${payload}.${sign(payload)}`
}

export type VisitorVerdict = { valid: boolean; id: string | null; reason?: 'absent' | 'malformed' | 'forged' | 'expired' }

/** Validates a visitor token. Absent tokens are allowed (IP-only protection). */
export function verifyVisitorToken(token: string | null | undefined, now = Date.now()): VisitorVerdict {
  if (!token) return { valid: false, id: null, reason: 'absent' }
  const parts = String(token).split('.')
  if (parts.length !== 3) return { valid: false, id: null, reason: 'malformed' }
  const [id, tsRaw, sig] = parts
  const ts = Number(tsRaw)
  if (!/^[a-f0-9]{18}$/.test(id) || !Number.isFinite(ts)) return { valid: false, id: null, reason: 'malformed' }
  const expected = sign(`${id}.${tsRaw}`)
  const a = Buffer.from(sig)
  const b = Buffer.from(expected)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, id: null, reason: 'forged' }
  if (now - ts > TOKEN_MAX_AGE_MS) return { valid: false, id: null, reason: 'expired' }
  return { valid: true, id }
}

/* ─── Decision engine ─────────────────────────────────────────────────── */
export type AiGuardInput = {
  /** Stable caller key (usually derived from proxy headers). */
  callerKey: string
  /** Verified visitor id, when the client presented a valid token. */
  visitorId?: string | null
  /** Stable conversation identifier, when the client provides one. */
  conversationId?: string | null
  /** Hash/fingerprint of the latest user prompt (never the prompt itself). */
  promptFingerprint?: string | null
  /** Raw request body size in bytes. */
  payloadBytes?: number
  /** User-Agent, used only for coarse bot signature detection. */
  userAgent?: string | null
  now?: number
}

export type AiGuardDecision =
  | { allowed: true; degraded: false }
  /** Budget exhausted — serve a lightweight non-LLM fallback instead of 429. */
  | { allowed: true; degraded: true; reason: 'budget_exceeded' }
  | {
      allowed: false
      degraded: false
      reason: 'rate_limit' | 'abuse_detected' | 'cooldown' | 'payload_too_large'
      rate: RateLimitResult
    }

const BOT_UA = /(curl|wget|python-requests|httpie|axios\/|go-http-client|scrapy|libwww|okhttp|postman)/i

function denial(key: string, now: number, retryAfter: number): RateLimitResult {
  const rec = denials.get(key) ?? { count: 0, until: 0 }
  rec.count += 1
  if (rec.count >= AI_LIMITS.cooldownAfterDenials) rec.until = now + AI_LIMITS.cooldownMs
  denials.set(key, rec)
  trim(denials)
  return { allowed: false, remaining: 0, retryAfter }
}

/** Runs every protection layer. Pure decision — the route owns the response. */
export function evaluateAiRequest(input: AiGuardInput): AiGuardDecision {
  const now = input.now ?? Date.now()
  const caller = input.callerKey

  // Layer 10 — active cooldown after repeated denials.
  const cooling = denials.get(caller)
  if (cooling && cooling.until > now) {
    return {
      allowed: false,
      degraded: false,
      reason: 'cooldown',
      rate: { allowed: false, remaining: 0, retryAfter: Math.ceil((cooling.until - now) / 1000) },
    }
  }

  // Payload size.
  if ((input.payloadBytes ?? 0) > AI_LIMITS.maxPayloadBytes) {
    return { allowed: false, degraded: false, reason: 'payload_too_large', rate: denial(caller, now, 30) }
  }

  // Bot signatures — cheap heuristic, only denies obvious scripted clients.
  if (input.userAgent && BOT_UA.test(input.userAgent)) {
    return { allowed: false, degraded: false, reason: 'abuse_detected', rate: denial(caller, now, 60) }
  }

  // Layer 1 — IP.
  const ip = consumeRateLimit(`${caller}:ip`, AI_LIMITS.ipPerMinute, 60_000)
  if (!ip.allowed) return { allowed: false, degraded: false, reason: 'rate_limit', rate: denial(caller, now, ip.retryAfter) }

  // Layer 2 — visitor/session.
  if (input.visitorId) {
    const v = consumeRateLimit(`ai:v:${input.visitorId}`, AI_LIMITS.visitorPerMinute, 60_000)
    if (!v.allowed) return { allowed: false, degraded: false, reason: 'rate_limit', rate: denial(caller, now, v.retryAfter) }
  }

  // Layer 3 — conversation.
  if (input.conversationId) {
    const c = consumeRateLimit(`ai:c:${input.conversationId}`, AI_LIMITS.conversationPerMinute, 60_000)
    if (!c.allowed) return { allowed: false, degraded: false, reason: 'rate_limit', rate: denial(caller, now, c.retryAfter) }
  }

  // Prompt flooding — repeated identical prompts.
  if (input.promptFingerprint) {
    const key = `${caller}:${input.promptFingerprint}`
    const hits = (promptHits.get(key) ?? []).filter((t) => now - t < AI_LIMITS.duplicatePromptWindowMs)
    hits.push(now)
    promptHits.set(key, hits)
    trim(promptHits)
    if (hits.length > AI_LIMITS.duplicatePromptLimit) {
      return { allowed: false, degraded: false, reason: 'abuse_detected', rate: denial(caller, now, 60) }
    }
  }

  // Layer 4 — daily per-caller budget.
  const day = today(now)
  const perCaller = dailyByCaller.get(caller)
  const counter = perCaller && perCaller.day === day ? perCaller : { day, count: 0 }
  counter.count += 1
  dailyByCaller.set(caller, counter)
  trim(dailyByCaller)
  if (counter.count > AI_LIMITS.dailyPerCaller) {
    return { allowed: false, degraded: false, reason: 'rate_limit', rate: denial(caller, now, 3600) }
  }

  // Layer 5 — global emergency budget → graceful degradation, never an outage.
  if (globalDaily.day !== day) {
    globalDaily.day = day
    globalDaily.count = 0
  }
  globalDaily.count += 1
  if (globalDaily.count > AI_LIMITS.globalDaily) {
    return { allowed: true, degraded: true, reason: 'budget_exceeded' }
  }

  // Successful request clears the denial streak.
  denials.delete(caller)
  return { allowed: true, degraded: false }
}

/** Stable, PII-free fingerprint of a prompt (never stores the text itself). */
export function promptFingerprint(text: string): string {
  return createHmac('sha256', 'fom-prompt-fp').update(text.trim().toLowerCase()).digest('hex').slice(0, 16)
}

/** Test helper — clears all guard state. */
export function resetAiGuard() {
  dailyByCaller.clear()
  denials.clear()
  promptHits.clear()
  globalDaily.day = 0
  globalDaily.count = 0
}
