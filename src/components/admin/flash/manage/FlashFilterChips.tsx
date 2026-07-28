/** Quick filter chips — no dropdowns, one tap. */
export const FLASH_FILTERS = [
  "all", "active", "scheduled", "ending_soon", "expired", "paused", "low_stock", "conflict",
] as const;
export type FlashFilter = (typeof FLASH_FILTERS)[number];

const LABEL: Record<FlashFilter, string> = {
  all: "All",
  active: "Active",
  scheduled: "Scheduled",
  ending_soon: "Ending soon",
  expired: "Expired",
  paused: "Paused",
  low_stock: "Low stock",
  conflict: "Conflict",
};

export function FlashFilterChips({
  value, counts, onChange,
}: {
  value: FlashFilter;
  counts: Record<FlashFilter, number>;
  onChange: (f: FlashFilter) => void;
}) {
  return (
    <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Filter deals">
      {FLASH_FILTERS.map((f) => {
        const active = f === value;
        return (
          <button key={f} role="tab" aria-selected={active} onClick={() => onChange(f)}
            className={`shrink-0 rounded-full border px-3.5 min-h-11 text-[10px] font-mono uppercase tracking-widest transition ${
              active ? "border-accent/50 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground hover:bg-white/5"
            }`}>
            {LABEL[f]} <span className="ml-1 tabular-nums opacity-70">{counts[f]}</span>
          </button>
        );
      })}
    </div>
  );
}
