/**
 * v11.0 — AI Task Inbox. One place for every recommendation, with a built-in
 * approval workflow (Current → Suggested → Expected result). Approving routes
 * through the existing deal mutations supplied by the page; nothing here
 * touches the backend directly.
 */
import { useMemo, useState } from "react";
import { Check, Clock, BellOff, ChevronDown, Inbox, Eye, ShieldCheck } from "lucide-react";
import { isLowRisk } from "@/lib/flash/flash-marketplace";
import type { QueueItem } from "@/lib/flash/flash-autonomy";
import { TASK_CATEGORY_LABEL, taskCategory, type TaskCategory, type TaskDiff } from "@/lib/flash/flash-assistant";

const URGENCY: Record<QueueItem["urgency"], { label: string; cls: string }> = {
  now: { label: "High", cls: "border-destructive/30 bg-destructive/10 text-destructive" },
  today: { label: "Medium", cls: "border-amber-500/30 bg-amber-500/10 text-amber-200" },
  soon: { label: "Low", cls: "border-white/10 bg-white/5 text-muted-foreground" },
};

const CONFIDENCE: Record<QueueItem["confidence"], string> = {
  high: "text-emerald-300",
  medium: "text-sky-300",
  low: "text-muted-foreground",
};

const FILTERS: { id: "all" | TaskCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "discount", label: "Discount" },
  { id: "schedule", label: "Schedule" },
  { id: "stock", label: "Stock risk" },
  { id: "ctr", label: "Low CTR" },
  { id: "priority", label: "Priority" },
  { id: "balance", label: "Balance" },
];

