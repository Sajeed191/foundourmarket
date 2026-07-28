/**
 * v10.0 — Campaign health. One row per campaign with score, status and the
 * seven operating metrics. Derived from existing stats only.
 */
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { CampaignHealth, CampaignStatus } from "@/lib/flash/flash-executive";
import { money } from "@/lib/flash/flash-executive";

const STATUS: Record<CampaignStatus, { label: string; cls: string }> = {
  excellent: { label: "Excellent", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  healthy: { label: "Healthy", cls: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  warning: { label: "Warning", cls: "border-orange-500/30 bg-orange-500/10 text-orange-300" },
  critical: { label: "Critical", cls: "border-destructive/30 bg-destructive/10 text-destructive" },
};

export function FlashCampaignHealth({ rows }: { rows: CampaignHealth[] }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        No campaigns yet — assign a campaign to a deal to track it here.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {rows.map((c) => {
        const s = STATUS[c.status];
        const Trend = c.trend === "up" ? TrendingUp : c.trend === "down" ? TrendingDown : Minus;
        return (
          <li key={c.name} className="rounded-2xl border border-border bg-card p-3.5">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.name}</p>
                <p className="text-[11px] text-muted-foreground">{c.deals} deal{c.deals === 1 ? "" : "s"}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${s.cls}`}>{s.label}</span>
                <span className="font-display text-xl font-semibold tabular-nums">{c.score}</span>
              </div>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
              <Metric label="Revenue" value={money(c.revenue)} />
              <Metric label="CTR" value={`${c.ctr.toFixed(1)}%`} />
              <Metric label="Conversion" value={`${c.conversion.toFixed(1)}%`} />
              <Metric label="Inventory used" value={`${c.inventoryConsumption}%`} />
              <Metric label="Traffic" value={money(c.traffic)} />
              <Metric label="Profitability" value={`${c.profitability}`} />
              <Metric label="Momentum" value={`${c.momentum}`} icon={<Trend className="size-3" />} />
            </div>

            <p className="mt-2.5 text-[11px] leading-relaxed text-muted-foreground">{c.note}</p>
          </li>
        );
      })}
    </ul>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="flex items-center gap-1 text-sm font-medium tabular-nums">{value}{icon}</p>
    </div>
  );
}
