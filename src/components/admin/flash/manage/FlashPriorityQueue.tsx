/**
 * AI Priority Queue — one ranked list instead of many scattered lists.
 * Each item explains why, what it should be worth, and offers Apply / Preview /
 * Ignore / Remind later. Applying reuses the existing deal mutations.
 */
import { memo } from "react";
import { Check, Eye, BellOff, Clock, Zap } from "lucide-react";
import type { QueueItem } from "@/lib/flash/flash-autonomy";

const URGENCY: Record<QueueItem["urgency"], { label: string; chip: string }> = {
  now: { label: "Now", chip: "border-destructive/30 bg-destructive/10 text-destructive" },
  today: { label: "Today", chip: "border-amber-500/30 bg-amber-500/10 text-amber-200" },
  soon: { label: "Soon", chip: "border-sky-500/30 bg-sky-500/10 text-sky-200" },
};

const CONFIDENCE: Record<QueueItem["confidence"], string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

function money(n: number) {
  return n >= 100000 ? `${Math.round(n / 1000)}k` : Math.round(n).toLocaleString();
}

export const FlashPriorityQueue = memo(function FlashPriorityQueue({
  items, limit = 6, onApply, onPreview, onIgnore, onRemind,
}: {
  items: QueueItem[];
  limit?: number;
  onApply: (item: QueueItem) => void;
  onPreview: (item: QueueItem) => void;
  onIgnore: (item: QueueItem) => void;
  onRemind: (item: QueueItem) => void;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-6 text-center">
        <p className="text-sm text-emerald-200">🟢 Nothing to optimize — every live deal is already well tuned.</p>
      </div>
    );
  }

  const btn =
    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[10px] font-mono uppercase tracking-widest transition";

  return (
    <ol className="space-y-2">
      {items.slice(0, limit).map((item, i) => {
        const u = URGENCY[item.urgency];
        return (
          <li key={item.id} className="rounded-2xl border border-border bg-card p-3 sm:p-4">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-[11px] font-mono tabular-nums text-accent">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${u.chip}`}>
                    {u.label}
                  </span>
                  <span className="truncate text-[11px] text-muted-foreground">{item.productName}</span>
                </div>
                <p className="mt-1.5 text-sm font-medium">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.reason}</p>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  <span className="text-emerald-300">+{money(item.revenueDelta)} rev</span>
                  <span className="text-sky-300">+{item.ctrDelta}% ctr</span>
                  <span>{item.inventoryNote}</span>
                  <span>{CONFIDENCE[item.confidence]}</span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <button onClick={() => onApply(item)} className={`${btn} border-accent/40 text-accent hover:bg-accent/10`}>
                    <Check className="size-3" /> Apply
                  </button>
                  <button onClick={() => onPreview(item)} className={`${btn} border-white/10 text-muted-foreground hover:bg-white/5`}>
                    <Eye className="size-3" /> Preview
                  </button>
                  <button onClick={() => onRemind(item)} className={`${btn} border-white/10 text-muted-foreground hover:bg-white/5`}>
                    <Clock className="size-3" /> Remind later
                  </button>
                  <button onClick={() => onIgnore(item)} className={`${btn} border-white/10 text-muted-foreground hover:bg-white/5`}>
                    <BellOff className="size-3" /> Ignore
                  </button>
                </div>
              </div>
            </div>
          </li>
        );
      })}
      {items.length > limit && (
        <li className="flex items-center gap-2 px-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <Zap className="size-3" /> {items.length - limit} more suggestions ranked below the top {limit}
        </li>
      )}
    </ol>
  );
});
