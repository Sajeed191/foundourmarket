/**
 * Live Homepage Preview — renders the REAL storefront Flash Deals band inside
 * device frames. No duplicate renderer, no screenshots: the same component the
 * homepage uses, so any change is reflected instantly here.
 */
import { FlashDealsBand } from "@/components/site/homepage/FlashDealsBand";

const FRAMES = [
  { key: "desktop", label: "Desktop", width: 1280, scale: 0.42 },
  { key: "tablet", label: "Tablet", width: 834, scale: 0.5 },
  { key: "mobile", label: "Mobile", width: 393, scale: 0.85 },
] as const;

export function FlashLivePreview() {
  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {FRAMES.map((f) => (
        <section
          key={f.key}
          className={`rounded-2xl border border-border bg-card p-3 overflow-hidden ${f.key === "desktop" ? "lg:col-span-2" : ""}`}
        >
          <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
            {f.label} · {f.width}px
          </p>
          <div className="overflow-hidden rounded-xl bg-background" style={{ height: PREVIEW_HEIGHT * f.scale }}>
            <div
              style={{
                width: f.width,
                height: PREVIEW_HEIGHT,
                transform: `scale(${f.scale})`,
                transformOrigin: "top left",
              }}
            >
              <FlashDealsBand />
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
