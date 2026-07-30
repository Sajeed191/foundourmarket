# International Waitlist Integrity

Status: **hardened** (Security Hardening v1.1)

Scanner finding: `international_waitlist_email_leak` (warn). This was **not a
data leak** — it was a data-integrity gap. Nothing about visibility changed.

## Protections that already existed (unchanged)

- **Email ownership** — `joinGlobalWaitlist` rejects any submission whose email
  does not equal the caller's authenticated account email. The server function
  uses the service-role client, so this check stands in for the RLS policy.
- **Authentication required** — the server function runs behind
  `requireSupabaseAuth`.
- **Staff-only reads** — waitlist rows are readable only by staff, via
  `getGlobalExpansionStats`.
- **Schema validation** — zod validates name/email/country/productSlug shape
  and length before anything touches the database.

## What v1.1 added

### 1. Duplicate prevention — one user, one product, one record

Two partial unique indexes on `public.international_waitlist`:

| Index | Rule |
| --- | --- |
| `international_waitlist_user_product_uidx` | `UNIQUE (user_id, product_slug) WHERE product_slug IS NOT NULL` |
| `international_waitlist_user_general_uidx` | `UNIQUE (user_id) WHERE product_slug IS NULL` |

Two indexes rather than one because `NULL` values are distinct in a normal
unique index — a single constraint would have allowed unlimited "general
interest" rows per user.

Pre-existing duplicates were collapsed to the earliest row per
`(user_id, product_slug)` in the same migration.

**UX is unchanged.** A repeat submission returns `{ ok: true }`: unique
violation `23505` is swallowed as idempotent success, because the customer's
intent is already recorded. Any other database error still surfaces the
original friendly failure message.

### 2. Product reference validation

When `productSlug` is supplied it must resolve through
`getPublicCatalogQuery(supabaseAdmin, "slug", "direct")` — i.e. an existing,
published, non-deleted product. An unknown or unpublished slug is rejected with
*"That product is no longer available."* rather than writing an orphan row.

A `NULL` slug remains valid — that is a general international-interest signal,
not a product waitlist.

## Why this is the safest fix

- No RLS policy was relaxed or rewritten.
- No column, grant, or read path changed.
- No waitlist UI changed.
- The only behavioural deltas are: duplicates stop accumulating, and orphan
  slugs are rejected — both of which only improve the accuracy of the admin
  Global Expansion demand metrics.
