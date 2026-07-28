/**
 * Scheduled deals grouped by start day: Today / Tomorrow / This week / Later.
 * Compact rows with the same actions as the live tiles.
 */
import { useEffect, useState } from "react";
import { Pencil, Copy, X } from "lucide-react";
import type { DealEntry } from "@/lib/flash/use-flash-admin";

const DAY = 86400_000;

function groupOf(startMs: number, now: number): "Today" | "Tomorrow" | "This week" | "Later" {
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  if (startMs < startOfToday + DAY) return "Today";
  if (startMs < startOfToday + 2 * DAY) return "Tomorrow";
  if (startMs < startOfToday + 7 * DAY) return "This week";
  return "Later";
}

function until(ms: number) {
  if (ms <= 0) return "now";
  const d = Math.floor(ms / DAY);
  const h = Math.floor((ms % DAY) / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

export function FlashScheduledGroups({
  entries, onEdit, onDuplicate, onCancel,
}: {
  entries: DealEntry[];
  onEdit: (e: DealEntry) => void;
  onDuplicate: (e: DealEntry) => void;
  onCancel: (e: DealEntry) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const order = ["Today", "Tomorrow", "This week", "Later"] as const;
  const buckets = new Map<string, DealEntry[]>();
  for (const e of entries) {
    if (!e.deal) continue;
    const g = groupOf(new Date(e.deal.start_at).getTime(), now);
    buckets.set(g, [...(buckets.get(g) ?? []), e]);
  }

  const btn = "size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition";

  return (
    <div className="space-y-4">
      {order.filter((g) => buckets.get(g)?.length).map((g) => (
        <div key={g} className="space-y-2">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
            {g} · <span className="tabular-nums">{buckets.get(g)!.length}</span>
          </p>
          <ul className="space-y-2">
            {buckets.get(g)!.map((e) => {
              const start = new Date(e.deal!.start_at);
              return (
                <li key={e.key} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card p-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="size-12 shrink-0 overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/10">
                      {e.product.image && <img loading="lazy" decoding="async" src={e.product.image} alt="" className="size-full object-cover" />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{e.product.name}</p>
                      <p className="text-[11px] tabular-nums text-muted-foreground">
                        {start.toLocaleDateString()} · {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ·{" "}
                        <span className="text-accent">{e.dealPrice.toLocaleString()}</span> · priority {e.deal!.priority}
                      </p>
                      <p className="text-[10px] font-mono uppercase tracking-widest tabular-nums text-sky-300">
                        starts in {until(start.getTime() - now)}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => onEdit(e)} aria-label="Edit scheduled deal" className={btn}><Pencil className="size-3.5" /></button>
                    <button onClick={() => onDuplicate(e)} aria-label="Duplicate scheduled deal" className={btn}><Copy className="size-3.5" /></button>
                    <button onClick={() => onCancel(e)} aria-label="Cancel scheduled deal"
                      className="grid size-11 place-items-center rounded-full border border-destructive/30 text-destructive transition hover:bg-destructive/10">
                      <X className="size-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
