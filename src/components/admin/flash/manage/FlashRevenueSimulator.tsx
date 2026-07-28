/**
 * Revenue simulator — a pure what-if sandbox. Move discount, duration,
 * priority and expected traffic and see the projected outcome. Nothing here
 * writes to the database; it only calls `simulateDeal`.
 */
import { useMemo, useState } from "react";
import { simulateDeal } from "@/lib/flash/flash-autonomy";
import type { DealEntry } from "@/lib/flash/use-flash-admin";

function Slider({
  label, value, min, max, step, suffix, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number; suffix: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between">
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
        <span className="text-sm font-semibold tabular-nums">{value}{suffix}</span>
      </span>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={label}
        className="mt-2 h-11 w-full cursor-pointer accent-[var(--accent)]"
      />
    </label>
  );
}

export function FlashRevenueSimulator({
  entries, baselineCtr, baselineConversion,
}: {
  entries: DealEntry[];
  baselineCtr: number;
  baselineConversion: number;
}) {
  const candidates = useMemo(() => entries.filter((e) => e.deal).slice(0, 40), [entries]);
  const [key, setKey] = useState(() => candidates[0]?.key ?? "");
  const entry = candidates.find((e) => e.key === key) ?? candidates[0] ?? null;

  const [discount, setDiscount] = useState(entry?.discountPct || 25);
  const [hours, setHours] = useState(24);
  const [priority, setPriority] = useState(entry?.deal?.priority ?? 20);
  const [traffic, setTraffic] = useState(2000);

  if (!entry) {
    return <p className="rounded-2xl border border-dashed border-border bg-card/40 p-6 text-center text-sm text-muted-foreground">
      Create a deal to run simulations.
    </p>;
  }

  const result = simulateDeal({
    regularPrice: entry.regularPrice,
    discountPct: discount,
    durationHours: hours,
    priority,
    traffic,
    stock: entry.product.stockQuantity ?? 0,
    baselineCtr: Math.max(0.6, baselineCtr),
    baselineConversion: Math.max(0.3, baselineConversion),
  });

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-4">
        <label className="block">
          <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Product</span>
          <select value={entry.key} onChange={(e) => setKey(e.target.value)}
            className="mt-1.5 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-accent">
            {candidates.map((c) => <option key={c.key} value={c.key}>{c.product.name}</option>)}
          </select>
        </label>
        <Slider label="Discount" value={discount} min={0} max={80} step={1} suffix="%" onChange={setDiscount} />
        <Slider label="Duration" value={hours} min={2} max={168} step={2} suffix="h" onChange={setHours} />
        <Slider label="Priority" value={priority} min={0} max={100} step={5} suffix="" onChange={setPriority} />
        <Slider label="Expected traffic" value={traffic} min={100} max={50000} step={100} suffix=" views" onChange={setTraffic} />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Projection</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{result.revenue.toLocaleString()}</p>
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">estimated revenue</p>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
          {[
            { l: "Orders", v: String(result.orders) },
            { l: "Deal price", v: result.price.toLocaleString() },
            { l: "CTR", v: `${result.ctr}%` },
            { l: "Conversion", v: `${result.conversion}%` },
            { l: "Remaining stock", v: String(result.remainingStock) },
            { l: "Sell-through", v: `${result.sellThroughPct}%` },
          ].map((s) => (
            <div key={s.l} className="min-w-0">
              <dt className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{s.l}</dt>
              <dd className="mt-0.5 truncate text-base font-semibold tabular-nums">{s.v}</dd>
            </div>
          ))}
        </dl>

        <p className="mt-4 text-[11px] leading-relaxed text-muted-foreground">
          Simulation only — this never changes a live deal. Orders are always capped by real stock.
        </p>
      </div>
    </div>
  );
}
