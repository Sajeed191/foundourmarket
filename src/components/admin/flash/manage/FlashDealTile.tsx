/**
 * Manage-first deal tile: image-dominant, one glance status, direct actions.
 * Purely presentational — every action is delegated to the page, which reuses
 * the existing Supabase mutations.
 */
import { memo, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  GripVertical, Pencil, Pause, Play, Square, Trash2, Copy, CalendarClock,
  AlertTriangle, Clock, ImageOff, PackageX, BadgeX, EyeOff, Percent, Layers,
} from "lucide-react";
import type { WarningKey } from "@/lib/flash/flash-health";
import type { DealEntry } from "@/lib/flash/use-flash-admin";

/** Visual status derived from existing status + remaining time. No new logic. */
export type TileStatus = "active" | "ending_soon" | "scheduled" | "expired" | "paused" | "no_deal";

export function tileStatus(e: DealEntry): TileStatus {
  if (!e.deal) return "no_deal";
  if (e.status === "paused") return "paused";
  if (e.status === "expired") return "expired";
  if (e.status === "scheduled") return "scheduled";
  if (e.msRemaining != null && e.msRemaining < 6 * 3600_000) return "ending_soon";
  return "active";
}

const STATUS_STYLE: Record<TileStatus, string> = {
  active: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
  ending_soon: "border-orange-500/40 text-orange-300 bg-orange-500/10",
  scheduled: "border-sky-500/40 text-sky-300 bg-sky-500/10",
  expired: "border-destructive/40 text-destructive bg-destructive/10",
  paused: "border-white/15 text-muted-foreground bg-white/5",
  no_deal: "border-white/15 text-muted-foreground bg-white/5",
};

const STATUS_LABEL: Record<TileStatus, string> = {
  active: "Active",
  ending_soon: "Ending soon",
  scheduled: "Scheduled",
  expired: "Expired",
  paused: "Paused",
  no_deal: "Badge only",
};

const WARNING_ICON: Record<WarningKey, typeof AlertTriangle> = {
  expired: Clock,
  inactive: Pause,
  out_of_stock: PackageX,
  badge_missing: BadgeX,
  price_conflict: Percent,
  priority_conflict: Layers,
  hidden_by_rules: EyeOff,
  over_discount: Percent,
};

const WARNING_TEXT: Record<WarningKey, string> = {
  expired: "This deal has ended",
  inactive: "Paused — not visible to shoppers",
  out_of_stock: "Out of stock",
  badge_missing: "Missing flash badge — cannot appear on the homepage",
  price_conflict: "Flash price is not below the regular price",
  priority_conflict: "Shares priority with another active deal",
  hidden_by_rules: "Hidden by homepage rules today",
  over_discount: "Discount above the guardrail",
};

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
  onDuplicate: (e: DealEntry) => void;
  onShift: (e: DealEntry, hours: number) => void;
  onEndNow: (e: DealEntry) => void;
  onDelete: (e: DealEntry) => void;
  onOpenIntel?: (key: string) => void;
};

