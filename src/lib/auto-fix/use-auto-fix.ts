/**
 * FoundOurMarket™ Universal AI Auto-Fix (v1.0) — Apply hook.
 *
 * Uses ONLY the existing `adminUpdateProduct` mutation. No new APIs, no direct
 * database writes, no schema changes. Undo restores the captured previous
 * values through the very same mutation.
 */
import { useCallback } from "react";
import { useServerFn } from "@tanstack/react-start";
import { adminUpdateProduct } from "@/lib/admin-products.functions";
import { refreshProducts } from "@/lib/use-products";
import type { Product } from "@/lib/products";
import { mergeProposals, type AutoFixProposal, type AutoFixablePatch } from "./planners";
import { markUndone, recordAutoFix, type AutoFixLogEntry } from "./log";

/** Snapshot the fields a patch is about to overwrite. */
export function capturePrevious(product: Product, patch: AutoFixablePatch): AutoFixablePatch {
  const prev: AutoFixablePatch = {};
  for (const key of Object.keys(patch) as Array<keyof AutoFixablePatch>) {
    switch (key) {
      case "metaKeywords":
        prev.metaKeywords = [...(product.metaKeywords ?? [])];
        break;
      case "name":
        prev.name = product.name ?? "";
        break;
      case "tagline":
        prev.tagline = product.tagline ?? "";
        break;
      case "seoTitle":
        prev.seoTitle = product.seoTitle ?? "";
        break;
      case "seoDescription":
        prev.seoDescription = product.seoDescription ?? "";
        break;
    }
  }
  return prev;
}

export function useAutoFix() {
  const update = useServerFn(adminUpdateProduct);

  /** Apply a set of proposals to one product. Returns the log entry (for Undo). */
  const apply = useCallback(
    async (product: Product, proposals: AutoFixProposal[], actor = "Admin"): Promise<AutoFixLogEntry> => {
      const { patch, changes } = mergeProposals(proposals);
      if (!Object.keys(patch).length) throw new Error("Nothing to fix.");
      const previous = capturePrevious(product, patch);

      await update({ data: { slug: product.slug, ...patch } as never });
      refreshProducts();

      return recordAutoFix({
        productSlug: product.slug,
        productName: product.name,
        kinds: proposals.map((p) => p.kind),
        changes,
        previous,
        confidence: Math.round(
          proposals.reduce((a, p) => a + p.confidence, 0) / Math.max(1, proposals.length),
        ),
        actor,
      });
    },
    [update],
  );

  /** Restore an applied fix using the same update mutation. */
  const undo = useCallback(
    async (entry: AutoFixLogEntry) => {
      if (!Object.keys(entry.previous).length) return;
      await update({ data: { slug: entry.productSlug, ...entry.previous } as never });
      refreshProducts();
      markUndone(entry.id);
    },
    [update],
  );

  return { apply, undo };
}
