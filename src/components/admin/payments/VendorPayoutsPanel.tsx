import type { VendorPayoutBlock } from "@/lib/payments-center-v3.functions";
import { EmptyState, Panel, money } from "./ui";

/** Vendor payout tracking — only rendered when vendor records actually exist. */
export function VendorPayoutsPanel({ block }: { block: VendorPayoutBlock }) {
  if (!block.enabled || block.rows.length === 0) {
    return (
      <Panel title="Vendor payouts" hint="Marketplace seller settlements">
        <EmptyState
          title="Vendor payouts not enabled."
          hint="Once vendors and payout records exist in the marketplace, pending, completed and commission totals appear here."
        />
      </Panel>
    );
  }

  return (
    <Panel title="Vendor payouts" hint="Pending · completed · commission · net earnings">
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead className="text-[9px] uppercase tracking-widest text-muted-foreground">
            <tr className="border-b border-white/10 text-left">
              <th className="py-2 pr-3">Vendor</th>
              <th className="py-2 pr-3">Pending</th>
              <th className="py-2 pr-3">Completed</th>
              <th className="py-2 pr-3">Next settlement</th>
              <th className="py-2 pr-3">Total sales</th>
              <th className="py-2 pr-3">Commission</th>
              <th className="py-2">Net earnings</th>
            </tr>
          </thead>
          <tbody>
            {block.rows.map((v) => (
              <tr key={v.vendor_id} className="border-b border-white/5">
                <td className="py-2 pr-3 truncate max-w-[180px]">{v.vendor}</td>
                <td className="py-2 pr-3 font-mono">{money(v.pending, v.currency)}</td>
                <td className="py-2 pr-3 font-mono">{money(v.completed, v.currency)}</td>
                <td className="py-2 pr-3 font-mono">{v.next_settlement ?? "No data"}</td>
                <td className="py-2 pr-3 font-mono text-muted-foreground">{v.total_sales == null ? "No data" : money(v.total_sales, v.currency)}</td>
                <td className="py-2 pr-3 font-mono">{v.commission == null ? "No data" : money(v.commission, v.currency)}</td>
                <td className="py-2 font-mono">{v.net_earnings == null ? "No data" : money(v.net_earnings, v.currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="md:hidden divide-y divide-white/5">
        {block.rows.map((v) => (
          <div key={v.vendor_id} className="py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold truncate">{v.vendor}</span>
              <span className="font-mono text-sm shrink-0">{money(v.pending, v.currency)}</span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Completed {money(v.completed, v.currency)} · Commission {v.commission == null ? "No data" : money(v.commission, v.currency)}
            </p>
          </div>
        ))}
      </div>
    </Panel>
  );
}
