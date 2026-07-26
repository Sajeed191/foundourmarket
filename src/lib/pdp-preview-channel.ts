/**
 * PDP Live Preview channel — Product Editor 3.5.
 *
 * A one-way, in-browser bridge between the admin Product Editor and the REAL
 * customer Product Details page. The editor publishes an unsaved draft overlay
 * (a `Partial<Product>`), the PDP — rendered inside a preview iframe with
 * `?previewDraft=1` — merges that overlay over the loaded product before
 * rendering.
 *
 * This exists so the editor never needs a second Product Details renderer:
 * the customer page stays the single source of truth. Nothing here touches
 * the database, and the overlay is discarded when the tab closes.
 */
import { useEffect, useState } from "react";
import type { Product } from "@/lib/products";

export type DraftOverlay = Partial<Product> & { __t?: number };

const CHANNEL = "fom:pdp-draft-preview";
const storageKey = (slug: string) => `${CHANNEL}:${slug}`;

/** True when the current document is a draft-preview PDP frame. */
export function isDraftPreviewFrame(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).has("previewDraft");
}

/** Editor → preview. Cheap enough to call on every keystroke. */
export function publishDraftOverlay(slug: string, overlay: DraftOverlay): void {
  if (typeof window === "undefined") return;
  const payload = { ...overlay, __t: Date.now() };
  try {
    window.sessionStorage.setItem(storageKey(slug), JSON.stringify(payload));
  } catch {
    /* storage full / disabled — the channel below still delivers */
  }
  try {
    const bc = new BroadcastChannel(CHANNEL);
    bc.postMessage({ slug, overlay: payload });
    bc.close();
  } catch {
    /* no BroadcastChannel — preview falls back to the storage snapshot */
  }
}

function readSnapshot(slug: string): DraftOverlay | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey(slug));
    return raw ? (JSON.parse(raw) as DraftOverlay) : null;
  } catch {
    return null;
  }
}

/**
 * Preview side. Returns the live draft overlay, or `null` on the normal
 * customer page (no `?previewDraft` param) so real visitors pay nothing.
 */
export function useDraftPreviewOverlay(slug: string): DraftOverlay | null {
  const [overlay, setOverlay] = useState<DraftOverlay | null>(null);

  useEffect(() => {
    if (!isDraftPreviewFrame()) return;
    setOverlay(readSnapshot(slug));
    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e: MessageEvent) => {
        const data = e.data as { slug?: string; overlay?: DraftOverlay } | null;
        if (data?.slug === slug && data.overlay) setOverlay(data.overlay);
      };
    } catch {
      /* ignore */
    }
    return () => bc?.close();
  }, [slug]);

  return overlay;
}

/** Merge an overlay over a loaded product. Undefined keys are ignored. */
export function applyDraftOverlay<T extends Product | null>(
  product: T,
  overlay: DraftOverlay | null,
): T {
  if (!product || !overlay) return product;
  const merged = { ...product } as Product;
  for (const [k, v] of Object.entries(overlay)) {
    if (k === "__t" || v === undefined) continue;
    (merged as Record<string, unknown>)[k] = v;
  }
  return merged as T;
}
