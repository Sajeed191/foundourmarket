import { useEffect, useMemo, useRef, useState } from "react";
import { Monitor, Smartphone, RefreshCw, ExternalLink } from "lucide-react";
import { publishDraftOverlay, type DraftOverlay } from "@/lib/pdp-preview-channel";
import { cn } from "@/lib/utils";

/**
 * Live Product Details preview — Product Editor 3.5.
 *
 * Renders the ACTUAL customer PDP route inside a frame and streams the
 * unsaved editor state into it through the draft-preview channel. There is no
 * second renderer: gallery, pricing, variant selector, detail tabs, spec
 * cards, similar products and reviews are the real components.
 */
export function LivePreviewPane({
  slug,
  overlay,
  className,
}: {
  slug: string;
  overlay: DraftOverlay;
  className?: string;
}) {
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const [nonce, setNonce] = useState(0);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const src = useMemo(
    () => `/products/${encodeURIComponent(slug)}?previewDraft=1&n=${nonce}`,
    [slug, nonce],
  );

  // Zero-delay sync: publish on every change, coalesced to one frame.
  const raf = useRef<number | null>(null);
  const latest = useRef(overlay);
  latest.current = overlay;
  const signature = JSON.stringify(overlay);
  useEffect(() => {
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => publishDraftOverlay(slug, latest.current));
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [signature, slug]);

  return (
    <div className={cn("flex h-full min-h-0 flex-col gap-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {(["mobile", "desktop"] as const).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDevice(d)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors",
                device === d
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-white/10 text-muted-foreground hover:text-foreground",
              )}
            >
              {d === "mobile" ? <Smartphone className="size-3" /> : <Monitor className="size-3" />}
              {d}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setNonce((n) => n + 1)}
            aria-label="Reload preview"
            className="grid size-7 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <a
            href={`/products/${slug}`}
            target="_blank"
            rel="noreferrer"
            aria-label="Open live product page"
            className="grid size-7 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent"
          >
            <ExternalLink className="size-3.5" />
          </a>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/10 bg-black/40">
        <div
          className="mx-auto h-full transition-[max-width] duration-300"
          style={{ maxWidth: device === "mobile" ? 420 : "100%" }}
        >
          <iframe
            ref={frameRef}
            key={src}
            src={src}
            title="Live product details preview"
            className="h-full w-full border-0 bg-background"
          />
        </div>
      </div>
      <p className="text-center text-[10px] text-muted-foreground">
        Live customer view — unsaved edits included. Same components as the storefront.
      </p>
    </div>
  );
}
