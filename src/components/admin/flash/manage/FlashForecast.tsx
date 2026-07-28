/**
 * v10.0 — Revenue forecast. Extends observed velocity across five horizons and
 * always caps orders by real remaining stock. Projection only.
 */
import type { ForecastRow } from "@/lib/flash/flash-executive";
import { money } from "@/lib/flash/flash-executive";

const CONF: Record<ForecastRow["confidence"], string> = {
  high: "text-emerald-300",
  medium: "text-sky-300",
  low: "text-muted-foreground",
};

export function FlashForecast({ rows }: { rows: ForecastRow[] }) {
  return (
    <div className="space-y-2">
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => (
          <li key={r.horizon} className="rounded-2xl border border-border bg-card p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{r.label}</p>
              <span className={`text-[9px] font-mono uppercase tracking-widest ${CONF[r.confidence]}`}>{r.confidence}</span>
            </div>
            <p className="mt-1.5 font-display text-2xl font-semibold tabular-nums">{money(r.revenue)}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Cell label="Expected orders" value={String(r.orders)} />
              <Cell label="Inventory left" value={String(r.inventoryRemaining)} />
            </div>
            <div className="mt-2.5">
              <div className="flex items-center justify-between text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                <span>Sell-out probability</span><span className="tabular-nums">{r.sellOutProbability}%</span>
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/8">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${r.sellOutProbability > 80 ? "bg-destructive" : r.sellOutProbability > 50 ? "bg-orange-400" : "bg-emerald-400"}`}
                  style={{ width: `${Math.min(100, r.sellOutProbability)}%` }}
                />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-[10px] leading-relaxed text-muted-foreground">
        Forecasts extend your recorded order velocity and never exceed real remaining stock. They change nothing on the storefront.
      </p>
    </div>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums">{value}</p>
    </div>
  );
}
