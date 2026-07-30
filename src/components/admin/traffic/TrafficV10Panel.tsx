import { useMemo, useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Globe, MapPin, Users, Activity, ShieldAlert, Radar, Megaphone, Cpu,
  Clock, Route as RouteIcon, Stethoscope, Download, ChevronRight,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { exportRows, exportJson, type ExportFormat } from "@/lib/traffic-export";
import type { Breakdown, Metric, SegmentMetrics, TrafficV10 } from "@/lib/traffic-v10";

const COLORS = ["#a3e635", "#22d3ee", "#a78bfa", "#f59e0b", "#f43f5e", "#34d399", "#fb923c"];
const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

/** Renders real values only — `null` means the event data does not exist. */
function M({ value, kind = "num" }: { value: Metric; kind?: "num" | "pct" | "money" }) {
  if (value === null || Number.isNaN(value)) return <span className="text-muted-foreground text-[11px]">No data available</span>;
  if (kind === "pct") return <>{value.toFixed(1)}%</>;
  if (kind === "money") return <>{inr(value)}</>;
  return <>{Math.round(value).toLocaleString()}</>;
}

function NoData({ label = "No data available" }: { label?: string }) {
  return <p className="text-xs text-muted-foreground py-6 text-center">{label}</p>;
}

function Card({ title, icon, children, action }: { title?: string; icon?: React.ReactNode; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="card-premium rounded-2xl p-5">
      {(title || action) && (
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="text-sm font-medium flex items-center gap-2">{icon}{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

function Export({ rows, name, full }: { rows: () => Record<string, unknown>[]; name: string; full?: unknown }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <Download className="size-3.5 text-muted-foreground" />
      {(["csv", "excel", "json"] as ExportFormat[]).map((f) => (
        <button key={f} onClick={() => (f === "json" && full ? exportJson(full, name) : exportRows(f, rows(), name))}
          className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest rounded-full border border-border hover:border-accent/50 hover:text-accent transition-colors">
          {f}
        </button>
      ))}
    </span>
  );
}

function Kpi({ label, value, kind }: { label: string; value: Metric; kind?: "num" | "pct" | "money" }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums mt-0.5"><M value={value} kind={kind} /></p>
    </div>
  );
}

function SegmentGrid({ s }: { s: SegmentMetrics }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
      <Kpi label="Visitors" value={s.visitors} />
      <Kpi label="Sessions" value={s.sessions} />
      <Kpi label="Page views" value={s.views} />
      <Kpi label="Orders" value={s.orders} />
      <Kpi label="Revenue" value={s.revenue} kind="money" />
      <Kpi label="Conversion" value={s.conversion} kind="pct" />
      <Kpi label="AOV" value={s.aov} kind="money" />
      <Kpi label="Bounce rate" value={s.bounceRate} kind="pct" />
      <Kpi label="Returning rate" value={s.returningRate} kind="pct" />
      <Kpi label="New users" value={s.newUsers} />
      <Kpi label="Returning users" value={s.returningUsers} />
      <Kpi label="Checkout started" value={s.checkoutStarted} />
      <Kpi label="Checkout success" value={s.checkoutSuccess} />
      <Kpi label="Checkout failure" value={s.checkoutFailure} />
      <Kpi label="Mobile" value={s.mobile} />
      <Kpi label="Tablet" value={s.tablet} />
      <Kpi label="Desktop" value={s.desktop} />
    </div>
  );
}

function BreakTable({ title, icon, items, unitLabel = "Value", onDrill }: {
  title: string; icon?: React.ReactNode; items: Breakdown[]; unitLabel?: string;
  onDrill?: (b: Breakdown) => void;
}) {
  const rows = () => items.map((b) => ({
    [unitLabel.toLowerCase()]: b.label, sessions: b.sessions, visitors: b.visitors,
    orders: b.orders, revenue: Math.round(b.revenue), conversion: b.conversion.toFixed(2),
  }));
  return (
    <Card title={title} icon={icon} action={items.length ? <Export rows={rows} name={title.toLowerCase().replace(/\s+/g, "-")} /> : undefined}>
      {!items.length ? <NoData /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground text-left">
                <th className="py-1">{unitLabel}</th><th>Sessions</th><th>Visitors</th><th>Orders</th><th>Revenue</th><th>Conv</th><th />
              </tr>
            </thead>
            <tbody>
              {items.slice(0, 20).map((b) => (
                <tr key={b.label} className={`border-t border-border/40 ${onDrill ? "cursor-pointer hover:bg-white/[0.03]" : ""}`} onClick={() => onDrill?.(b)}>
                  <td className="py-1.5 truncate max-w-[160px]">{b.label}</td>
                  <td className="font-mono">{b.sessions}</td>
                  <td className="font-mono">{b.visitors}</td>
                  <td className="font-mono">{b.orders}</td>
                  <td className="font-mono text-accent">{inr(b.revenue)}</td>
                  <td className="font-mono">{b.conversion.toFixed(1)}%</td>
                  <td>{onDrill && <ChevronRight className="size-3.5 text-muted-foreground" />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ panel */

export function TrafficV10Panel({ data }: { data: TrafficV10 }) {
  const [drill, setDrill] = useState<Breakdown | null>(null);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          100% production events · India + International = Global · last {data.days}d
        </p>
        <Export rows={() => []} name={`traffic-v10-${data.days}d`} full={data} />
      </div>

      <Tabs defaultValue="segments" className="w-full">
        <div className="overflow-x-auto -mx-1 px-1 mb-4">
          <TabsList className="inline-flex h-auto flex-nowrap gap-1 bg-card border border-border rounded-xl p-1">
            {[
              ["segments", "Segments"], ["live", "Live Map"], ["journey", "Journey"],
              ["marketing", "Marketing"], ["geo", "Geography"], ["tech", "Technology"],
              ["time", "Time"], ["customers", "Customers"], ["quality", "Quality"], ["diag", "Diagnostics"],
            ].map(([v, l]) => (
              <TabsTrigger key={v} value={v} className="text-[11px] font-mono uppercase tracking-wider whitespace-nowrap">{l}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Segments: India / International / Global */}
        <TabsContent value="segments" className="space-y-5">
          <Card title="Global" icon={<Globe className="size-4 text-accent" />}><SegmentGrid s={data.global} /></Card>
          <Card title="India" icon={<MapPin className="size-4 text-muted-foreground" />}><SegmentGrid s={data.india} /></Card>
          <Card title="International" icon={<Globe className="size-4 text-muted-foreground" />}><SegmentGrid s={data.international} /></Card>
          <ReconcileNote data={data} />
        </TabsContent>

        {/* Live visitor map */}
        <TabsContent value="live" className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Active visitors (last 5 min)" icon={<Radar className="size-4 text-accent" />}>
              {!data.liveVisitors.length ? <NoData label="No active visitors right now." /> : (
                <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
                  {data.liveVisitors.map((v) => (
                    <div key={v.sessionId} className="flex items-center justify-between gap-2 text-xs border-b border-border/40 pb-2">
                      <div className="min-w-0">
                        <p className="font-mono truncate">{v.path}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          {v.region === "india" ? "🇮🇳" : "🌍"} {[v.city || null, v.device || null, v.browser || null, v.os || null].filter(Boolean).join(" · ") || "No device data"}
                        </p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-accent font-mono">{v.onPageSec}s idle</p>
                        <p className="text-[10px] text-muted-foreground">{v.loggedIn ? "Logged in" : "Guest"}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            <Card title="Live activity feed" icon={<Activity className="size-4 text-accent" />}>
              {!data.feed.length ? <NoData label="No recorded activity in this window." /> : (
                <div className="max-h-[340px] overflow-y-auto space-y-2 pr-1">
                  {data.feed.map((f) => (
                    <div key={f.id} className="flex items-center justify-between gap-2 text-xs border-b border-border/40 pb-2">
                      <p className="truncate">
                        <span className="text-accent">{f.actor}</span> {f.action}
                        {f.detail && <span className="text-muted-foreground"> · {f.detail}</span>}
                      </p>
                      <span className="text-[10px] text-muted-foreground font-mono shrink-0">
                        {new Date(f.at).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </TabsContent>

        {/* Journey */}
        <TabsContent value="journey">
          <Card title="Customer journey & drop-off" icon={<RouteIcon className="size-4 text-muted-foreground" />}
            action={<Export rows={() => data.journey as unknown as Record<string, unknown>[]} name="customer-journey-v10" />}>
            {!data.journey.some((j) => j.sessions > 0) ? <NoData /> : (
              <div className="space-y-3">
                {data.journey.map((j) => {
                  const max = Math.max(1, ...data.journey.map((x) => x.sessions));
                  return (
                    <div key={j.stage}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="font-medium">{j.stage}</span>
                        <span className="font-mono text-muted-foreground">
                          {j.sessions.toLocaleString()}
                          {j.conversionPct !== null && <> · {j.conversionPct.toFixed(1)}%</>}
                          {j.dropPct !== null && j.dropPct > 0 && <span className="text-destructive ml-2">−{j.dropPct.toFixed(1)}%</span>}
                        </span>
                      </div>
                      <div className="h-6 rounded-lg bg-muted/30 overflow-hidden">
                        <div className="h-full rounded-lg bg-accent/70" style={{ width: `${(j.sessions / max) * 100}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Marketing */}
        <TabsContent value="marketing" className="space-y-5">
          <BreakTable title="Campaigns (UTM)" icon={<Megaphone className="size-4 text-muted-foreground" />} items={data.marketing.campaigns} unitLabel="Campaign" onDrill={setDrill} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <BreakTable title="Sources" items={data.marketing.sources} unitLabel="Source" onDrill={setDrill} />
            <BreakTable title="Mediums" items={data.marketing.mediums} unitLabel="Medium" onDrill={setDrill} />
          </div>
          <BreakTable title="Channels" items={data.marketing.channels} unitLabel="Channel" onDrill={setDrill} />
        </TabsContent>

        {/* Geography */}
        <TabsContent value="geo" className="space-y-5">
          <BreakTable title="Countries / regions" icon={<Globe className="size-4 text-muted-foreground" />} items={data.geo.countries} unitLabel="Country" onDrill={setDrill} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <BreakTable title="Cities (device timezone)" items={data.geo.cities} unitLabel="City" onDrill={setDrill} />
            <BreakTable title="Timezones" items={data.geo.timezones} unitLabel="Timezone" onDrill={setDrill} />
          </div>
        </TabsContent>

        {/* Technology */}
        <TabsContent value="tech" className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Card title="Device split" icon={<Cpu className="size-4 text-muted-foreground" />}>
              {!data.tech.devices.length ? <NoData /> : (
                <ResponsiveContainer width="100%" height={230}>
                  <PieChart>
                    <Pie data={data.tech.devices} dataKey="sessions" nameKey="label" outerRadius={85} label>
                      {data.tech.devices.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>
            <BreakTable title="Browsers" items={data.tech.browsers} unitLabel="Browser" onDrill={setDrill} />
            <BreakTable title="Operating systems" items={data.tech.os} unitLabel="OS" onDrill={setDrill} />
            <BreakTable title="Screen sizes" items={data.tech.screens} unitLabel="Screen" />
            <BreakTable title="Network types" items={data.tech.networks} unitLabel="Network" />
            <BreakTable title="Languages" items={data.tech.languages} unitLabel="Language" />
          </div>
        </TabsContent>

        {/* Time */}
        <TabsContent value="time" className="space-y-5">
          <Card title="Hourly traffic" icon={<Clock className="size-4 text-muted-foreground" />}
            action={data.time.hourly.length ? <Export rows={() => data.time.hourly as unknown as Record<string, unknown>[]} name="hourly-traffic" /> : undefined}>
            {!data.time.hourly.length ? <NoData /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={data.time.hourly}>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="hour" stroke="rgba(255,255,255,0.4)" fontSize={10} />
                  <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
                  <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
                  <Bar dataKey="visitors" fill="#a3e635" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="orders" fill="#22d3ee" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>
          {([["Daily", data.time.daily, "date"], ["Weekly", data.time.weekly, "week"], ["Monthly", data.time.monthly, "month"]] as const).map(([label, rows, key]) => (
            <Card key={label} title={`${label} trend`}
              action={rows.length ? <Export rows={() => rows as unknown as Record<string, unknown>[]} name={`${label.toLowerCase()}-trend`} /> : undefined}>
              {!rows.length ? <NoData /> : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={rows as unknown as Record<string, unknown>[]}>
                    <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey={key} stroke="rgba(255,255,255,0.4)" fontSize={10} />
                    <YAxis stroke="rgba(255,255,255,0.4)" fontSize={10} />
                    <Tooltip contentStyle={{ background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.1)" }} />
                    <Area type="monotone" dataKey="visitors" stroke="#a3e635" fill="rgba(163,230,53,0.18)" />
                    <Area type="monotone" dataKey="revenue" stroke="#22d3ee" fill="rgba(34,211,238,0.12)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </Card>
          ))}
        </TabsContent>

        {/* Customers */}
        <TabsContent value="customers">
          <Card title="Customer intelligence" icon={<Users className="size-4 text-muted-foreground" />}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <Kpi label="New customers" value={data.customers.newCustomers} />
              <Kpi label="Returning" value={data.customers.returningCustomers} />
              <Kpi label="Repeat rate" value={data.customers.repeatRate} kind="pct" />
              <Kpi label="Lifetime value" value={data.customers.ltv} kind="money" />
              <Kpi label="Avg order value" value={data.customers.aov} kind="money" />
              <Kpi label="Purchase frequency" value={data.customers.frequency} />
            </div>
          </Card>
        </TabsContent>

        {/* Traffic quality + fraud */}
        <TabsContent value="quality" className="space-y-5">
          <Card title="Traffic quality" icon={<ShieldAlert className="size-4 text-muted-foreground" />}>
            <div className="grid grid-cols-3 gap-2.5">
              <Kpi label="Human sessions" value={data.quality.human} />
              <Kpi label="Bots (excluded)" value={data.quality.bot} />
              <Kpi label="Unclassified" value={data.quality.unknown} />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">Bot sessions are excluded from every visitor, revenue and conversion metric above.</p>
          </Card>
          <Card title="Fraud signals (evidence-backed)" icon={<ShieldAlert className="size-4 text-destructive" />}>
            {!data.fraud.length ? <NoData label="No fraud signals detected in this window." /> : (
              <ul className="space-y-2.5">
                {data.fraud.map((f) => (
                  <li key={f.id} className="rounded-xl border border-border p-3">
                    <p className="text-xs font-medium flex items-center gap-2">
                      <span className={`size-1.5 rounded-full ${f.severity === "high" ? "bg-destructive" : f.severity === "medium" ? "bg-amber-400" : "bg-sky-400"}`} />
                      {f.label}
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">{f.evidence}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>

        {/* Diagnostics */}
        <TabsContent value="diag">
          <Card title="Admin diagnostics — event ingestion" icon={<Stethoscope className="size-4 text-muted-foreground" />}
            action={<Export rows={() => data.diagnostics.sources as unknown as Record<string, unknown>[]} name="ingestion-health" full={data.diagnostics} />}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <Kpi label="Events processed" value={data.diagnostics.eventsProcessed} />
              <Kpi label="Duplicate events" value={data.diagnostics.duplicateEvents} />
              <Kpi label="Dropped (no session)" value={data.diagnostics.eventsWithoutSession} />
              <Kpi label="Freshness (sec)" value={data.diagnostics.freshnessSec} />
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-muted-foreground text-left"><th className="py-1">Source</th><th>Rows</th><th>Last event</th><th>Status</th></tr></thead>
                <tbody>
                  {data.diagnostics.sources.map((s) => (
                    <tr key={s.name} className="border-t border-border/40">
                      <td className="py-1.5 font-mono">{s.name}</td>
                      <td className="font-mono">{s.rows}</td>
                      <td className="font-mono">{s.lastAt ? new Date(s.lastAt).toLocaleString() : "No data available"}</td>
                      <td>{s.healthy ? "🟢 healthy" : "🟡 no recent data"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">
              Last processed: {data.diagnostics.lastEventAt ? new Date(data.diagnostics.lastEventAt).toLocaleString() : "No data available"}
            </p>
          </Card>
        </TabsContent>
      </Tabs>

      {drill && (
        <Card title={`Drill-down · ${drill.label}`} action={<button onClick={() => setDrill(null)} className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent">close</button>}>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2.5">
            <Kpi label="Sessions" value={drill.sessions} />
            <Kpi label="Visitors" value={drill.visitors} />
            <Kpi label="Orders" value={drill.orders} />
            <Kpi label="Revenue" value={drill.revenue} kind="money" />
            <Kpi label="Conversion" value={drill.conversion} kind="pct" />
          </div>
        </Card>
      )}
    </div>
  );
}

/** Integrity check: Global must equal India + International. */
function ReconcileNote({ data }: { data: TrafficV10 }) {
  const ok = useMemo(() => {
    const sum = (a: Metric, b: Metric) => (a ?? 0) + (b ?? 0);
    return Math.round(sum(data.india.orders, data.international.orders)) === Math.round(data.global.orders ?? 0)
      && Math.round(sum(data.india.revenue, data.international.revenue)) === Math.round(data.global.revenue ?? 0);
  }, [data]);
  return (
    <p className="text-[11px] text-muted-foreground">
      {ok ? "🟢 Integrity check passed — Global orders and revenue equal India + International."
        : "🟡 Integrity check — some sessions lack a region classification and are reported only under Global."}
    </p>
  );
}
