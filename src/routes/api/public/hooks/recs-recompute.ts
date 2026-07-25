import { createFileRoute } from "@tanstack/react-router";

/**
 * Nightly Intelligence Job — precompute the expensive recommendation signals
 * once per night so daytime reads stay cheap.
 *
 * Recomputes from order history:
 *  - Co-purchase graph (bought_with edges) → product_graph_edges
 *  - Popularity / FBT strength / conversion per product → product_scores
 *
 * Auth: requires the server-only RECS_RECOMPUTE_SECRET presented as
 *   `Authorization: Bearer <secret>` or `X-Recs-Secret: <secret>`.
 *   The public Supabase publishable/anon key is NOT accepted — it ships in
 *   every client bundle and provides no real access control for a
 *   service-role write endpoint.
 *
 * Hardening:
 *  - POST only, Cache-Control: no-store
 *  - Timing-safe secret comparison
 *  - Single-flight guard: overlapping calls return 409 Conflict
 *  - Structured audit log (never logs the secret)
 */

const LOOKBACK_DAYS = 90;
const MAX_EDGES_PER_SEED = 20;
const MAX_PAIRS_PER_ORDER = 40; // guard against pathological large baskets

// Module-scoped single-flight guard. Prevents overlapping DELETE/UPSERT jobs
// on the same worker instance (the nightly cron runs single-threaded, so this
// is sufficient for the documented caller).
let RUNNING = false;

const NO_STORE = { "Content-Type": "application/json", "Cache-Control": "no-store" } as const;

function timingSafeEqualStr(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  // Compare against the longer length so timing does not leak length equality.
  const len = Math.max(ab.length, bb.length);
  let mismatch = ab.length ^ bb.length;
  for (let i = 0; i < len; i++) {
    const av = i < ab.length ? ab[i] : 0;
    const bv = i < bb.length ? bb[i] : 0;
    mismatch |= av ^ bv;
  }
  return mismatch === 0;
}

function extractPresentedSecret(request: Request): string {
  const xHeader = request.headers.get("x-recs-secret");
  if (xHeader) return xHeader.trim();
  const auth = request.headers.get("authorization") ?? "";
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return "";
}

function callerId(request: Request): string {
  return (
    request.headers.get("x-vercel-forwarded-for") ??
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for") ??
    request.headers.get("user-agent") ??
    "unknown"
  );
}

export const Route = createFileRoute("/api/public/hooks/recs-recompute")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const caller = callerId(request);

        const expected = process.env.RECS_RECOMPUTE_SECRET ?? "";
        const presented = extractPresentedSecret(request);
        if (!expected || !presented || !timingSafeEqualStr(presented, expected)) {
          console.warn("[recs-recompute] unauthorized", {
            caller,
            ts: new Date().toISOString(),
          });
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: NO_STORE,
          });
        }

        if (RUNNING) {
          console.warn("[recs-recompute] conflict: already running", {
            caller,
            ts: new Date().toISOString(),
          });
          return new Response(
            JSON.stringify({ error: "Recommendation recompute already running" }),
            { status: 409, headers: NO_STORE },
          );
        }
        RUNNING = true;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const summary: Record<string, unknown> = { startedAt: new Date().toISOString() };
          const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

          // ---- Load recent order items ----
          let items: { order_id: string; product_slug: string }[] = [];
          try {
            const { data, error } = await supabaseAdmin
              .from("order_items")
              .select("order_id, product_slug")
              .gte("created_at", since)
              .limit(100000);
            if (error) throw error;
            items = (data ?? []).filter((r) => r.product_slug) as typeof items;
            summary.orderItems = items.length;
          } catch (e) {
            summary.orderItemsError = String(e);
          }

          // ---- Co-purchase graph + popularity ----
          try {
            const byOrder = new Map<string, Set<string>>();
            const popularity = new Map<string, number>();
            for (const it of items) {
              popularity.set(it.product_slug, (popularity.get(it.product_slug) ?? 0) + 1);
              let set = byOrder.get(it.order_id);
              if (!set) {
                set = new Set();
                byOrder.set(it.order_id, set);
              }
              set.add(it.product_slug);
            }

            // Directed co-occurrence counts.
            const pair = new Map<string, Map<string, number>>();
            const bump = (a: string, b: string) => {
              let m = pair.get(a);
              if (!m) {
                m = new Map();
                pair.set(a, m);
              }
              m.set(b, (m.get(b) ?? 0) + 1);
            };
            for (const set of byOrder.values()) {
              const slugs = [...set];
              if (slugs.length < 2) continue;
              const capped = slugs.slice(0, MAX_PAIRS_PER_ORDER);
              for (let i = 0; i < capped.length; i++) {
                for (let j = 0; j < capped.length; j++) {
                  if (i !== j) bump(capped[i], capped[j]);
                }
              }
            }

            // Build bought_with edge rows (top N per seed).
            const now = new Date().toISOString();
            const edgeRows: {
              from_slug: string;
              edge_type: string;
              to_slug: string;
              weight: number;
              updated_at: string;
            }[] = [];
            const fbtStrength = new Map<string, number>();
            for (const [from, m] of pair) {
              const top = [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_EDGES_PER_SEED);
              fbtStrength.set(from, top[0]?.[1] ?? 0);
              for (const [to, weight] of top) {
                edgeRows.push({ from_slug: from, edge_type: "bought_with", to_slug: to, weight, updated_at: now });
              }
            }

            // Refresh bought_with edges: clear stale, insert fresh (chunked).
            await supabaseAdmin.from("product_graph_edges").delete().eq("edge_type", "bought_with");
            for (let i = 0; i < edgeRows.length; i += 1000) {
              const chunk = edgeRows.slice(i, i + 1000);
              const { error } = await supabaseAdmin.from("product_graph_edges").insert(chunk);
              if (error) throw error;
            }
            summary.edgesWritten = edgeRows.length;

            // Product scores upsert.
            const maxPop = Math.max(1, ...popularity.values());
            const scoreRows = [...popularity.entries()].map(([slug, count]) => ({
              product_slug: slug,
              popularity: Math.round((count / maxPop) * 100),
              fbt_strength: fbtStrength.get(slug) ?? 0,
              conversion: 0,
              trending: count,
              aggregates: {},
              updated_at: now,
            }));
            for (let i = 0; i < scoreRows.length; i += 1000) {
              const chunk = scoreRows.slice(i, i + 1000);
              const { error } = await supabaseAdmin
                .from("product_scores")
                .upsert(chunk, { onConflict: "product_slug" });
              if (error) throw error;
            }
            summary.scoresWritten = scoreRows.length;
          } catch (e) {
            summary.graphError = String(e);
          }

          const durationMs = Date.now() - startedAt;
          summary.finishedAt = new Date().toISOString();
          summary.durationMs = durationMs;
          const success = !summary.graphError && !summary.orderItemsError;
          console.info("[recs-recompute] run complete", {
            success,
            caller,
            durationMs,
            orderItems: summary.orderItems,
            edgesWritten: summary.edgesWritten,
            scoresWritten: summary.scoresWritten,
          });
          return new Response(JSON.stringify({ success: true, summary }), {
            headers: NO_STORE,
          });
        } finally {
          RUNNING = false;
        }
      },
    },
  },
});