export function FlashTaskInbox({
  items, diffFor, onApprove, onReject, onSnooze, onPreview, onApproveMany, onRejectMany, limit = 10,
}: {
  items: QueueItem[];
  diffFor: (item: QueueItem) => TaskDiff;
  onApprove: (item: QueueItem) => void;
  onReject: (item: QueueItem) => void;
  onSnooze: (item: QueueItem) => void;
  onPreview: (item: QueueItem) => void;
  /** v12 — one-click operations. Both route through the same mutations. */
  onApproveMany?: (items: QueueItem[]) => void;
  onRejectMany?: (items: QueueItem[]) => void;
  limit?: number;
}) {
  const [filter, setFilter] = useState<"all" | TaskCategory>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

  const tagged = useMemo(() => items.map((i) => ({ item: i, category: taskCategory(i) })), [items]);
  const visible = filter === "all" ? tagged : tagged.filter((t) => t.category === filter);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of tagged) m.set(t.category, (m.get(t.category) ?? 0) + 1);
    return m;
  }, [tagged]);

  const lowRisk = useMemo(() => items.filter((i) => isLowRisk(i.confidence, i.urgency)), [items]);
  const selected = useMemo(() => items.filter((i) => picked.has(i.id)), [items, picked]);
  const clearPicked = () => setPicked(new Set());
  const togglePick = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const chip =
    "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-[10px] font-mono uppercase tracking-widest transition";
  const btn =
    "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[10px] font-mono uppercase tracking-widest transition";

  return (
    <section aria-label="AI task inbox" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
          <Inbox className="size-3.5" /> Task inbox
          <span className="tabular-nums text-accent">{items.length}</span>
        </span>
      </div>

      <div className="-mx-1 flex snap-x gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.filter((f) => f.id === "all" || (counts.get(f.id) ?? 0) > 0).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`${chip} snap-start ${
              filter === f.id ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"
            }`}
          >
            {f.label}
            <span className="tabular-nums opacity-70">{f.id === "all" ? items.length : counts.get(f.id) ?? 0}</span>
          </button>
        ))}
      </div>

      {(onApproveMany || onRejectMany) && items.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 rounded-2xl border border-white/8 bg-white/[0.02] p-2">
          {onApproveMany && (
            <button
              onClick={() => { onApproveMany(lowRisk); clearPicked(); }}
              disabled={lowRisk.length === 0}
              className={`${btn} border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-40`}
            >
              <ShieldCheck className="size-3" /> Approve all low-risk
              <span className="tabular-nums opacity-70">{lowRisk.length}</span>
            </button>
          )}
          {onApproveMany && (
            <button
              onClick={() => { onApproveMany(selected); clearPicked(); }}
              disabled={selected.length === 0}
              className={`${btn} border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-40`}
            >
              <Check className="size-3" /> Approve selected
            </button>
          )}
          {onRejectMany && (
            <button
              onClick={() => { onRejectMany(selected); clearPicked(); }}
              disabled={selected.length === 0}
              className={`${btn} border-white/10 text-muted-foreground hover:bg-white/5 disabled:opacity-40`}
            >
              <BellOff className="size-3" /> Reject selected
            </button>
          )}
          {selected.length > 0 && (
            <span className="px-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {selected.length} selected
            </span>
          )}
        </div>
      )}

      {visible.length === 0 ? (
        <p className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] p-6 text-center text-sm text-emerald-200">
          🟢 Inbox zero — nothing needs your attention right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {visible.slice(0, limit).map(({ item, category }) => {
            const open = openId === item.id;
            const diff = open ? diffFor(item) : null;
            const u = URGENCY[item.urgency];
            return (
              <li key={item.id} className="overflow-hidden rounded-2xl border border-border bg-card transition hover:border-white/15">
                <div className="p-3 sm:p-4">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(onApproveMany || onRejectMany) && (
                      <input
                        type="checkbox"
                        checked={picked.has(item.id)}
                        onChange={() => togglePick(item.id)}
                        aria-label={`Select ${item.title}`}
                        className="mr-1 size-4 accent-[var(--color-accent)]"
                      />
                    )}
                    <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${u.cls}`}>
                      {u.label} priority
                    </span>
                    <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                      {TASK_CATEGORY_LABEL[category]}
                    </span>
                    <span className={`text-[9px] font-mono uppercase tracking-widest ${CONFIDENCE[item.confidence]}`}>
                      {item.confidence} confidence
                    </span>
                  </div>

                  <p className="mt-1.5 truncate text-[11px] text-muted-foreground">{item.productName}</p>
                  <p className="mt-0.5 text-sm font-medium leading-snug">{item.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-muted-foreground">{item.reason}</p>
                  <p className="mt-1 text-[12px] text-emerald-300">{item.impact}</p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <button onClick={() => setOpenId(open ? null : item.id)} aria-expanded={open}
                      className={`${btn} border-accent/40 text-accent hover:bg-accent/10`}>
                      Review <ChevronDown className={`size-3.5 transition ${open ? "rotate-180" : ""}`} />
                    </button>
                    <button onClick={() => onPreview(item)} className={`${btn} border-white/10 text-muted-foreground hover:bg-white/5`}>
                      <Eye className="size-3" /> Preview
                    </button>
                    <button onClick={() => onSnooze(item)} className={`${btn} border-white/10 text-muted-foreground hover:bg-white/5`}>
                      <Clock className="size-3" /> Later
                    </button>
                    <button onClick={() => onReject(item)} className={`${btn} border-white/10 text-muted-foreground hover:bg-white/5`}>
                      <BellOff className="size-3" /> Ignore
                    </button>
                  </div>
                </div>

                {open && diff && (
                  <div className="animate-in fade-in slide-in-from-top-1 space-y-2 border-t border-white/5 bg-white/[0.02] p-3.5 duration-200 sm:p-4">
                    <DiffRow label="Current" value={diff.current} />
                    <DiffRow label="Suggested" value={diff.suggested} tone="text-foreground" />
                    <DiffRow label="Expected result" value={diff.expected} tone="text-emerald-300" />
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <button onClick={() => { setOpenId(null); onApprove(item); }}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-accent px-5 text-[10px] font-mono uppercase tracking-widest text-accent-foreground transition hover:opacity-90">
                        <Check className="size-3.5" /> Approve
                      </button>
                      <button onClick={() => { setOpenId(null); onReject(item); }}
                        className={`${btn} border-white/10 text-muted-foreground hover:bg-white/5`}>
                        Reject
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
          {visible.length > limit && (
            <li className="px-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              {visible.length - limit} more ranked below
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function DiffRow({ label, value, tone = "text-muted-foreground" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,88px)_minmax(0,1fr)] items-start gap-3">
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`text-[12px] leading-relaxed ${tone}`}>{value}</p>
    </div>
  );
}
