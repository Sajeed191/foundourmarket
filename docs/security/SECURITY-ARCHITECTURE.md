# FoundOurMarket™ Security Architecture (Enterprise Security Program v2.0)

Status: **binding**. Every future feature must comply. A change that weakens
any rule below fails review and must state the reason before it can be merged.

## 1. Non-negotiable principles

1. **Security by default** — a new surface is closed until it is explicitly opened.
2. **Deny by default** — RLS enabled on every `public` table; no policy = no access.
3. **Least privilege** — the narrowest role, the narrowest column projection.
4. **Defense in depth** — client checks are UX only; the server and RLS decide.
5. **Zero trust between layers** — a server function re-verifies roles even when
   the UI already hid the button (`requireStaff` in `src/lib/admin-guard.server.ts`).
6. **Input validation first, output encoding always** — never `dangerouslySetInnerHTML`
   with user or model content.
7. **Minimal data exposure** — never `select("*")` on a table holding PII.
8. **Encrypt sensitive data at rest** — see refund bank details (AES-256-GCM).
9. **Audit everything privileged** — `security_audit_log` + `logSecurityEvent`.
10. **No security regressions** — every hardening ships with a regression test.

## 2. Trust tiers

| Tier | Identity | Data reachable |
| --- | --- | --- |
| Anonymous | none | published catalog, public CMS, public realtime topics only |
| Customer | Supabase session | own orders, addresses, tickets, wishlist, reviews |
| Staff | `user_roles` role | operational data for their role |
| Super admin | `super_admin` | role grants, resets, destructive operations |
| Service role | server only | everything — **never** reachable from client code |

## 3. Client-boundary rules

- `@/integrations/supabase/client.server` (service role, RLS-bypassing) is
  imported **inside handlers only**, never at module scope of a `*.functions.ts`
  or route file.
- Any customer-facing read of `public.products` through the service-role client
  MUST go through `getPublicCatalogQuery()` (`src/lib/security/catalog-access.ts`).
  See `docs/security/ai-catalog-security.md`.
- Secrets are read via `process.env` inside handlers. Never `VITE_`-prefixed.

## 4. Public endpoints (`src/routes/api/public/*`, `src/routes/api/*`)

Every public handler must, in this order:

1. **Meter** — `consumeRateLimit(callerKey(request, "<endpoint>"), limit, windowMs)`
   from `src/lib/security/server-rate-limit.ts`, returning `tooManyRequests()`.
2. **Authenticate the caller** — bearer token, or an HMAC signature over the raw
   body with a timing-safe compare for webhooks.
3. **Validate input** — shape, type, and hard length/size caps.
4. **Authorize the object** — never trust an identifier in the body to imply
   ownership (see §5).
5. **Log security-relevant outcomes** — `logSecurityEvent`.

Current metered endpoints: `/api/ai-shopping` (20 req/min/IP, 4k chars per
message, 24k chars per conversation).

Note on scope: the in-memory limiter is per worker instance — a cheap first line
of defence against scripted floods, not a distributed quota. Hard guarantees
belong in the database.

## 5. Object authorization (anti-IDOR)

A reference that arrives from outside (ticket number, order id, slug, token) is
a **claim**, not proof. Before any read or write on the referenced object, prove
the caller owns it.

Reference implementation: `senderOwnsTicket()` in
`src/lib/support-inbound.server.ts`. Inbound support email may only join an
existing `FOM-XXXXXX` thread when the sender matches the guest email, the auth
owner's account email, or an address that already posted on that thread.
Otherwise a fresh ticket is created and the attempt is logged as
`sender_ticket_mismatch` — the message is never dropped and never leaks.

## 6. AI security

- The system prompt lives server-side and is never echoed to the client.
- The model may only reach the catalog through the published-only helper; draft,
  archived, scheduled, and hidden products are unreachable by construction.
- Tool output is sanitized (`sanitizeExplainPayload`) and recommendations are
  filtered to slugs the tools actually returned, so a prompt-injected slug
  cannot surface a product the customer isn't allowed to see.
- Conversation history is truncated and length-capped before it reaches the
  gateway, bounding both token spend and injection payload size.
- Treat all page-derived shopping context as untrusted data, never instructions.

## 7. Realtime

Authorization is enforced by RLS on `realtime.messages`. Topic classification is
mirrored and regression-guarded in `src/lib/realtime/topic-scopes.ts`; contracts
are documented in `docs/security/realtime-rls.md`. Anonymous subscribers reach
public catalog topics only.

## 8. Payments

Razorpay signature verification, webhook replay protection, and currency/region
resolution are **frozen logic**. Security work may add checks around them; it may
never alter amounts, verification, or order state transitions.

## 9. Files

