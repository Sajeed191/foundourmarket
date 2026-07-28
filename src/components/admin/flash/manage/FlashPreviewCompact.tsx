/**
 * Compact homepage preview: the real storefront band inside a switchable
 * device frame, so admins can sanity-check merchandising without leaving
 * the manage page.
 */
import { useState } from "react";
import { Monitor, Tablet, Smartphone } from "lucide-react";
import { FlashDealsBand } from "@/components/site/homepage/FlashDealsBand";

const FRAMES = [
  { key: "desktop", label: "Desktop", width: 1280, scale: 0.42, icon: Monitor },
  { key: "tablet", label: "Tablet", width: 834, scale: 0.5, icon: Tablet },
  { key: "mobile", label: "Mobile", width: 393, scale: 0.85, icon: Smartphone },
] as const;

const PREVIEW_HEIGHT = 780;

export function FlashPreviewCompact() {
  const [key, setKey] = useState<(typeof FRAMES)[number]["key"]>("mobile");
  const frame = FRAMES.find((f) => f.key === key)!;

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FRAMES.map((f) => {
          const Icon = f.icon;
          const active = f.key === key;
          return (
            <button key={f.key} onClick={() => setKey(f.key)} aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-full border px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest transition ${
                active ? "border-accent/50 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"
              }`}>
              <Icon className="size-3.5" /> {f.label}
            </button>
          );
        })}
        <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{frame.width}px</span>
      </div>
      <div className="overflow-hidden rounded-xl bg-background" style={{ height: PREVIEW_HEIGHT * frame.scale }}>
        <div style={{ width: frame.width, height: PREVIEW_HEIGHT, transform: `scale(${frame.scale})`, transformOrigin: "top left" }}>
          <FlashDealsBand />
        </div>
      </div>
    </div>
  );
}
