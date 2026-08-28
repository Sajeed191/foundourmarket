import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * TEMPORARY one-off maintenance endpoint: removes orphaned media rows and
 * storage files left behind by deleted products. Disabled in production.
 */
const BUCKETS = ["media", "product-images"] as const;

function pathsFrom(url: unknown, bucket: string): string[] {
  if (typeof url !== "string") return [];
  const marker = `/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return [];
  return [decodeURIComponent(url.slice(i + marker.length).split("?")[0])];
}

async function listAll(bucket: string, prefix = ""): Promise<string[]> {
  const out: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin.storage
      .from(bucket)
      .list(prefix, { limit: 1000, offset });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    for (const item of data) {
      const full = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id === null) out.push(...(await listAll(bucket, full)));
      else out.push(full);
    }
    if (data.length < 1000) break;
    offset += data.length;
  }
  return out;
}

async function fetchAll(table: string, cols: string[]): Promise<any[]> {
  const out: any[] = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const { data, error } = await supabaseAdmin
      .from(table as any)
      .select(cols.join(","))
      .range(from, from + size - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as any[]));
    if (data.length < size) break;
  }
  return out;
}

async function run(dryRun: boolean) {
  const report: Record<string, unknown> = { dryRun };

  // 1. Purge DB rows that belong to products which no longer exist.
  const products = await fetchAll("products", ["slug"]);
  const slugs = new Set(products.map((p: { slug: string }) => p.slug));

  const pImgs = await fetchAll("product_images", ["id", "product_slug"]);
  const staleImgIds = pImgs
    .filter((r: { product_slug: string }) => !slugs.has(r.product_slug))
    .map((r: { id: string }) => r.id);

  const assets = await fetchAll("media_assets", ["id", "entity_type", "entity_ref"]);
  const staleAssetIds = assets
    .filter(
      (r: { entity_type: string | null; entity_ref: string | null }) =>
        r.entity_type === "product" && (!r.entity_ref || !slugs.has(r.entity_ref)),
    )
    .map((r: { id: string }) => r.id);

  report.staleProductImageRows = staleImgIds.length;
  report.staleMediaAssetRows = staleAssetIds.length;

  if (!dryRun) {
    for (let i = 0; i < staleImgIds.length; i += 200) {
      await supabaseAdmin
        .from("product_images")
        .delete()
        .in("id", staleImgIds.slice(i, i + 200));
    }
    for (let i = 0; i < staleAssetIds.length; i += 200) {
      await supabaseAdmin
        .from("media_assets")
        .delete()
        .in("id", staleAssetIds.slice(i, i + 200));
    }
  }

  // 2. Collect every URL still referenced anywhere.
  const urls: unknown[] = [];
  const push = (rows: any[] | null, cols: string[]) => {
    for (const r of rows ?? []) for (const c of cols) urls.push(r[c]);
  };

  const q = async (table: string, cols: string[]) => {
    push(await fetchAll(table, cols), cols);
  };

  await q("products", ["image", "base_image", "video_url"]);
  await q("product_images", ["url", "optimized_url", "original_url"]);
  await q("media_assets", ["url", "thumb_url", "medium_url", "large_url", "normalized_url", "path"]);
  await q("categories", ["image", "mobile_image", "banner_image"]);
  await q("banners", ["image", "mobile_image", "video_url"]);
  await q("cms_posts", ["cover_image"]);
  await q("order_items", ["image", "variant_image"]);
  await q("product_variant_images", ["image_url", "thumb_url", "medium_url", "poster_url"]);
  await q("product_variants", ["image_url"]);
  await q("profiles", ["avatar_url"]);
  await q("vendors", ["logo_url"]);
  await q("testimonials", ["avatar"]).catch(() => {});

  const results: Record<string, unknown> = {};

  for (const bucket of BUCKETS) {
    const referenced = new Set<string>();
    for (const u of urls) {
      for (const p of pathsFrom(u, bucket)) referenced.add(p);
      if (typeof u === "string" && !u.startsWith("http")) referenced.add(u);
    }
    const all = await listAll(bucket);
    const orphans = all.filter((name) => !referenced.has(name));
    results[bucket] = { total: all.length, orphans: orphans.length };
    if (!dryRun) {
      for (let i = 0; i < orphans.length; i += 100) {
        const { error } = await supabaseAdmin.storage
          .from(bucket)
          .remove(orphans.slice(i, i + 100));
        if (error) throw new Error(`${bucket}: ${error.message}`);
      }
    }
  }

  report.buckets = results;
  return report;
}

export const Route = createFileRoute("/api/maintenance-storage-cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (process.env.NODE_ENV === "production") {
          return new Response("Disabled", { status: 404 });
        }
        const dryRun = new URL(request.url).searchParams.get("apply") !== "1";
        try {
          const report = await run(dryRun);
          return Response.json(report);
        } catch (e) {
          return Response.json(
            { error: e instanceof Error ? e.message : "failed" },
            { status: 500 },
          );
        }
      },
    },
  },
});
