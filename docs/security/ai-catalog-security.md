# AI Catalog Security

Status: **enforced** (Security Hardening v1.0, re-verified v1.1)

## Why this exists

Customer-facing AI tools run on the server with the **service-role** Supabase
client (`@/integrations/supabase/client.server`). That client **bypasses Row
Level Security entirely**. Every published-only guarantee the storefront relies
on at the RLS layer simply does not apply there.

Without an explicit filter, an anonymous visitor chatting with the AI Shopping
Assistant could surface:

- draft products (unfinished copy, placeholder pricing)
- scheduled/unreleased launches
- archived and soft-deleted products
- products deliberately hidden from search or recommendations

## The single enforcement point

`src/lib/security/catalog-access.ts` → `getPublicCatalogQuery(client, select, audience)`

It always enforces:

- `status = 'published'`
- `deleted_at IS NULL`

and for `audience: "discovery"` (search, recommendations, AI browse) also:

- `hide_from_search = false`
- `hide_from_recommendations = false`

`audience: "direct"` is for slug lookups (PDP-equivalent): still published-only,
but the `hide_*` merchandising flags are not applied.

## Rule for all future AI / public catalog code

> Any customer-facing read of `public.products` that uses the service-role
> client **must** go through `getPublicCatalogQuery()`. Never hand-roll
> `.eq("status", "published")` — visibility rules must never drift between
> files again.

Current call sites (verified v1.1):

- `src/lib/ai-shopping/tools.server.ts` — `search_products`, `get_product`,
  `compare_products`, `get_products_by_slugs`
- `src/lib/global-beta.functions.ts` — waitlist product-slug validation

## Deliberate exclusions

`src/lib/cart.functions.ts` and `src/lib/razorpay.functions.ts` read `products`
with the service-role client for **price authority during checkout**, not for
discovery. They resolve slugs the customer already holds in their cart and must
keep working even if an item is unpublished mid-session. They are not discovery
surfaces and intentionally do not use the helper.
