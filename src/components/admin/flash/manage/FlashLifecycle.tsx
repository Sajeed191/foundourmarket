/**
 * v10.0 — Deal lifecycle timeline. Shows where each deal sits between
 * "created" and "archived". Purely derived from existing deal state.
 */
import type { DealEntry } from "@/lib/flash/use-flash-admin";
import { LIFECYCLE_LABEL, LIFECYCLE_ORDER, lifecycleStage, type LifecycleStage } from "@/lib/flash/flash-executive";

const STAGE_TONE: Record<LifecycleStage, string> = {
  created: "bg-white/25",
  scheduled: "bg-sky-400",
  live: "bg-emerald-400",
  trending: "bg-accent",
  ending_soon: "bg-orange-400",
  expired: "bg-white/20",
  archived: "bg-white/12",
};

export function FlashLifecycle({
  entries, avgCtr, now, onOpen, limit = 12,
}: {
  entries: DealEntry[];
  avgCtr: number;
  now: number;
  onOpen: (entry: DealEntry) => void;
  limit?: number;
}) {
  const rows = entries.filter((e) => e.deal).slice(0, limit);

  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No deals to track yet.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((e) => {
        const stage = lifecycleStage(e, avgCtr, now);
        const idx = LIFECYCLE_ORDER.indexOf(stage);
        return (
          <li key={e.key}>
            <button onClick={() => onOpen(e)}
              className="w-full rounded-2xl border border-border bg-card p-3.5 text-left transition hover:bg-white/[0.03]">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <p className="truncate text-sm font-medium">{e.product.name}</p>
                <span className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                  {LIFECYCLE_LABEL[stage]}
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-1">
                {LIFECYCLE_ORDER.map((s, i) => (
                  <span key={s} className="flex-1">
                    <span className={`block h-1 rounded-full transition ${i <= idx ? STAGE_TONE[stage] : "bg-white/8"}`} />
                  </span>
                ))}
              </div>
              <div className="mt-1.5 hidden justify-between text-[9px] font-mono uppercase tracking-widest text-muted-foreground sm:flex">
                {LIFECYCLE_ORDER.map((s) => <span key={s} className="truncate">{LIFECYCLE_LABEL[s]}</span>)}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
