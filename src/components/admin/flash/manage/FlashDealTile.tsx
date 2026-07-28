/**
 * Manage-first deal tile: image-dominant, one glance status, direct actions.
 * Used by the Active and Scheduled sections of the Flash Deals admin page.
 */
import { memo, useEffect, useState } from "react";
import {
  GripVertical, Pencil, Pause, Play, Square, Trash2, Pin, PinOff, AlertTriangle, Clock,
} from "lucide-react";
import { WARNING_LABEL } from "@/lib/flash/flash-health";
import type { DealEntry } from "@/lib/flash/use-flash-admin";

const STATUS_STYLE: Record<string, string> = {
  active: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
  scheduled: "border-sky-500/40 text-sky-300 bg-sky-500/10",
  paused: "border-amber-500/40 text-amber-300 bg-amber-500/10",
  expired: "border-white/10 text-muted-foreground bg-white/5",
  no_deal: "border-white/10 text-muted-foreground bg-white/5",
};

/** Live countdown/lead-in label that ticks every second. */
function useTick(enabled: boolean) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setN((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [enabled]);
}

function remaining(ms: number) {
  if (ms <= 0) return "0m";
  const d = Math.floor(ms / 86400_000);
  const h = Math.floor((ms % 86400_000) / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

export type TileActions = {
  onEdit: (e: DealEntry) => void;
  onPause: (e: DealEntry) => void;
  onEndNow: (e: DealEntry) => void;
  onDelete: (e: DealEntry) => void;
  onPin: (e: DealEntry) => void;
  onOpenIntel?: (key: string) => void;
};

export const FlashDealTile = memo(function FlashDealTile({
  entry, intel, draggable = false, onDragStart, onDragOver, onDrop, actions,
}: {
  entry: DealEntry;
  intel?: { score: number; recommendation: string } | null;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (ev: React.DragEvent) => void;
  onDrop?: () => void;
  actions: TileActions;
}) {
  const live = entry.status === "active" || entry.status === "scheduled";
  useTick(live);

  const p = entry.product;
  const deal = entry.deal;
  const pinned = (deal?.priority ?? 0) > 0;
  const now = Date.now();
  const label = deal
    ? entry.status === "scheduled"
      ? `Starts in ${remaining(new Date(deal.start_at).getTime() - now)}`
      : entry.status === "active"
        ? `Ends in ${remaining(new Date(deal.end_at).getTime() - now)}`
        : entry.status === "paused"
          ? "Paused"
          : "Ended"
    : "No schedule";

  return (
    <article
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="group relative overflow-hidden rounded-2xl border border-border bg-card"
    >
      <div className="flex items-stretch gap-3 p-3">
        {draggable && (
          <div className="hidden sm:grid place-items-center w-6 -ml-1 cursor-grab active:cursor-grabbing text-muted-foreground/60"
            aria-label="Drag to reorder">
            <GripVertical className="size-4" />
          </div>
        )}

        <div className="relative size-20 sm:size-24 shrink-0 overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/10">
          {p.image && <img loading="lazy" decoding="async" src={p.image} alt="" className="size-full object-cover" />}
          {entry.discountPct > 0 && (
            <span className="absolute left-1 top-1 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground tabular-nums">
              -{entry.discountPct}%
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-medium leading-snug line-clamp-2">{p.name}</h3>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${STATUS_STYLE[entry.status]}`}>
              {entry.status === "no_deal" ? "badge only" : entry.status}
            </span>
          </div>

          <p className="mt-1 text-sm tabular-nums">
            <span className="font-semibold text-accent">{entry.dealPrice.toLocaleString()}</span>
            {entry.regularPrice > entry.dealPrice && (
              <span className="ml-2 text-xs text-muted-foreground line-through">{entry.regularPrice.toLocaleString()}</span>
            )}
            <span className="ml-3 text-xs text-muted-foreground">{p.stockQuantity} in stock</span>
          </p>

          <p className="mt-1 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground tabular-nums">
            <Clock className="size-3" /> {label}
          </p>

          {entry.warnings.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {entry.warnings.slice(0, 3).map((w) => (
                <span key={w} className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-amber-200">
                  <AlertTriangle className="size-2.5" /> {WARNING_LABEL[w]}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground tabular-nums">
          <span>{entry.stats.views} views</span>
          <span>{entry.stats.clicks} clicks</span>
          <span>{entry.stats.purchases} sales</span>
        </div>
        <div className="flex items-center gap-1">
          {deal && (
            <>
              <button onClick={() => actions.onPin(entry)} aria-label={pinned ? "Unpin from hero" : "Pin to hero"}
                className="size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition">
                {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
              </button>
              <button onClick={() => actions.onEdit(entry)} aria-label="Edit deal"
                className="size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition">
                <Pencil className="size-3.5" />
              </button>
              <button onClick={() => actions.onPause(entry)} aria-label={deal.active ? "Pause deal" : "Resume deal"}
                className="size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition">
                {deal.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
              </button>
              <button onClick={() => actions.onEndNow(entry)} aria-label="End deal now"
                className="size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition">
                <Square className="size-3.5" />
              </button>
              <button onClick={() => actions.onDelete(entry)} aria-label="Delete deal"
                className="size-11 grid place-items-center rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10 transition">
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {intel && actions.onOpenIntel && (
        <button onClick={() => actions.onOpenIntel!(entry.key)}
          className="w-full flex items-center justify-between gap-2 border-t border-border/60 px-3 min-h-11 text-left hover:bg-white/5 transition">
          <span className="truncate text-[11px] text-muted-foreground">{intel.recommendation}</span>
          <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest text-accent">Score {intel.score}</span>
        </button>
      )}
    </article>
  );
});