export const FlashDealTile = memo(function FlashDealTile({
  entry, intel, selected, onSelect, draggable = false, onDragStart, onDragOver, onDrop, actions,
}: {
  entry: DealEntry;
  intel?: { score: number; recommendation: string } | null;
  selected?: boolean;
  onSelect?: (key: string, next: boolean) => void;
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (ev: React.DragEvent) => void;
  onDrop?: () => void;
  actions: TileActions;
}) {
  const status = tileStatus(entry);
  useTick(status === "active" || status === "ending_soon" || status === "scheduled");
  const [scheduleOpen, setScheduleOpen] = useState(false);

  const p = entry.product;
  const deal = entry.deal;
  const now = Date.now();
  const countdown = deal
    ? status === "scheduled"
      ? `Starts in ${remaining(new Date(deal.start_at).getTime() - now)}`
      : status === "active" || status === "ending_soon"
        ? `Ends in ${remaining(new Date(deal.end_at).getTime() - now)}`
        : STATUS_LABEL[status]
    : "No schedule";

  const warnings: WarningKey[] = [...entry.warnings];
  if (!p.image) warnings.push("badge_missing");
  const showWarnings = entry.warnings;

  const btn = "size-11 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition";

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group relative overflow-hidden rounded-2xl border bg-card transition-colors ${
        selected ? "border-accent/50" : "border-border"
      }`}
    >
      <div className="flex items-stretch gap-3 p-3">
        {onSelect && (
          <input type="checkbox" checked={!!selected} onChange={(ev) => onSelect(entry.key, ev.target.checked)}
            aria-label={`Select ${p.name}`} className="mt-1 size-4 shrink-0 accent-[var(--color-accent)]" />
        )}
        {draggable && (
          <div className="hidden w-5 cursor-grab place-items-center text-muted-foreground/60 active:cursor-grabbing sm:grid"
            aria-label="Drag to reorder">
            <GripVertical className="size-4" />
          </div>
        )}

        <div className="relative size-20 shrink-0 overflow-hidden rounded-xl bg-black/40 ring-1 ring-white/10 sm:size-24">
          {p.image ? (
            <img loading="lazy" decoding="async" src={p.image} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-muted-foreground"><ImageOff className="size-5" /></span>
          )}
          {entry.discountPct > 0 && (
            <span className="absolute left-1 top-1 rounded-md bg-accent px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-accent-foreground">
              -{entry.discountPct}%
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="line-clamp-2 text-sm font-medium leading-snug">{p.name}</h3>
            <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${STATUS_STYLE[status]}`}>
              {STATUS_LABEL[status]}
            </span>
          </div>

          <p className="mt-1 text-sm tabular-nums">
            <span className="font-semibold text-accent">{entry.dealPrice.toLocaleString()}</span>
            {entry.regularPrice > entry.dealPrice && (
              <span className="ml-2 text-xs text-muted-foreground line-through">{entry.regularPrice.toLocaleString()}</span>
            )}
            <span className="ml-3 text-xs text-muted-foreground">{p.stockQuantity} in stock</span>
          </p>

          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono uppercase tracking-widest tabular-nums text-muted-foreground">
            <span className="inline-flex items-center gap-1"><Clock className="size-3" /> {countdown}</span>
            {deal && <span>priority {deal.priority}</span>}
            {entry.campaign && <span className="text-accent/80">{entry.campaign}</span>}
          </p>

          {showWarnings.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {showWarnings.map((w) => {
                const Icon = WARNING_ICON[w];
                return (
                  <button key={w} type="button" title={WARNING_TEXT[w]} aria-label={WARNING_TEXT[w]}
                    onClick={() => actions.onOpenIntel?.(entry.key)}
                    className="grid size-7 place-items-center rounded-full border border-amber-500/25 bg-amber-500/10 text-amber-200 transition hover:bg-amber-500/20">
                    <Icon className="size-3" />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 px-3 py-2">
        <div className="flex items-center gap-3 text-[10px] font-mono uppercase tracking-widest tabular-nums text-muted-foreground">
          <span>{entry.stats.views} views</span>
          <span>{entry.stats.clicks} clicks</span>
          <span>{entry.stats.purchases} sales</span>
        </div>
        {deal && (
          <div className="flex items-center gap-1">
            <button onClick={() => actions.onEdit(entry)} aria-label="Edit deal" className={btn}><Pencil className="size-3.5" /></button>
            <button onClick={() => actions.onPause(entry)} aria-label={deal.active ? "Pause deal" : "Resume deal"} className={btn}>
              {deal.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
            </button>
            <button onClick={() => actions.onDuplicate(entry)} aria-label="Duplicate deal" className={btn}><Copy className="size-3.5" /></button>
            <button onClick={() => setScheduleOpen((v) => !v)} aria-expanded={scheduleOpen} aria-label="Move schedule" className={btn}>
              <CalendarClock className="size-3.5" />
            </button>
            <button onClick={() => actions.onEndNow(entry)} aria-label="End deal now" className={btn}><Square className="size-3.5" /></button>
            <button onClick={() => actions.onDelete(entry)} aria-label="Delete deal"
              className="grid size-11 place-items-center rounded-full border border-destructive/30 text-destructive transition hover:bg-destructive/10">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </div>

      {scheduleOpen && deal && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-3 py-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Move window</span>
          {([-24, -6, -1, 1, 6, 24] as const).map((h) => (
            <button key={h} onClick={() => { actions.onShift(entry, h); setScheduleOpen(false); }}
              className="rounded-full border border-white/10 px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
              {h > 0 ? `+${h}h` : `${h}h`}
            </button>
          ))}
        </div>
      )}

      {intel && actions.onOpenIntel && (
        <button onClick={() => actions.onOpenIntel!(entry.key)}
          className="flex w-full items-center justify-between gap-2 border-t border-border/60 px-3 min-h-11 text-left transition hover:bg-white/5">
          <span className="truncate text-[11px] text-muted-foreground">{intel.recommendation}</span>
          <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest text-accent">Score {intel.score}</span>
        </button>
      )}
    </motion.article>
  );
});
