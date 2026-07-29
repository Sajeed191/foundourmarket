/**
 * FoundOurMarket™ shared catalog access layer (Security Hardening v1.0).
 *
 * SECURITY ONLY. This module owns the single definition of "a product a
 * customer-facing surface is allowed to see". Every customer-facing AI or
 * public server read of `products` must go through `getPublicCatalogQuery()`
 * so visibility rules can never drift between files again.
 *
 * Enforced on every query:
 *   • status = 'published'   — draft / scheduled / archived / hidden excluded
 *   • deleted_at IS NULL     — soft-deleted excluded
 * Enforced for discovery surfaces (search, recommendations, AI browse):
 *   • hide_from_search = false
 *   • hide_from_recommendations = false
 *
 * The service-role client bypasses RLS, which is why these filters are
 * mandatory rather than advisory: without them an anonymous visitor talking to
 * the AI assistant could surface unreleased catalogue data.
 */
import type { PostgrestFilterBuilder } from "@supabase/postgrest-js";

/** Visibility contexts a public catalog read can run in. */
export type CatalogAudience =
  /** Discovery: search, recommendations, AI browse. Honours hide_* flags. */
  | "discovery"
  /** Direct lookup by slug (PDP-equivalent). Published, but hide_* not applied. */
  | "direct";

/** Minimal shape shared by any Supabase client we accept here. */
type QueryableClient = {
  from: (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    select: (columns: string) => any;
  };
};

/**
 * The single source of truth for public catalog reads.
 *
 * @example
 *   const { data } = await getPublicCatalogQuery(supabaseAdmin, SELECT).limit(8);
 */
export function getPublicCatalogQuery(
  client: QueryableClient,
  select: string,
  audience: CatalogAudience = "discovery",
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): PostgrestFilterBuilder<any, any, any[], "products", unknown> {
  let q = client
    .from("products")
    .select(select)
    .eq("status", "published")
    .is("deleted_at", null);

  if (audience === "discovery") {
    q = q.eq("hide_from_search", false).eq("hide_from_recommendations", false);
  }

  return q;
}

/** Human-readable answer used when a lookup resolves to nothing visible. */
export const NO_PUBLIC_PRODUCTS = "No published products found.";
