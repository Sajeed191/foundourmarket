import { Plug, Wifi, WifiOff } from "lucide-react";
import type { GatewayBlock } from "@/lib/payments-center-v3.functions";
import { EmptyState, Panel, money, when } from "./ui";

/** Gateway monitor cards — status, throughput and reliability from real rows. */
export function GatewayMonitor({ gateways }: { gateways: GatewayBlock[] }) {
  return (
    <Panel title="Gateway monitor" hint="Configuration + real transaction performance">
      {gateways.length ? (
        <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {gateways.map((g) => {
            const online = g.enabled === true && g.configured === true;
            return (
              <div key={g.provider} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Plug className="size-3.5 text-accent shrink-0" />
                    <span className="text-sm font-semibold truncate capitalize">{g.display_name}</span>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${
                      g.enabled == null
                        ? "text-muted-foreground border-white/10 bg-white/5"
                        : online
                          ? "text-emerald-400 border-emerald-500/30 bg-emerald-500/10"
                          : "text-destructive border-destructive/30 bg-destructive/10"
                    }`}
                  >
                    {g.enabled == null ? "unknown" : online ? <><Wifi className="size-3" /> online</> : <><WifiOff className="size-3" /> offline</>}
                  </span>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-[11px]">
                  <dt className="text-muted-foreground">Transactions</dt>
                  <dd className="text-right font-mono">{g.transactions || "—"}</dd>
                  <dt className="text-muted-foreground">Success %</dt>
                  <dd className="text-right font-mono">{g.success_rate == null ? "No data" : `${g.success_rate.toFixed(1)}%`}</dd>
                  <dt className="text-muted-foreground">Failure %</dt>
                  <dd className="text-right font-mono">{g.failure_rate == null ? "No data" : `${g.failure_rate.toFixed(1)}%`}</dd>
                  <dt className="text-muted-foreground">Latency</dt>
                  <dd className="text-right font-mono text-muted-foreground">No data</dd>
                  <dt className="text-muted-foreground">Revenue</dt>
                  <dd className="text-right font-mono">{g.revenue ? money(g.revenue) : "—"}</dd>
                  <dt className="text-muted-foreground">Last sync</dt>
                  <dd className="text-right font-mono">{g.last_sync ? when(g.last_sync) : "No data"}</dd>
                </dl>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No gateways connected yet." />
      )}
    </Panel>
  );
}
