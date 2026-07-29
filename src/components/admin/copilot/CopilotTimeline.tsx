/**
 * CopilotTimeline — what the Copilot surfaced and what happened next.
 */
import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  filterTimeline,
  readTimeline,
  subscribeTimeline,
  TIMELINE_LABEL,
  type TimelineEntry,
  type TimelineRange,
} from "@/lib/copilot/timeline";

const RANGES: { id: TimelineRange; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
];

const KIND_TONE: Record<string, string> = {
  recommendation: "border-accent/40 text-accent",
  auto_fix: "border-emerald-400/40 text-emerald-300",
  admin_action: "border-sky-400/40 text-sky-300",
  marketplace_event: "border-border/50 text-muted-foreground",
  flash_change: "border-amber-400/40 text-amber-300",
  improvement: "border-violet-400/40 text-violet-300",
};

export function CopilotTimeline() {
  const [entries, setEntries] = useState<TimelineEntry[]>([]);
  const [range, setRange] = useState<TimelineRange>("7d");

  useEffect(() => {
    setEntries(readTimeline());
    return subscribeTimeline(() => setEntries(readTimeline()));
  }, []);

  const visible = filterTimeline(entries, range);

  return (
    <section className="card-premium rounded-2xl p-5" aria-label="Copilot timeline">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          <History className="size-3.5" /> Timeline
        </div>
        <div className="ml-auto flex gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRange(r.id)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition",
                range === r.id
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-border/40 bg-card/40 text-muted-foreground hover:text-foreground",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="mt-4 text-xs text-muted-foreground">No activity recorded in this window yet.</p>
      ) : (
        <ol className="mt-4 space-y-2">
          {visible.map((e) => (
            <li key={e.id} className="flex items-start gap-3 rounded-xl border border-border/40 bg-card/30 p-3">
              <span className={cn("mt-0.5 shrink-0 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wide", KIND_TONE[e.kind])}>
                {TIMELINE_LABEL[e.kind]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium">{e.title}</div>
                {e.detail && <div className="mt-0.5 text-[11px] text-muted-foreground">{e.detail}</div>}
                {e.subject && <div className="mt-0.5 text-[11px] text-muted-foreground/80">{e.subject}</div>}
              </div>
              <time className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                {new Date(e.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
