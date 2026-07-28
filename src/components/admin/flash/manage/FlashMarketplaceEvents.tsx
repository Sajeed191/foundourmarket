/**
 * v12.0 — Marketplace events. The existing live feed, grouped by day so the
 * marketplace reads as a story instead of a stream. Read-only.
 */
import { Circle } from "lucide-react";
import type { EventDay } from "@/lib/flash/flash-marketplace";
import type { FeedSeverity } from "@/lib/flash/flash-executive";

const DOT: Record<FeedSeverity, string> = {
  info: "text-sky-400/70",
  warning: "text-amber-400/80",
  critical: "text-destructive",
};

const TIME = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });

export function FlashMarketplaceEvents({ days, limit = 4 }: { days: EventDay[]; limit?: number }) {
  if (days.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-5 text-center text-sm text-muted-foreground">
        No marketplace events recorded yet today.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {days.slice(0, limit).map((d) => (
        <section key={d.key}>
          <h4 className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">{d.label}</h4>
          <ul className="mt-2 space-y-1.5 border-l border-white/5 pl-3">
            {d.items.slice(0, 12).map((item) => (
              <li key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2 text-[11px]">
                <Circle className={`mt-1 size-2 fill-current ${DOT[item.severity]}`} />
                <span className={item.mine ? "text-foreground/90" : "text-muted-foreground"}>{item.text}</span>
                <span className="shrink-0 font-mono tabular-nums text-[9px] text-muted-foreground/70">
                  {TIME.format(new Date(item.at))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
