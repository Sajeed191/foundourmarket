/**
 * v10.0 — Live marketplace feed with severity filtering. Read-only derivation
 * of existing realtime deal state and events.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, Activity, Info, UserCheck } from "lucide-react";
import type { MarketFeedItem, FeedSeverity } from "@/lib/flash/flash-executive";

type FeedFilter = "all" | FeedSeverity | "mine";

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "info", label: "Info" },
  { key: "warning", label: "Warning" },
  { key: "critical", label: "Critical" },
  { key: "mine", label: "My actions" },
];

const TONE: Record<FeedSeverity, string> = {
  info: "text-sky-300",
  warning: "text-orange-300",
  critical: "text-destructive",
};

function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export function FlashLiveFeed({ items, now }: { items: MarketFeedItem[]; now: number }) {
  const [filter, setFilter] = useState<FeedFilter>("all");

  const shown = useMemo(
    () => items.filter((i) => (filter === "all" ? true : filter === "mine" ? i.mine : i.severity === filter)).slice(0, 20),
    [items, filter],
  );

  return (
    <div className="space-y-2">
      <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]{display:none}">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`shrink-0 snap-start rounded-full border px-3 min-h-9 text-[10px] font-mono uppercase tracking-widest transition ${
              filter === f.key ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"
            }`}>
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Nothing in this view yet.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {shown.map((i) => {
            const Icon = i.mine ? UserCheck : i.severity === "critical" ? AlertTriangle : i.severity === "warning" ? Activity : Info;
            return (
              <li key={i.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border bg-card px-3 py-2.5">
                <span className={`grid size-8 shrink-0 place-items-center rounded-full border border-white/10 ${i.mine ? "text-accent" : TONE[i.severity]}`}>
                  <Icon className="size-3.5" />
                </span>
                <p className="min-w-0 truncate text-xs">{i.text}</p>
                <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest tabular-nums text-muted-foreground">{ago(now - i.at)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
