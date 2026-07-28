/**
 * v12.0 — Campaign journey. A calm timeline of where each live or upcoming
 * campaign sits: Draft → Scheduled → Live → Peak → Ending → Completed →
 * Archived. Derived from the existing lifecycle stage; read-only.
 */
import { JOURNEY_LABEL, JOURNEY_ORDER, type JourneyStage } from "@/lib/flash/flash-marketplace";

export type JourneyRow = { key: string; name: string; stage: JourneyStage; note: string };

export function FlashCampaignJourney({ rows }: { rows: JourneyRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">
        No campaigns in flight — create a deal to start a journey.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const idx = JOURNEY_ORDER.indexOf(r.stage);
        return (
          <li key={r.key} className="rounded-2xl border border-border bg-card p-3 sm:p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium">{r.name}</p>
              <span className="rounded-full border border-accent/30 bg-accent/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-accent">
                {JOURNEY_LABEL[r.stage]}
              </span>
            </div>

            <ol className="mt-3 grid grid-cols-7 gap-1" aria-label="Campaign journey">
              {JOURNEY_ORDER.map((s, i) => (
                <li key={s} className="min-w-0">
                  <span
                    aria-current={i === idx ? "step" : undefined}
                    className={`block h-1 rounded-full transition-colors ${
                      i < idx ? "bg-accent/40" : i === idx ? "bg-accent" : "bg-white/8"
                    }`}
                  />
                  <span
                    className={`mt-1 block truncate text-[8px] font-mono uppercase tracking-widest ${
                      i === idx ? "text-accent" : "text-muted-foreground/60"
                    }`}
                  >
                    {JOURNEY_LABEL[s]}
                  </span>
                </li>
              ))}
            </ol>

            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{r.note}</p>
          </li>
        );
      })}
    </ul>
  );
}
