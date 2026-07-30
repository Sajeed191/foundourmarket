import { ArrowDownLeft, ArrowUpRight, RotateCcw, Radio } from "lucide-react";
import type { ActivityItem } from "@/lib/payments-center-v3.functions";
import { EmptyState, money, ago } from "./ui";

/** Right-side live feed — renders only real recorded payment/refund events. */
export function LiveActivityFeed({ items, live }: { items: ActivityItem[]; live: boolean }) {
  return (
    <aside className="glass border border-white/10 rounded-2xl overflow-hidden">
      <header className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <h3 className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Live activity</h3>
        <span className="inline-flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-emerald-400">
          <Radio className={`size-3 ${live ? "animate-ping text-accent" : ""}`} /> live
        </span>
      </header>
      <div className="max-h-[420px] overflow-y-auto overscroll-contain divide-y divide-white/5">
        {items.length === 0 && <EmptyState title="No activity yet." hint="Payment, refund and failure events stream here in real time." />}
        {items.map((e) => {
          const tone =
            e.kind === "failed" ? "text-destructive" : e.kind === "refund" ? "text-violet-300" : "text-emerald-400";
          const Icon = e.kind === "refund" ? RotateCcw : e.kind === "failed" ? ArrowDownLeft : ArrowUpRight;
          return (
            <div key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <Icon className={`size-3.5 shrink-0 ${tone}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] truncate">{e.label}</p>
                <p className="text-[10px] text-muted-foreground">{ago(e.at)}</p>
              </div>
              <span className="font-mono text-[11px] shrink-0">{money(e.amount, e.currency)}</span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
