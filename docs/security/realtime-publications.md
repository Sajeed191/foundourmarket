# Realtime Publications

Status: **reviewed, no change** (Security Hardening v1.1)

Scanner finding:
`site_rules_realtime_published_no_select_policy_for_anon_or_broad` (warn).

## Verdict on `site_rules`: keep it published

The scanner correctly noted this is **not a leak** — Realtime
`postgres_changes` respects table RLS, and `public.site_rules` is staff-only at
the table level, so non-staff subscribers receive no payloads.

It asked us to confirm the subscription is actually needed. **It is.**

`src/lib/site-rules.ts` (`bindRealtime()`) subscribes to
`site_rules` filtered to `key=eq.homepage_collections`. When an admin edits the
homepage collection rules in `/admin-site-rules`, this invalidates the
module-level cache so the live storefront picks up new limits, rotation windows
and featured mode without a reload. Consumers include
`src/routes/index.tsx`, `ProductCollection.tsx`, `use-flash-deals.ts` and
`flash/use-flash-admin.ts`.

Removing `site_rules` from the publication would silently break live homepage
rule propagation — a real regression traded for zero security gain.

Note the read path is *already* hardened: the storefront never reads
`site_rules` directly. It reads derived values through the
`getPublicMarketplaceState` server function
(`src/lib/marketplace-state.functions.ts`), which exposes only the rotation
nonce and the `homepage_collections` rule value. Realtime here is a cache-bust
signal only; the event payload is not what the storefront renders.

## Rule for future tables

**Should be in `supabase_realtime`:**

- tables with a live UI surface that must update without a reload
  (support messages, order status, flash-deal state, admin notifications)
- and whose RLS SELECT policy already scopes rows to the intended audience

**Should NOT be in `supabase_realtime`:**

- internal/config tables with no subscriber — every published table is standing
  attack surface if a SELECT policy is ever loosened later
- tables containing PII or secrets, even staff-only ones, where polling or a
  server function would do
- anything read exclusively through a server function

**Checklist before adding a table to the publication:**

1. Name a concrete subscriber file. No subscriber → do not publish.
2. Confirm the SELECT policy is at least as strict as the intended audience —
   Realtime inherits it, and a broad policy leaks every row change.
3. Prefer publishing a narrow filter (`key=eq....`) on the client rather than
   fanning out whole-table events.
4. Never rely on Realtime for authorization. Treat events as *"something
   changed, refetch"* signals, not as data delivery.
