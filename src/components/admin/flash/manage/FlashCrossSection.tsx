/**
 * v12.0 — Cross-section conflicts. Shows where a product repeats across
 * homepage merchandising sections, which section should win, and how to
 * improve it. Preview only: nothing is applied from this panel.
 */
import { useState } from "react";
import { Layers, ChevronDown, Eye } from "lucide-react";
import type { SectionConflict } from "@/lib/flash/flash-marketplace";

export function FlashCrossSection({
  conflicts, onPreview,
}: {
  conflicts: SectionConflict[];
  onPreview: (c: SectionConflict) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (conflicts.length === 0) {
    return (
      <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-5 text-center text-sm text-emerald-200">
        🟢 No product repeats across homepage sections right now.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {conflicts.map((c) => {
        const open = openId === c.id;
        return (
          <li key={c.id} className="overflow-hidden rounded-2xl border border-border bg-card">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-200">
                <Layers className="size-4" />
              </span>
              <div className="min-w-0 space-y-1.5">
                <p className="truncate text-sm font-medium">{c.product}</p>
                <div className="flex flex-wrap gap-1">
                  {c.sections.map((s) => (
                    <span
                      key={s}
                      className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${
                        s === c.winner
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-white/10 bg-white/5 text-muted-foreground"
                      }`}
                    >
                      {s}
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <button
                    onClick={() => onPreview(c)}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/10 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground transition hover:bg-white/5"
                  >
                    <Eye className="size-3.5" /> Preview
                  </button>
                  <button
                    onClick={() => setOpenId(open ? null : c.id)}
                    aria-expanded={open}
                    className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground transition hover:bg-white/5"
                  >
                    Why? <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>
            </div>

            {open && (
              <div className="space-y-2 border-t border-white/5 bg-white/[0.02] p-3.5 text-[11px] leading-relaxed">
                <p className="text-foreground/80">{c.why}</p>
                <p>
                  <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Winner · </span>
                  <span className="text-accent">{c.winner}</span>
                </p>
                <p className="text-muted-foreground">{c.improve}</p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
