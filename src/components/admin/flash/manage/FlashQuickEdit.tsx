/**
 * Inline quick edit for a flash deal — price, priority and end time without
 * leaving the workspace. Purely a form: the page performs the existing
 * `flash_deals` update mutation through `onSave`.
 */
import { useState } from "react";
import { Check, X } from "lucide-react";
import type { DealEntry, FlashDealRow } from "@/lib/flash/use-flash-admin";

/** Converts an ISO timestamp into the value a datetime-local input expects. */
function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60_000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}

export function FlashQuickEdit({
  entry, onSave, onClose,
}: {
  entry: DealEntry;
  onSave: (entry: DealEntry, patch: Partial<FlashDealRow>) => void | Promise<void>;
  onClose: () => void;
}) {
  const deal = entry.deal!;
  const [price, setPrice] = useState(String(deal.flash_price));
  const [priority, setPriority] = useState(String(deal.priority));
  const [endAt, setEndAt] = useState(toLocalInput(deal.end_at));
  const [saving, setSaving] = useState(false);

  const nextPrice = Number(price);
  const pct =
    entry.regularPrice > 0 && nextPrice > 0 && nextPrice < entry.regularPrice
      ? Math.round(((entry.regularPrice - nextPrice) / entry.regularPrice) * 100)
      : 0;
  const valid = nextPrice > 0 && !Number.isNaN(Number(priority)) && !!endAt;

  async function save() {
    if (!valid) return;
    setSaving(true);
    const patch: Partial<FlashDealRow> = {};
    if (nextPrice !== deal.flash_price) patch.flash_price = nextPrice;
    if (Number(priority) !== deal.priority) patch.priority = Number(priority);
    const nextEnd = new Date(endAt).toISOString();
    if (nextEnd !== new Date(deal.end_at).toISOString()) patch.end_at = nextEnd;
    if (Object.keys(patch).length > 0) await onSave(entry, patch);
    setSaving(false);
    onClose();
  }

  const field = "w-full rounded-xl border border-white/10 bg-background px-3 py-2 text-sm tabular-nums outline-none focus:border-accent";
  const label = "block text-[10px] font-mono uppercase tracking-widest text-muted-foreground";

  return (
    <div className="space-y-3 border-t border-border/60 bg-white/[0.02] px-3 py-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <label className={label} htmlFor={`qe-price-${deal.id}`}>Flash price</label>
          <input id={`qe-price-${deal.id}`} inputMode="numeric" value={price}
            onChange={(e) => setPrice(e.target.value)} className={field} />
          <p className="text-[10px] font-mono text-muted-foreground tabular-nums">
            {pct > 0 ? `-${pct}% vs ${entry.regularPrice.toLocaleString()}` : "Must be below the regular price"}
          </p>
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor={`qe-prio-${deal.id}`}>Priority</label>
          <input id={`qe-prio-${deal.id}`} inputMode="numeric" value={priority}
            onChange={(e) => setPriority(e.target.value)} className={field} />
        </div>
        <div className="space-y-1">
          <label className={label} htmlFor={`qe-end-${deal.id}`}>Ends</label>
          <input id={`qe-end-${deal.id}`} type="datetime-local" value={endAt}
            onChange={(e) => setEndAt(e.target.value)} className={field} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={() => void save()} disabled={!valid || saving}
          className="inline-flex items-center gap-2 rounded-full bg-accent px-4 min-h-11 text-[10px] font-mono uppercase tracking-widest text-accent-foreground transition hover:opacity-90 disabled:opacity-40">
          <Check className="size-3.5" /> {saving ? "Saving…" : "Save"}
        </button>
        <button onClick={onClose}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 min-h-11 text-[10px] font-mono uppercase tracking-widest text-muted-foreground transition hover:bg-white/5">
          <X className="size-3.5" /> Cancel
        </button>
      </div>
    </div>
  );
}
