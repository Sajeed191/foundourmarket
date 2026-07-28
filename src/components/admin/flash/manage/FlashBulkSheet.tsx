/**
 * Bulk edit sheet — applies existing deal mutations to the current selection.
 * Presentation only: the page owns every Supabase call.
 */
import { useState } from "react";
import { Loader2, SquarePen } from "lucide-react";

export type BulkPatch = {
  activate?: boolean;
  extendHours?: number;
  priority?: number | null;
  assignBadge?: boolean;
};

export function FlashBulkSheet({
  count, onApply, onClose,
}: {
  count: number;
  onApply: (patch: BulkPatch) => Promise<void>;
  onClose: () => void;
}) {
  const [activate, setActivate] = useState<"keep" | "on" | "off">("keep");
  const [extend, setExtend] = useState("0");
  const [priority, setPriority] = useState("");
  const [badge, setBadge] = useState(false);
  const [saving, setSaving] = useState(false);

  async function apply() {
    setSaving(true);
    try {
      await onApply({
        activate: activate === "keep" ? undefined : activate === "on",
        extendHours: Number(extend) || undefined,
        priority: priority === "" ? undefined : Number(priority),
        assignBadge: badge || undefined,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const field = "w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-black/60 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" onClick={onClose}>
      <div role="dialog" aria-label="Bulk edit deals" onClick={(e) => e.stopPropagation()}
        className="w-full space-y-4 rounded-t-3xl border border-border bg-card p-5 sm:max-w-md sm:rounded-3xl">
        <h3 className="flex items-center gap-2 font-display font-semibold">
          <SquarePen className="size-4 text-accent" /> Bulk edit · {count} selected
        </h3>

        <label className="block space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Status</span>
          <select value={activate} onChange={(e) => setActivate(e.target.value as typeof activate)} className={field}>
            <option value="keep">Leave unchanged</option>
            <option value="on">Activate</option>
            <option value="off">Pause</option>
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Shift end time (hours)</span>
          <input type="number" value={extend} onChange={(e) => setExtend(e.target.value)} className={field} />
        </label>

        <label className="block space-y-1">
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Priority (blank = keep)</span>
          <input type="number" value={priority} onChange={(e) => setPriority(e.target.value)} className={field} />
        </label>

        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={badge} onChange={(e) => setBadge(e.target.checked)}
            className="size-4 accent-[var(--color-accent)]" />
          Assign the flash badge where missing
        </label>

        <button onClick={() => void apply()} disabled={saving}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-3 text-sm font-medium text-accent-foreground disabled:opacity-60">
          {saving && <Loader2 className="size-4 animate-spin" />} Apply to {count}
        </button>
      </div>
    </div>
  );
}