Private buckets, signed URLs, MIME allow-lists, per-file size caps, generated
(never client-supplied) storage paths. See `docs/security/review-media.md`.

## 10. Regression tests

Framework-free, run with `bun run <file>`:

- `src/lib/realtime/topic-scopes.test.ts` — realtime + `user_roles` RLS contracts
- `src/lib/security/server-rate-limit.test.ts` — public-endpoint abuse budget
- `src/lib/region-resolution.test.ts` — checkout region/currency resolution

## 11. Review checklist for every new feature

- [ ] New tables: RLS enabled, GRANTs written, policies scoped to `auth.uid()` or a role
- [ ] New public endpoint: metered, validated, caller-authorized, audited
- [ ] Any external identifier: ownership proven server-side
- [ ] Any PII: explicit column projection, masked in UI, encrypted if financial
- [ ] Any privileged action: `requireStaff` + `logSecurity` audit row
- [ ] Any AI surface: published-only catalog access, sanitized tool output
- [ ] A regression test that fails if the protection is removed

## 12. Hardening v3.0 additions

### 12.1 Support inbound ticket integrity (`support_ticket_spoof`)
- Subjects are parsed by `parseTicketReference()` and accept **both**
  `FOM-XXXXXX` (legacy) and `FOM-XXXXXX.<token>` (secure reply token).
- `verifyReplyToken()` (HMAC-SHA256, timing-safe) is an *additional* proof of
  ownership — never a requirement, so no ticket migration is needed.
- Append requires: valid reply token **or** guest-email match **or** auth-owner
  email match **or** prior verified participation on that thread.
- On failure: no append, no reopen, **no attachment storage**; a fresh ticket is
  created for the sender and `sender_ticket_mismatch` is audited. The response
  never reveals whether the referenced ticket exists.
- Secret: `SUPPORT_REPLY_TOKEN_SECRET` (falls back to `SUPPORT_INBOUND_SECRET`).
  When absent, token checks are skipped and identity verification still applies.

### 12.2 AI endpoint cost protection (`ai_shopping_open_cost`)
`/api/ai-shopping` stays public (no login). `src/lib/security/ai-abuse-guard.server.ts`
applies ten layers: IP limiter, visitor limiter, conversation limiter, daily
per-caller budget, global emergency budget, prompt-size cap, history cap, tool
iteration cap (`MAX_TOOL_ROUNDS`), response-token cap (`max_tokens`), and an
automatic cooldown after repeated denials. Abuse heuristics cover prompt
flooding, oversized payloads, and bot user agents.
- Signed, PII-free visitor tokens are issued by `GET /api/ai-shopping`
  (`AI_VISITOR_TOKEN_SECRET`); forged tokens are rejected and audited, absent
  tokens degrade to IP-only protection so guests are never blocked.
- Exceeding the global daily budget returns a lightweight non-LLM fallback
  instead of an error — credits are protected without an outage.
- Denials return HTTP 429 with `Retry-After` and a friendly message; internal
  thresholds are never disclosed.

### 12.3 Regression tests
- `src/lib/security/hardening-v3.test.ts` — 45 assertions covering reply tokens,
  visitor tokens, and every abuse layer. Run with `bun run <file>`.

Informational findings `user_roles_missing_select_scope`,
`realtime_admin_wildcard_topics_broad`, and
`realtime_anon_read_only_catalog_topics` remain correct by design and were not
modified.

## 13. Hardening v9.0 additions

### 13.1 Stored-file trust boundary (`customer_upload_type_bypass`)
The v9.0 audit proved every customer-writable bucket accepted arbitrary file
types: a scriptable SVG uploaded with a customer session was served back as
`image/svg+xml` from the storage origin, and HTML/oversized payloads were
accepted too. `accept=""` and `validateReviewFile()` are UX only.

Remediation — the database is now the boundary:
- `public.storage_upload_ext_allowed(name, kind)` (IMMUTABLE, fixed
  `search_path`) holds the allow-list: `image`, `image_video`, `image_doc`.
- The storage INSERT/UPDATE policies for `avatars`, `review-media`,
  `return-photos`, and `support-attachments` call it alongside the existing
  `auth.uid() = foldername[1]` ownership check.
- Scriptable extensions (svg, html, xml, js, …) are rejected with HTTP 400;
  double extensions resolve to the last segment. Existing objects are
  untouched.

### 13.2 Function search_path
`enqueue_email`, `read_email_batch`, `delete_email`, and `move_to_dlq` now pin
`search_path = public, pgmq`. They remain `service_role`-only.

### 13.3 Regression tests
- `src/lib/security/zero-trust-v9.test.ts` — upload allow-list table, anon
  read denial on review/Q&A tables (which is what bounds the `reviews:%`
  realtime topic), anon bucket writes, private-bucket exposure.
