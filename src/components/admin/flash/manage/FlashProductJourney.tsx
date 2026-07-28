/**
 * v10.0 — Product journey. Merchandising history for one product, assembled
 * from existing deals, events and rotation windows. Read-only sheet.
 */
import { X } from "lucide-react";
import type { ProductJourney } from "@/lib/flash/flash-executive";

export function FlashProductJourney({ journey, onClose }: { journey: ProductJourney; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 backdrop-blur-sm sm:place-items-center sm:p-4" onClick={onClose}>
      <div
        role="dialog" aria-label={`${journey.name} merchandising history`}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-border bg-card p-5 sm:max-w-lg sm:rounded-3xl"
      >
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Product journey</p>
            <h3 className="truncate font-display text-lg font-semibold">{journey.name}</h3>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="grid size-11 shrink-0 place-items-center rounded-full border border-white/10 hover:bg-white/5">
            <X className="size-4" />
          </button>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {journey.stats.map((s) => (
            <div key={s.label} className="min-w-0 rounded-xl border border-white/5 bg-white/[0.02] p-2.5">
              <p className="truncate text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{s.label}</p>
              <p className="truncate text-sm font-medium tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>

        <Section title="Previous discounts">
          {journey.discounts.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">No discounts recorded yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {journey.discounts.map((d, i) => (
                <span key={`${d}-${i}`} className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono tabular-nums text-muted-foreground">
                  {d}%
                </span>
              ))}
            </div>
          )}
        </Section>

        <Section title="Campaign history">
          {journey.campaigns.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">Never assigned to a campaign.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {journey.campaigns.map((c) => (
                <span key={c} className="rounded-full border border-accent/20 bg-accent/[0.06] px-2 py-0.5 text-[10px] text-accent">{c}</span>
              ))}
            </div>
          )}
        </Section>

        <Section title="Rotation history">
          <ul className="space-y-1.5">
            {journey.rotation.map((r) => (
              <li key={r.window} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 text-[11px]">
                <span className="w-10 shrink-0 font-mono uppercase tracking-widest text-muted-foreground">{r.window}</span>
                <span className="h-1 rounded-full bg-white/8">
                  <span className={`block h-full rounded-full ${r.slot ? "bg-accent" : "bg-white/10"}`} style={{ width: r.slot ? `${Math.max(15, 100 - r.slot * 12)}%` : "8%" }} />
                </span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{r.slot ? `Slot ${r.slot}` : "Hidden"}</span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}
