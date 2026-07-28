/**
 * Rotation Simulator — preview exactly how the homepage band will be ordered in
 * the current window, the next window, over 24 hours and across 7 days.
 * Purely predictive: it reuses the live seeded-rotation helpers and writes nothing.
 */
import { useState } from "react";
import { Crown, Clock, Layers } from "lucide-react";
import type { SimWindow } from "@/lib/flash/use-flash-intelligence";
import { rotationReason } from "@/lib/flash/flash-health";

const RANGES = [
  { key: "now", label: "Current + next", take: 2 },
  { key: "24h", label: "Next 24 hours", take: 5 },
  { key: "7d", label: "Next 7 days", take: 9 },
] as const;

export function FlashSimulator({ windows, cap, nonce }: { windows: SimWindow[]; cap: number; nonce: number }) {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("now");
  const take = RANGES.find((r) => r.key === range)!.take;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Simulation range">
        {RANGES.map((r) => (
          <button key={r.key} role="tab" aria-selected={range === r.key} onClick={() => setRange(r.key)}
            className={`rounded-full border px-4 min-h-11 text-[10px] font-mono uppercase tracking-widest transition ${
              range === r.key ? "border-accent/50 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"
            }`}>
            {r.label}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Predicted from the live rotation engine. Nothing is published — this is a preview only.
      </p>

      <div className="grid lg:grid-cols-2 gap-3">
        {windows.slice(0, take).map((w) => (
          <section key={w.key} className="rounded-2xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground">{w.label}</p>
              <span className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
                <Clock className="size-3" /> {new Date(w.startsAt).toLocaleString()}
              </span>
            </div>

            <div className="mt-3 rounded-xl border border-accent/30 bg-accent/[0.06] p-3">
              <p className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent">
                <Crown className="size-3" /> Hero
              </p>
              <p className="text-sm mt-1 truncate">{w.hero?.name ?? "No eligible product"}</p>
              {w.hero && <p className="text-[11px] text-muted-foreground mt-0.5">{rotationReason(0, cap)}</p>}
            </div>

            <p className="mt-3 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <Layers className="size-3" /> Mini cards
            </p>
            <ol className="mt-1 space-y-1">
              {w.mini.map((p, i) => (
                <li key={p.slug} className="flex items-center gap-2 text-xs">
                  <span className="w-5 shrink-0 font-mono tabular-nums text-muted-foreground">{i + 2}</span>
                  <span className="truncate">{p.name}</span>
                </li>
              ))}
              {w.mini.length === 0 && <li className="text-xs text-muted-foreground">No secondary cards in this window.</li>}
            </ol>

            {w.hidden.length > 0 && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                {w.hidden.length} eligible product{w.hidden.length === 1 ? "" : "s"} waiting beyond the limit of {cap}.
              </p>
            )}

            <p className="mt-2 text-[10px] font-mono text-muted-foreground">
              seed {w.seed} · nonce {nonce} · limit {cap}
            </p>
          </section>
        ))}
      </div>
    </div>
  );
}
