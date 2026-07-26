import { useMemo, useState } from "react";
import { Monitor, Tablet, Smartphone, Search, Share2, LayoutGrid, Images } from "lucide-react";
import type { DraftOverlay } from "@/lib/pdp-preview-channel";
import { LivePreviewPane } from "@/components/admin/product-editor/LivePreviewPane";
import { resolveImage } from "@/lib/products";

type Mode = "desktop" | "tablet" | "mobile" | "search" | "social" | "card" | "gallery";

const MODES: { id: Mode; label: string; icon: typeof Monitor }[] = [
  { id: "desktop", label: "Desktop", icon: Monitor },
  { id: "tablet", label: "Tablet", icon: Tablet },
  { id: "mobile", label: "Mobile", icon: Smartphone },
  { id: "search", label: "Google", icon: Search },
  { id: "social", label: "Social", icon: Share2 },
  { id: "card", label: "Card", icon: LayoutGrid },
  { id: "gallery", label: "Gallery", icon: Images },
];

const FRAME_WIDTH: Partial<Record<Mode, number>> = { desktop: 1280, tablet: 834, mobile: 393 };

/**
 * Publishing Preview — Editor 7.0. Lazy-loaded.
 * Device frames reuse the real customer PDP through LivePreviewPane; the
 * search / social / card previews are presentation-only renderings of the
 * exact metadata that will ship.
 */
export function PublishingPreview({
  slug, overlay, images, price, brand,
}: {
  slug: string;
  overlay: DraftOverlay;
  images: string[];
  price: number;
  brand: string;
}) {
  const [mode, setMode] = useState<Mode>("mobile");
  const hero = images[0] ? resolveImage(images[0]) : "";

  const seo = useMemo(() => ({
    title: (overlay.seoTitle || overlay.name || "Untitled product").slice(0, 60),
    desc: (overlay.seoDescription || overlay.description || "").replace(/[#*_>`]/g, "").replace(/\s+/g, " ").trim().slice(0, 158),
  }), [overlay.seoTitle, overlay.seoDescription, overlay.name, overlay.description]);

  const width = FRAME_WIDTH[mode];

  return (
    <div className="space-y-3">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
        {MODES.map((m) => {
          const Icon = m.icon;
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              aria-pressed={active}
              className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-colors duration-200 ${
                active ? "border-accent/40 bg-accent/15 text-accent" : "border-white/10 bg-white/[0.02] text-muted-foreground"
              }`}
            >
              <Icon className="size-3.5" /> {m.label}
            </button>
          );
        })}
      </div>

      {width ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          <div className="origin-top-left" style={{ width, transform: "scale(var(--pv-scale, 1))" }}>
            <LivePreviewPane slug={slug} overlay={overlay} className="h-[520px]" />
          </div>
        </div>
      ) : mode === "search" ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <p className="truncate text-[11px] text-muted-foreground">foundourmarket.com › products › {slug}</p>
          <p className="mt-1 truncate text-[17px] leading-snug text-sky-400">{seo.title}</p>
          <p className="mt-1 line-clamp-2 text-[12.5px] text-muted-foreground">{seo.desc || "No meta description set — search engines will improvise."}</p>
        </div>
      ) : mode === "social" ? (
        <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="aspect-[1.91/1] w-full bg-white/5">
            {hero && <img src={hero} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
          </div>
          <div className="p-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">foundourmarket.com</p>
            <p className="mt-1 truncate text-sm font-semibold">{seo.title}</p>
            <p className="mt-0.5 line-clamp-2 text-[11.5px] text-muted-foreground">{seo.desc}</p>
          </div>
        </div>
      ) : mode === "card" ? (
        <div className="max-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02]">
          <div className="aspect-square w-full bg-white/5">
            {hero && <img src={hero} alt="" loading="lazy" decoding="async" className="size-full object-cover" />}
          </div>
          <div className="p-2.5">
            {brand && <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{brand}</p>}
            <p className="mt-0.5 line-clamp-2 text-[12px] font-medium leading-snug">{overlay.name}</p>
            <p className="mt-1 text-sm font-bold">{price > 0 ? `₹${price.toLocaleString("en-IN")}` : "No price"}</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.length === 0 && <p className="col-span-full rounded-xl border border-dashed border-white/10 px-4 py-6 text-center text-[11px] text-muted-foreground">No images yet.</p>}
          {images.map((src, i) => (
            <div key={`${src}-${i}`} className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/5">
              <img src={resolveImage(src)} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
              {i === 0 && <span className="absolute left-1.5 top-1.5 rounded-full bg-accent/90 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider text-accent-foreground">Hero</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
