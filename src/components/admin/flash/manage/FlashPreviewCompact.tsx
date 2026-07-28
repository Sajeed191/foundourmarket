/**
 * Compact homepage preview: the real storefront band inside a switchable
 * device frame, so admins can sanity-check merchandising without leaving
 * the manage page. Device, orientation and theme are presentation-only
 * toggles — the band renders live data exactly as customers see it.
 */
import { useState } from "react";
import { Monitor, Tablet, Smartphone, RotateCcw, Sun, Moon } from "lucide-react";
import { FlashDealsBand } from "@/components/site/homepage/FlashDealsBand";

const FRAMES = [
  { key: "desktop", label: "Desktop", width: 1280, height: 780, icon: Monitor },
  { key: "tablet", label: "Tablet", width: 834, height: 900, icon: Tablet },
  { key: "mobile", label: "Mobile", width: 393, height: 780, icon: Smartphone },
] as const;

/** Widest the scaled frame may render inside the admin column. */
const MAX_WIDTH = 560;

export function FlashPreviewCompact() {
  const [key, setKey] = useState<(typeof FRAMES)[number]["key"]>("mobile");
  const [landscape, setLandscape] = useState(false);
  const [light, setLight] = useState(false);

  const frame = FRAMES.find((f) => f.key === key)!;
  const width = landscape ? frame.height : frame.width;
  const height = landscape ? frame.width : frame.height;
  const scale = Math.min(1, MAX_WIDTH / width);

  const chip = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-full border px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest transition ${
      active ? "border-accent/50 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"
    }`;

  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {FRAMES.map((f) => {
          const Icon = f.icon;
          return (
            <button key={f.key} onClick={() => setKey(f.key)} aria-pressed={f.key === key} className={chip(f.key === key)}>
              <Icon className="size-3.5" /> {f.label}
            </button>
          );
        })}
        <button onClick={() => setLandscape((v) => !v)} aria-pressed={landscape} className={chip(landscape)}>
          <RotateCcw className="size-3.5" /> {landscape ? "Landscape" : "Portrait"}
        </button>
        <button onClick={() => setLight((v) => !v)} aria-pressed={light} className={chip(light)}>
          {light ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />} {light ? "Light" : "Dark"}
        </button>
        <span className="ml-auto text-[10px] font-mono uppercase tracking-widest tabular-nums text-muted-foreground">
          {width}×{height}
        </span>
      </div>
      <div className="overflow-hidden rounded-xl bg-background" style={{ height: height * scale }}>
        <div
          data-theme={light ? "light" : undefined}
          className="bg-background"
          style={{ width, height, transform: `scale(${scale})`, transformOrigin: "top left" }}
        >
          <FlashDealsBand />
        </div>
      </div>
    </div>
  );
}
