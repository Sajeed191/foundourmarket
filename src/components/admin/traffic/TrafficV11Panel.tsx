import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Activity, Download, Filter, Gauge, LineChart, ListTree, PackageSearch, Percent,
  Search as SearchIcon, ShoppingCart, Sparkles, Timer, Users, X,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { exportRows, exportJson, type ExportFormat } from "@/lib/traffic-export";
import type {
  Metric, SessionReplay, TrafficV11, V11Filters, VisitorSegment,
} from "@/lib/traffic-v11";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

function M({ value, kind = "num" }: { value: Metric; kind?: "num" | "pct" | "money" | "sec" }) {
  if (value === null || Number.isNaN(value)) return <span className="text-muted-foreground text-[11px]">No data available</span>;
  if (kind === "pct") return <>{value.toFixed(1)}%</>;
  if (kind === "money") return <>{inr(value)}</>;
  if (kind === "sec") return <>{Math.round(value)}s</>;
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

function Kpi({ label, value, kind }: { label: string; value: Metric; kind?: "num" | "pct" | "money" | "sec" }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2.5">
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm font-medium tabular-nums mt-0.5"><M value={value} kind={kind} /></p>
    </div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-muted-foreground text-left">{head.map((h) => <th key={h} className="py-1 font-normal whitespace-nowrap pr-3">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const Cell = ({ children, mono }: { children: React.ReactNode; mono?: boolean }) => (
  <td className={`py-1.5 pr-3 whitespace-nowrap ${mono ? "font-mono tabular-nums" : ""}`}>{children}</td>
);

/* ------------------------------------------------------------ filter bar */

function FilterBar({ data, filters, setFilters }: {
  data: TrafficV11; filters: V11Filters; setFilters: (f: V11Filters) => void;
}) {
  const sel = (key: keyof V11Filters, options: string[], label: string) => (
    <select
      key={key as string}
      value={(filters[key] as string) ?? ""}
      onChange={(e) => setFilters({ ...filters, [key]: e.target.value || undefined })}
      className="bg-card border border-border rounded-full px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
    >
      <option value="">{label}</option>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
  const active = Object.values(filters).filter(Boolean).length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Filter className="size-3.5 text-muted-foreground" />
      <input
        value={filters.search ?? ""}
        onChange={(e) => setFilters({ ...filters, search: e.target.value || undefined })}
        placeholder="Search session / visitor / page…"
        className="bg-card border border-border rounded-full px-3 py-1 text-[11px] w-48"
      />
      {sel("region", ["india", "international"], "Region")}
      {sel("country", data.facets.countries, "Country")}
      {sel("city", data.facets.cities, "City")}
      {sel("device", data.facets.devices, "Device")}
      {sel("browser", data.facets.browsers, "Browser")}
      {sel("os", data.facets.os, "OS")}
      {sel("campaign", data.facets.campaigns, "Campaign")}
      {sel("source", data.facets.sources, "Source")}
      {sel("medium", data.facets.mediums, "Medium")}
      {sel("userType", ["guest", "logged-in", "new", "returning"], "User type")}
      {sel("segment", data.segments.map((s) => s.segment), "Segment")}
      {active > 0 && (
        <button onClick={() => setFilters({})} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full border border-border hover:text-accent">
          <X className="size-3" /> Clear
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- replay */

function ReplayDrawer({ r, onClose }: { r: SessionReplay; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm overflow-y-auto" onClick={onClose}>
      <div className="mx-auto max-w-2xl my-6 card-premium rounded-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-medium">Session {r.sessionRef}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Visitor {r.visitorRef}{r.customerRef ? ` · Customer ${r.customerRef}` : " · Guest"} · {r.segment}
            </p>
          </div>
          <button onClick={onClose}><X className="size-4 text-muted-foreground" /></button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
          <Kpi label="Duration" value={r.durationSec} kind="sec" />
          <Kpi label="Engagement" value={r.engagement} />
          <Kpi label="Pages" value={r.pages} />
          <Kpi label="Products" value={r.products} />
          <Kpi label="Cart adds" value={r.cart} />
          <Kpi label="Checkouts" value={r.checkout} />
          <Kpi label="Orders" value={r.orders} />
          <Kpi label="Revenue" value={r.revenue > 0 ? r.revenue : null} kind="money" />
        </div>

        <div className="rounded-xl border border-border p-3 mb-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Engagement calculation</p>
          {!r.engagementParts.length ? <NoData label="No scoring signals recorded" /> : (
            <ul className="space-y-1 text-[11px]">
              {r.engagementParts.map((p) => (
                <li key={p.factor} className="flex justify-between gap-3">
                  <span className="text-muted-foreground">{p.factor} — {p.detail}</span>
                  <span className="font-mono">+{p.points}</span>
                </li>
              ))}
              <li className="flex justify-between gap-3 border-t border-border/50 pt-1 font-medium">
                <span>Total (capped at 100)</span><span className="font-mono">{r.engagement}</span>
              </li>
            </ul>
          )}
        </div>

        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
          Journey · landing {r.landing} → exit {r.exit}
        </p>
        {!r.steps.length ? <NoData /> : (
          <ol className="space-y-1.5">
            {r.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px]">
                <span className="font-mono text-muted-foreground shrink-0">{new Date(s.at).toLocaleTimeString()}</span>
                <span className="font-medium shrink-0">{s.label}</span>
                <span className="text-muted-foreground truncate">{s.detail}</span>
                {s.dwellSec !== null && <span className="font-mono text-accent shrink-0">{s.dwellSec}s</span>}
                {s.scrollPct !== null && <span className="font-mono text-muted-foreground shrink-0">{s.scrollPct}% scroll</span>}
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- panel */

export function TrafficV11Panel({ data, filters, setFilters }: {
  data: TrafficV11; filters: V11Filters; setFilters: (f: V11Filters) => void;
}) {
  const [open, setOpen] = useState<SessionReplay | null>(null);
  const [tab, setTab] = useState("loss");

  const lossChart = useMemo(
    () => data.loss.map((l) => ({ step: `${l.from}→${l.to}`, lost: l.lostPct ?? 0, continued: l.continued })),
    [data.loss],
  );

  const tabs: [string, string][] = [
    ["loss", "Conversion Loss"], ["replay", "Replay"], ["heat", "Heat Ranking"],
    ["products", "Products"], ["search", "Search+"], ["segments", "Segments"],
    ["campaigns", "Campaign ROI"], ["compare", "Funnel Compare"],
    ["checkout", "Checkout"], ["perf", "Performance"],
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          Conversion intelligence · 100% tracked events · last {data.days}d
        </p>
        <Export rows={() => []} name={`traffic-v11-${data.days}d`} full={data} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <Kpi label="Sessions" value={data.totals.sessions} />
        <Kpi label="Converting" value={data.totals.converting} />
        <Kpi label="Conversion" value={data.totals.conversion} kind="pct" />
        <Kpi label="Avg engagement" value={data.totals.avgEngagement} />
        <Kpi label="Avg session" value={data.totals.avgSessionSec} kind="sec" />
        <Kpi label="Revenue" value={data.totals.revenue} kind="money" />
      </div>

      <Card title="Why visitors are not converting" icon={<Sparkles className="size-4 text-accent" />}>
        {!data.insight ? <NoData label="Not enough tracked sessions to state a conclusion" /> : (
          <div className="space-y-2">
            <p className="text-sm font-medium">{data.insight.headline}</p>
            <ul className="space-y-1 text-[11px] text-muted-foreground">
              {data.insight.evidence.map((e, i) => <li key={i}>• {e}</li>)}
            </ul>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest rounded-full border border-border">
                Confidence: {data.insight.confidence}
              </span>
              <span className="text-[11px] text-muted-foreground">{data.insight.impact}</span>
              <button onClick={() => setTab(data.insight!.reportTab)}
                className="px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full bg-accent text-accent-foreground">
                Open report
              </button>
            </div>
          </div>
        )}
      </Card>

      <FilterBar data={data} filters={filters} setFilters={setFilters} />

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="overflow-x-auto -mx-1 px-1">
          <TabsList className="inline-flex h-auto flex-nowrap gap-1 bg-card border border-border rounded-xl p-1">
            {tabs.map(([v, l]) => (
              <TabsTrigger key={v} value={v} className="text-[11px] font-mono uppercase tracking-wider whitespace-nowrap">{l}</TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* ---------------------------------------------------- loss */}
        <TabsContent value="loss" className="space-y-4 mt-4">
          <Card title="Conversion loss analysis" icon={<Percent className="size-4" />}
            action={<Export rows={() => data.loss.map((l) => ({ from: l.from, to: l.to, entered: l.entered, continued: l.continued, lost_pct: l.lostPct?.toFixed(2) ?? "" }))} name="conversion-loss" />}>
            {!data.loss.some((l) => l.entered > 0) ? <NoData /> : (
              <>
                <div className="h-56 mb-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={lossChart}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                      <XAxis dataKey="step" tick={{ fontSize: 9 }} interval={0} angle={-15} height={50} />
                      <YAxis tick={{ fontSize: 10 }} unit="%" />
                      <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 11 }} />
                      <Bar dataKey="lost" fill="#f43f5e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <Table head={["Step", "Entered", "Continued", "Lost", "Continued %"]}>
                  {data.loss.map((l) => (
                    <tr key={l.from} className={`border-t border-border/40 ${l.biggest ? "bg-rose-500/5" : ""}`}>
                      <Cell>{l.from} → {l.to}{l.biggest && <span className="ml-2 text-[9px] font-mono uppercase text-rose-400">biggest drop</span>}</Cell>
                      <Cell mono>{l.entered}</Cell>
                      <Cell mono>{l.continued}</Cell>
                      <Cell mono><M value={l.lostPct} kind="pct" /></Cell>
                      <Cell mono><M value={l.continuedPct} kind="pct" /></Cell>
                    </tr>
                  ))}
                </Table>
              </>
            )}
          </Card>
        </TabsContent>

        {/* -------------------------------------------------- replay */}
        <TabsContent value="replay" className="space-y-4 mt-4">
          <Card title="Visitor replay timeline" icon={<ListTree className="size-4" />}
            action={<Export rows={() => data.replays.map((r) => ({
              session: r.sessionRef, visitor: r.visitorRef, segment: r.segment, region: r.region,
              device: r.device, duration_sec: r.durationSec, pages: r.pages, products: r.products,
              cart: r.cart, checkout: r.checkout, orders: r.orders, engagement: r.engagement,
              landing: r.landing, exit: r.exit,
            }))} name="visitor-replays" />}>
            {!data.replays.length ? <NoData /> : (
              <Table head={["Session", "Segment", "Device", "Duration", "Pages", "Cart", "Orders", "Score", "Landing → Exit"]}>
                {data.replays.slice(0, 100).map((r) => (
                  <tr key={r.sessionId} className="border-t border-border/40 cursor-pointer hover:bg-white/[0.03]" onClick={() => setOpen(r)}>
                    <Cell mono>{r.sessionRef}</Cell>
                    <Cell>{r.segment}</Cell>
                    <Cell>{r.device || "—"}</Cell>
                    <Cell mono>{r.durationSec}s</Cell>
                    <Cell mono>{r.pages}</Cell>
                    <Cell mono>{r.cart}</Cell>
                    <Cell mono>{r.orders}</Cell>
                    <Cell mono>{r.engagement}</Cell>
                    <Cell><span className="text-muted-foreground truncate inline-block max-w-[220px]">{r.landing} → {r.exit}</span></Cell>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------- heat */}
        <TabsContent value="heat" className="space-y-4 mt-4">
          <Card title="Heat ranking" icon={<Gauge className="size-4" />}
            action={<Export rows={() => data.heat.map((h) => ({
              path: h.path, views: h.views, exits: h.exits, exit_rate: h.exitRate?.toFixed(2) ?? "",
              bounce_rate: h.bounceRate?.toFixed(2) ?? "", avg_seconds: h.avgSeconds?.toFixed(1) ?? "",
              avg_scroll: h.avgScroll?.toFixed(1) ?? "", revenue: h.revenue ?? "", conversion: h.conversion?.toFixed(2) ?? "",
            }))} name="heat-ranking" />}>
            {!data.heat.length ? <NoData /> : (
              <Table head={["Page", "Views", "Exits", "Exit %", "Bounce %", "Avg time", "Avg scroll", "Revenue", "Conv %"]}>
                {data.heat.slice(0, 40).map((h) => (
                  <tr key={h.path} className="border-t border-border/40">
                    <Cell><span className="truncate inline-block max-w-[200px]">{h.path}</span></Cell>
                    <Cell mono>{h.views}</Cell>
                    <Cell mono>{h.exits}</Cell>
                    <Cell mono><M value={h.exitRate} kind="pct" /></Cell>
                    <Cell mono><M value={h.bounceRate} kind="pct" /></Cell>
                    <Cell mono><M value={h.avgSeconds} kind="sec" /></Cell>
                    <Cell mono><M value={h.avgScroll} kind="pct" /></Cell>
                    <Cell mono><M value={h.revenue} kind="money" /></Cell>
                    <Cell mono><M value={h.conversion} kind="pct" /></Cell>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ------------------------------------------------ products */}
        <TabsContent value="products" className="space-y-4 mt-4">
          <Card title="Product conversion funnel" icon={<PackageSearch className="size-4" />}
            action={<Export rows={() => data.products.map((p) => ({
              product: p.slug, views: p.views, wishlist: p.wishlist, cart: p.cart, checkout: p.checkout,
              purchases: p.purchases, view_to_cart: p.viewToCart?.toFixed(2) ?? "", cart_to_buy: p.cartToBuy?.toFixed(2) ?? "",
              view_to_buy: p.viewToBuy?.toFixed(2) ?? "", revenue: p.revenue ?? "",
            }))} name="product-conversion" />}>
            {!data.products.length ? <NoData /> : (
              <Table head={["Product", "Views", "Wishlist", "Cart", "Checkout", "Purchases", "View→Cart", "Cart→Buy", "View→Buy", "Revenue"]}>
                {data.products.slice(0, 40).map((p) => (
                  <tr key={p.slug} className={`border-t border-border/40 ${p.flag ? "bg-amber-500/5" : ""}`}>
                    <Cell>
                      <span className="truncate inline-block max-w-[180px]">{p.slug}</span>
                      {p.flag && <span className="ml-2 text-[9px] font-mono uppercase text-amber-400">high views · no sales</span>}
                    </Cell>
                    <Cell mono>{p.views}</Cell>
                    <Cell mono>{p.wishlist}</Cell>
                    <Cell mono>{p.cart}</Cell>
                    <Cell mono>{p.checkout}</Cell>
                    <Cell mono>{p.purchases}</Cell>
                    <Cell mono><M value={p.viewToCart} kind="pct" /></Cell>
                    <Cell mono><M value={p.cartToBuy} kind="pct" /></Cell>
                    <Cell mono><M value={p.viewToBuy} kind="pct" /></Cell>
                    <Cell mono><M value={p.revenue} kind="money" /></Cell>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* -------------------------------------------------- search */}
        <TabsContent value="search" className="space-y-4 mt-4">
          <Card title="Search intelligence+" icon={<SearchIcon className="size-4" />}
            action={<Export rows={() => data.searches.map((s) => ({
              term: s.term, searches: s.searches, results: s.results ?? "", purchases: s.purchases,
              exits: s.exits, revenue: Math.round(s.revenue), purchase_rate: s.purchaseRate?.toFixed(2) ?? "",
            }))} name="search-intelligence" />}>
            {!data.searches.length ? <NoData /> : (
              <Table head={["Term", "Searches", "Results", "Purchases", "Exits", "Buy %", "Exit %", "Revenue"]}>
                {data.searches.slice(0, 40).map((s) => (
                  <tr key={s.term} className={`border-t border-border/40 ${s.zeroResult ? "bg-rose-500/5" : ""}`}>
                    <Cell>
                      {s.term}
                      {s.zeroResult && <span className="ml-2 text-[9px] font-mono uppercase text-rose-400">no products</span>}
                    </Cell>
                    <Cell mono>{s.searches}</Cell>
                    <Cell mono>{s.results === null ? <span className="text-muted-foreground text-[11px]">No data available</span> : s.results}</Cell>
                    <Cell mono>{s.purchases}</Cell>
                    <Cell mono>{s.exits}</Cell>
                    <Cell mono><M value={s.purchaseRate} kind="pct" /></Cell>
                    <Cell mono><M value={s.exitRate} kind="pct" /></Cell>
                    <Cell mono>{s.revenue > 0 ? inr(s.revenue) : <span className="text-muted-foreground text-[11px]">No data available</span>}</Cell>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ------------------------------------------------ segments */}
        <TabsContent value="segments" className="space-y-4 mt-4">
          <Card title="Customer segments" icon={<Users className="size-4" />}
            action={<Export rows={() => data.segments.map((s) => ({ segment: s.segment, sessions: s.sessions, orders: s.orders, revenue: Math.round(s.revenue), conversion: s.conversion?.toFixed(2) ?? "" }))} name="customer-segments" />}>
            {!data.segments.length ? <NoData /> : (
              <Table head={["Segment", "Sessions", "Orders", "Revenue", "Conversion", ""]}>
                {data.segments.map((s) => (
                  <tr key={s.segment} className="border-t border-border/40 cursor-pointer hover:bg-white/[0.03]"
                    onClick={() => setFilters({ ...filters, segment: s.segment as VisitorSegment })}>
                    <Cell>{s.segment}</Cell>
                    <Cell mono>{s.sessions}</Cell>
                    <Cell mono>{s.orders}</Cell>
                    <Cell mono>{s.revenue > 0 ? inr(s.revenue) : "—"}</Cell>
                    <Cell mono><M value={s.conversion} kind="pct" /></Cell>
                    <Cell><span className="text-[10px] font-mono uppercase text-muted-foreground">Filter</span></Cell>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ----------------------------------------------- campaigns */}
        <TabsContent value="campaigns" className="space-y-4 mt-4">
          <Card title="Campaign ROI" icon={<Activity className="size-4" />}
            action={<Export rows={() => data.campaigns.map((c) => ({
              campaign: c.campaign, source: c.source, medium: c.medium, visitors: c.visitors, sessions: c.sessions,
              orders: c.orders, revenue: Math.round(c.revenue), refunds: Math.round(c.refunds),
              conversion: c.conversion?.toFixed(2) ?? "", aov: c.aov?.toFixed(0) ?? "",
            }))} name="campaign-roi" />}>
            {!data.campaigns.length ? <NoData label="No campaign-tagged traffic recorded" /> : (
              <>
                <Table head={["Campaign", "Source", "Medium", "Visitors", "Sessions", "Orders", "Revenue", "Refunds", "Conv", "AOV", "ROI"]}>
                  {data.campaigns.slice(0, 30).map((c) => (
                    <tr key={c.campaign} className="border-t border-border/40">
                      <Cell>{c.campaign}</Cell>
                      <Cell>{c.source || "—"}</Cell>
                      <Cell>{c.medium || "—"}</Cell>
                      <Cell mono>{c.visitors}</Cell>
                      <Cell mono>{c.sessions}</Cell>
                      <Cell mono>{c.orders}</Cell>
                      <Cell mono>{inr(c.revenue)}</Cell>
                      <Cell mono>{c.refunds > 0 ? inr(c.refunds) : "—"}</Cell>
                      <Cell mono><M value={c.conversion} kind="pct" /></Cell>
                      <Cell mono><M value={c.aov} kind="money" /></Cell>
                      <Cell mono><span className="text-muted-foreground text-[11px]">No campaign cost data.</span></Cell>
                    </tr>
                  ))}
                </Table>
                <p className="text-[10px] text-muted-foreground mt-3">ROI is intentionally blank: the platform stores no campaign spend, so it is never estimated.</p>
              </>
            )}
          </Card>
        </TabsContent>

        {/* ------------------------------------------------- compare */}
        <TabsContent value="compare" className="space-y-4 mt-4">
          <Card title="Funnel comparison" icon={<LineChart className="size-4" />}
            action={<Export rows={() => data.comparison.map((c) => ({
              group: c.group, sessions: c.sessions, product: c.product, cart: c.cart, checkout: c.checkout,
              orders: c.orders, conversion: c.conversion?.toFixed(2) ?? "",
            }))} name="funnel-comparison" />}>
            {!data.comparison.length ? <NoData /> : (
              <Table head={["Group", "Sessions", "Product", "Cart", "Checkout", "Orders", "Conversion", "Product→Cart", "Checkout→Order"]}>
                {data.comparison.map((c) => (
                  <tr key={c.group} className="border-t border-border/40">
                    <Cell>{c.group}</Cell>
                    <Cell mono>{c.sessions}</Cell>
                    <Cell mono>{c.product}</Cell>
                    <Cell mono>{c.cart}</Cell>
                    <Cell mono>{c.checkout}</Cell>
                    <Cell mono>{c.orders}</Cell>
                    <Cell mono><M value={c.conversion} kind="pct" /></Cell>
                    <Cell mono><M value={c.cartRate} kind="pct" /></Cell>
                    <Cell mono><M value={c.checkoutRate} kind="pct" /></Cell>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </TabsContent>

        {/* ------------------------------------------------ checkout */}
        <TabsContent value="checkout" className="space-y-4 mt-4">
          <Card title="Checkout behavior" icon={<ShoppingCart className="size-4" />}>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2.5">
              <Kpi label="Checkout sessions" value={data.checkout.checkoutSessions} />
              <Kpi label="Shipping exits" value={data.checkout.shippingExits} />
              <Kpi label="Payment exits" value={data.checkout.paymentExits} />
              <Kpi label="Coupon used" value={data.checkout.couponUsed} />
              <Kpi label="COD orders" value={data.checkout.cod} />
              <Kpi label="Online orders" value={data.checkout.online} />
              <Kpi label="Payment failures" value={data.checkout.failures} />
              <Kpi label="Retry sessions" value={data.checkout.retries} />
              <Kpi label="Avg checkout time" value={data.checkout.avgCheckoutSec} kind="sec" />
            </div>
          </Card>
        </TabsContent>

        {/* ---------------------------------------------------- perf */}
        <TabsContent value="perf" className="space-y-4 mt-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Slowest pages (measured dwell)" icon={<Timer className="size-4" />}>
              {!data.performance.slowest.length ? <NoData label="No page engagement events recorded yet" /> : (
                <Table head={["Page", "Avg time", "Samples", "Bounce"]}>
                  {data.performance.slowest.map((p) => (
                    <tr key={p.path} className="border-t border-border/40">
                      <Cell><span className="truncate inline-block max-w-[180px]">{p.path}</span></Cell>
                      <Cell mono>{Math.round(p.avgSeconds)}s</Cell>
                      <Cell mono>{p.samples}</Cell>
                      <Cell mono><M value={p.bounceRate} kind="pct" /></Cell>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
            <Card title="Fastest exits" icon={<Timer className="size-4" />}>
              {!data.performance.fastest.length ? <NoData label="No page engagement events recorded yet" /> : (
                <Table head={["Page", "Avg time", "Samples", "Scroll"]}>
                  {data.performance.fastest.map((p) => (
                    <tr key={p.path} className="border-t border-border/40">
                      <Cell><span className="truncate inline-block max-w-[180px]">{p.path}</span></Cell>
                      <Cell mono>{Math.round(p.avgSeconds)}s</Cell>
                      <Cell mono>{p.samples}</Cell>
                      <Cell mono><M value={p.avgScroll} kind="pct" /></Cell>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
            <Card title="High bounce with very short stay" icon={<Gauge className="size-4" />}>
              {!data.performance.speedBounce.length ? <NoData /> : (
                <Table head={["Page", "Bounce", "Avg time"]}>
                  {data.performance.speedBounce.map((p) => (
                    <tr key={p.path} className="border-t border-border/40">
                      <Cell><span className="truncate inline-block max-w-[180px]">{p.path}</span></Cell>
                      <Cell mono><M value={p.bounceRate} kind="pct" /></Cell>
                      <Cell mono>{Math.round(p.avgSeconds)}s</Cell>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
            <Card title="Core Web Vitals" icon={<Activity className="size-4" />}>
              {!data.performance.webVitals.length ? <NoData label="No Core Web Vitals events are being collected" /> : (
                <Table head={["Metric", "Average", "Samples"]}>
                  {data.performance.webVitals.map((v) => (
                    <tr key={v.metric} className="border-t border-border/40">
                      <Cell>{v.metric}</Cell>
                      <Cell mono>{v.value.toFixed(1)}</Cell>
                      <Cell mono>{v.samples}</Cell>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          </div>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            Coverage · {data.coverage.events.toLocaleString()} events · {data.coverage.engagementEvents.toLocaleString()} engagement · {data.coverage.scrollSamples.toLocaleString()} scroll samples
          </p>
        </TabsContent>
      </Tabs>

      {open && <ReplayDrawer r={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
