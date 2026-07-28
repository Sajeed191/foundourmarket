/**
 * Deal row: health, warnings, performance and inline actions.
 */
import { memo } from "react";
import { Pencil, Pause, Play, Trash2, Pin, PinOff, Flame, AlertTriangle } from "lucide-react";
import { WARNING_LABEL, type HealthTone } from "@/lib/flash/flash-health";
import type { DealEntry } from "@/lib/flash/use-flash-admin";

const TONE: Record<HealthTone, string> = {
  green: "text-emerald-300 border-emerald-500/30 bg-emerald-500/10",
  blue: "text-sky-300 border-sky-500/30 bg-sky-500/10",
  amber: "text-amber-300 border-amber-500/30 bg-amber-500/10",
  red: "text-destructive border-destructive/30 bg-destructive/10",
};

const STATUS_STYLE: Record<string, string> = {
  active: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
  scheduled: "border-sky-500/40 text-sky-300 bg-sky-500/10",
  paused: "border-amber-500/40 text-amber-300 bg-amber-500/10",
  expired: "border-white/10 text-muted-foreground bg-white/5",
  no_deal: "border-white/10 text-muted-foreground bg-white/5",
};

export const FlashDealCard = memo(function FlashDealCard({
  entry, selected, onSelect, onEdit, onToggle, onDelete, onPin, onCreate,
}: {
  entry: DealEntry;
  selected: boolean;
  onSelect: (key: string, next: boolean) => void;
  onEdit: (e: DealEntry) => void;
  onToggle: (e: DealEntry) => void;
  onDelete: (e: DealEntry) => void;
  onPin: (e: DealEntry) => void;
  onCreate: (e: DealEntry) => void;
}) {
  const p = entry.product;
  const pinned = (entry.deal?.priority ?? 0) > 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-3 space-y-2.5">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={selected}
          onChange={(e) => onSelect(entry.key, e.target.checked)}
          aria-label={`Select ${p.name}`}
          className="mt-1 size-4 accent-[var(--color-accent)]"
        />
        <div className="size-12 shrink-0 rounded-xl overflow-hidden bg-black/40 ring-1 ring-white/10">
          {p.image && <img loading="lazy" decoding="async" src={p.image} alt="" className="size-full object-cover" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{p.name}</p>
          <p className="text-[11px] text-muted-foreground tabular-nums">
            <span className="line-through mr-1.5">{entry.regularPrice}</span>
            <span className="text-accent font-semibold">{entry.dealPrice}</span>
            {entry.discountPct > 0 && <span className="ml-1.5 text-accent">-{entry.discountPct}%</span>}
            <span className="ml-2">stock {p.stockQuantity}</span>
            {entry.deal && <span className="ml-2">· priority {entry.deal.priority}</span>}
          </p>
          {entry.deal && (
            <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
              {new Date(entry.deal.start_at).toLocaleString()} → {new Date(entry.deal.end_at).toLocaleString()}
            </p>
          )}
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest ${STATUS_STYLE[entry.status]}`}>
          {entry.status === "no_deal" ? "badge only" : entry.status}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${TONE[entry.health.tone]}`}>
          health {entry.health.score}
        </span>
        {entry.campaign && (
          <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {entry.campaign}
          </span>
        )}
        {entry.warnings.map((w) => (
          <span key={w} className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-200 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest">
            <AlertTriangle className="size-2.5" /> {WARNING_LABEL[w]}
          </span>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">{entry.health.recommendation}</p>

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground tabular-nums">
          <span>{entry.stats.views} views</span>
          <span>{entry.stats.clicks} clicks</span>
          <span>{entry.stats.purchases} sales</span>
          <span>{entry.stats.ctr.toFixed(1)}% ctr</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {entry.deal ? (
            <>
              <button onClick={() => onPin(entry)} aria-label={pinned ? "Unpin hero" : "Pin hero"}
                className="size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition">
                {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </button>
              <button onClick={() => onEdit(entry)} aria-label="Edit deal"
                className="size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition">
                <Pencil className="size-3.5" />
              </button>
              <button onClick={() => onToggle(entry)} aria-label={entry.deal.active ? "Pause deal" : "Resume deal"}
                className="size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition">
                {entry.deal.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </button>
              <button onClick={() => onDelete(entry)} aria-label="Delete deal"
                className="size-11 grid place-items-center rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10 transition">
                <Trash2 className="size-3.5" />
              </button>
            </>
          ) : (
            <button onClick={() => onCreate(entry)}
              className="inline-flex items-center gap-2 rounded-full border border-accent/40 text-accent px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-accent/10 transition">
              <Flame className="size-3.5" /> Add deal
            </button>
          )}
        </div>
      </div>
    </div>
  );
});
