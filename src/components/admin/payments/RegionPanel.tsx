import { AreaChart, Area, BarChart, Bar, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Banknote, Globe2, MapPin, Users } from "lucide-react";
import type { RegionBlock } from "@/lib/payments-center-v3.functions";
import { BarList, EmptyState, Panel, StatKpi, money, compact } from "./ui";

const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 10 } as const;
const tooltipStyle = {
  background: "hsl(var(--background))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 12,
  fontSize: 11,
};

/** India / International analytics — always rendered from its own isolated slice. */
export function RegionPanel({ block }: { block: RegionBlock }) {
  const india = block.region === "india";
  const currency = india ? "INR" : (block.currencies[0]?.k ?? "USD");
  const empty = block.orders === 0;

  if (empty) {
    return (
      <Panel title={india ? "India payments" : "International payments"}>
        <EmptyState
          title="No payment data available yet."
          hint={
            india
              ? "Once domestic orders are paid, revenue, UPI/card/COD splits, states and GST totals appear here."
              : "Once cross-border orders are paid, currency, country and gateway breakdowns appear here."
          }
        />
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
        <StatKpi label="Revenue" icon={<Banknote className="size-3.5" />} value={money(block.revenue, currency)} />
        <StatKpi label="Orders" icon={<Globe2 className="size-3.5" />} value={block.orders} />
        <StatKpi label="Average order value" value={money(block.aov, currency)} />
        <StatKpi label="Refunds" value={money(block.refund_value, currency)} sub={`${block.refund_count} refund(s)`} />
        {india ? (
          <StatKpi label="GST collected" value={block.gst_estimate == null ? "No data" : money(block.gst_estimate, "INR")} sub="from order tax" />
        ) : (
          <StatKpi label="Currencies" value={block.currencies.length || "No data"} sub="distinct settlement currencies" />
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Panel title="Daily revenue" hint={india ? "Domestic orders (₹)" : "Cross-border orders"}>
          {block.daily.length ? (
            <div className="h-48 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={block.daily} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id={`rg-${block.region}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="date" tick={axis} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => compact(v)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, currency)} />
                  <Area type="monotone" dataKey="revenue" stroke="hsl(var(--accent))" fill={`url(#rg-${block.region})`} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No daily revenue yet." />
          )}
        </Panel>

        <Panel title={india ? "Payment methods" : "Gateways & methods"} hint="UPI · cards · net banking · wallets · EMI · COD">
          <BarList items={block.methods} currency={currency} />
        </Panel>

        <Panel title={india ? "Top states" : "Top countries"} hint={india ? "Revenue by shipping state" : "Revenue by shipping country"}>
          <BarList items={block.geo} currency={currency} empty={india ? "No state data available." : "No country data available."} />
        </Panel>

        <Panel title="Top cities" hint="Revenue by shipping city">
          <BarList items={block.cities} currency={currency} empty="No city data available." />
        </Panel>

        {!india && (
          <Panel title="Currency breakdown" hint="Revenue per settlement currency">
            {block.currencies.length ? (
              <ul className="space-y-2">
                {block.currencies.map((c) => (
                  <li key={c.k} className="flex items-center justify-between gap-3 text-[11px] border-b border-white/5 pb-1.5 last:border-0">
                    <span className="font-mono tracking-widest">{c.k}</span>
                    <span className="font-mono tabular-nums">{money(c.v, c.k)} · {c.n} order(s)</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="No currency data available." />
            )}
          </Panel>
        )}

        {india && (
          <Panel title="Prepaid vs COD" hint="Collection mix">
            <BarList items={[{ k: "prepaid", v: block.prepaid_value }, { k: "cod", v: block.cod_value }]} currency="INR" />
          </Panel>
        )}

        <Panel title="Top customers" hint="By collected revenue">
          {block.customers.length ? (
            <ul className="space-y-2">
              {block.customers.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 text-[11px]">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Users className="size-3 text-muted-foreground shrink-0" />
                    <span className="truncate">{c.label}</span>
                  </span>
                  <span className="font-mono shrink-0">{money(c.v, currency)} · {c.n}</span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No customer data available." />
          )}
        </Panel>

        <Panel title="Hourly revenue" hint="When customers actually pay (local time)">
          {block.hourly.some((h) => h.v > 0) ? (
            <div className="h-48 -ml-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={block.hourly} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 6" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="h" tick={axis} tickLine={false} axisLine={false} tickFormatter={(h: number) => `${h}h`} minTickGap={12} />
                  <YAxis tick={axis} tickLine={false} axisLine={false} width={48} tickFormatter={(v) => compact(v)} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => money(v, currency)} labelFormatter={(h) => `${h}:00`} />
                  <Bar dataKey="v" fill="hsl(var(--accent))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState title="No hourly revenue yet." />
          )}
        </Panel>

        <Panel title="Settlement queue & timeline" hint="Gateway payouts">
          <EmptyState
            title="No settlement data available yet."
            hint="Connect a gateway settlement feed to track payout dates and reference numbers."
          />
        </Panel>
      </div>

      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
        <MapPin className="size-3" />
        {india ? "India" : "International"} analytics are computed independently and never mixed with the other region.
      </p>
    </div>
  );
}
