import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LayoutDashboard, Table2, RefreshCw, LineChart, Gauge, Globe2, HeartPulse, Scale, ClipboardList } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { SegmentedTabs } from "@/components/admin/SegmentedTabs";
import { supabase } from "@/integrations/supabase/client";
import {
  getPaymentsOverviewFn,
  type PaymentsOverview,
} from "@/lib/payments-center-v3.functions";
import {
  getFinanceOpsFn,
  type FinanceOps,
  type OpsAction,
} from "@/lib/payments-ops-v5.functions";
import {
  getFinancialIntelligenceFn,
  type FinancialIntelligence,
} from "@/lib/payments-intel-v4.functions";
import {
  getGlobalFinanceFn,
  type GlobalFinance,
} from "@/lib/payments-global-v6.functions";
import {
  getRegionalBreakdownFn,
  type RegionalBreakdown,
} from "@/lib/payments-global-v65.functions";
import type { BreakdownDrill } from "@/components/admin/payments/RegionalBreakdownPanel";
import {
  getCFODashboardFn,
  auditCFOExportFn,
  type CFODashboard,
} from "@/lib/payments-cfo-v7.functions";
import type { CFODrill } from "@/components/admin/payments/CFOPanel";
import {
  getReconDashboardFn,
  auditReconExportFn,
  type ReconDashboard,
} from "@/lib/payments-recon-v8.functions";
import type { ReconDrill } from "@/components/admin/payments/ReconciliationPanel";
import {
  getFinanceWorkspaceFn,
  workspaceSearchFn,
  addFinanceNoteFn,
  recordReviewDecisionFn,
  type FinanceWorkspace,
  type WorkspaceAction,
} from "@/lib/payments-workspace-v9.functions";
import type { WorkspaceDecision } from "@/components/admin/payments/WorkspacePanel";




import { EmptyState, Panel } from "@/components/admin/payments/ui";
import { LiveActivityFeed } from "@/components/admin/payments/LiveActivityFeed";
import type { LedgerFacets, LedgerPreset } from "@/components/admin/payments/PaymentsLedger";
import { QuickActionBar, type QuickKey } from "@/components/admin/payments/QuickActionBar";

const TransactionDrawer = lazy(() =>
  import("@/components/admin/payments/TransactionDrawer").then((m) => ({ default: m.TransactionDrawer })),
);

const PaymentsOverviewPanel = lazy(() =>
  import("@/components/admin/payments/PaymentsOverviewPanel").then((m) => ({ default: m.PaymentsOverviewPanel })),
);
const RegionPanel = lazy(() =>
  import("@/components/admin/payments/RegionPanel").then((m) => ({ default: m.RegionPanel })),
);
const FinanceOpsPanel = lazy(() =>
  import("@/components/admin/payments/FinanceOpsPanel").then((m) => ({ default: m.FinanceOpsPanel })),
);
const FinancialIntelligencePanel = lazy(() =>
  import("@/components/admin/payments/FinancialIntelligencePanel").then((m) => ({ default: m.FinancialIntelligencePanel })),
);
const GlobalFinancePanel = lazy(() =>
  import("@/components/admin/payments/GlobalFinancePanel").then((m) => ({ default: m.GlobalFinancePanel })),
);
const RegionalBreakdownPanel = lazy(() =>
  import("@/components/admin/payments/RegionalBreakdownPanel").then((m) => ({ default: m.RegionalBreakdownPanel })),
);
const CFOPanel = lazy(() =>
  import("@/components/admin/payments/CFOPanel").then((m) => ({ default: m.CFOPanel })),
);


const ReconciliationPanel = lazy(() =>
  import("@/components/admin/payments/ReconciliationPanel").then((m) => ({ default: m.ReconciliationPanel })),
);

const WorkspacePanel = lazy(() =>
  import("@/components/admin/payments/WorkspacePanel").then((m) => ({ default: m.WorkspacePanel })),
);


const PaymentsLedger = lazy(() =>
  import("@/components/admin/payments/PaymentsLedger").then((m) => ({ default: m.PaymentsLedger })),
);


export const Route = createFileRoute("/admin-payments")({
  head: () => ({
    meta: [
      { title: "Payments Center — FoundOurMarket™" },
      { name: "description", content: "Marketplace finance dashboard: revenue, India & international analytics, gateways, refunds and the full payment ledger." },
      { property: "og:title", content: "Payments Center — FoundOurMarket™" },
      { property: "og:description", content: "Executive payment analytics for India and international marketplace revenue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentsPage,
});

type Tab = "overview" | "workspace" | "ops" | "finance" | "india" | "international" | "global" | "cfo" | "recon" | "ledger";

const WINDOWS = [30, 90, 180, 365];

function PaymentsPage() {
  return (
    <AdminShell
      title="Payments Center"
      subtitle="Revenue · India & international · gateways · refunds · ledger"
      allow={["admin", "super_admin", "manager"]}
    >
      <PaymentsInner />
    </AdminShell>
  );
}

const Fallback = () => (
  <div className="p-10 grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
);

function PaymentsInner() {
  const overviewFn = useServerFn(getPaymentsOverviewFn);
  const intelFn = useServerFn(getFinancialIntelligenceFn);
  const opsFn = useServerFn(getFinanceOpsFn);
  const [ops, setOps] = useState<FinanceOps | null>(null);
  const [opsLoading, setOpsLoading] = useState(false);
  const [intel, setIntel] = useState<FinancialIntelligence | null>(null);
  const [intelLoading, setIntelLoading] = useState(false);
  const globalFn = useServerFn(getGlobalFinanceFn);
  const [globalData, setGlobalData] = useState<GlobalFinance | null>(null);
  const [globalLoading, setGlobalLoading] = useState(false);
  const breakdownFn = useServerFn(getRegionalBreakdownFn);
  const [breakdown, setBreakdown] = useState<RegionalBreakdown | null>(null);
  const [breakdownLoading, setBreakdownLoading] = useState(false);
  const [ledgerRegion, setLedgerRegion] = useState<"all" | "india" | "international">("all");
  // CFO Dashboard (v7): lazy on first open, cached in state, one request per window.
  const cfoFn = useServerFn(getCFODashboardFn);
  const auditExportFn = useServerFn(auditCFOExportFn);
  const [cfo, setCfo] = useState<CFODashboard | null>(null);
  const [cfoLoading, setCfoLoading] = useState(false);
  // Reconciliation & Executive Intelligence (v8): lazy, cached, one request per window.
  const reconFn = useServerFn(getReconDashboardFn);
  const auditReconExport = useServerFn(auditReconExportFn);
  const [recon, setRecon] = useState<ReconDashboard | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  // Finance Workspace (v9): operations-first surface — lazy, cached per window.
  const workspaceFn = useServerFn(getFinanceWorkspaceFn);
  const wsSearchFn = useServerFn(workspaceSearchFn);
  const wsNoteFn = useServerFn(addFinanceNoteFn);
  const wsDecisionFn = useServerFn(recordReviewDecisionFn);
  const [workspace, setWorkspace] = useState<FinanceWorkspace | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(false);



  const [tab, setTab] = useState<Tab>("overview");

  const [windowDays, setWindowDays] = useState(90);
  const [data, setData] = useState<PaymentsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [quick, setQuick] = useState<QuickKey | null>(null);
  const [preset, setPreset] = useState<LedgerPreset | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await overviewFn({ data: { windowDays } });
      if (id === reqId.current) setData(res);
    } catch {
      if (id === reqId.current) setData(null);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [overviewFn, windowDays]);

  useEffect(() => { load(); }, [load]);

  // Financial Intelligence is fetched lazily the first time its tab is opened,
  // then refreshed with the window / refresh key (cached in state — no duplicate calls).
  useEffect(() => {
    if (tab !== "finance") return;
    let alive = true;
    setIntelLoading(true);
    intelFn({ data: { windowDays } })
      .then((res) => { if (alive) setIntel(res); })
      .catch(() => { if (alive) setIntel(null); })
      .finally(() => { if (alive) setIntelLoading(false); });
    return () => { alive = false; };
  }, [tab, windowDays, refreshKey, intelFn]);
  // Global Financial Intelligence (v6): lazy on first open, cached in state,
  // refreshed only with the window / refresh key — no duplicate requests.
  useEffect(() => {
    if (tab !== "global") return;
    let alive = true;
    setGlobalLoading(true);
    globalFn({ data: { windowDays } })
      .then((res) => { if (alive) setGlobalData(res); })
      .catch(() => { if (alive) setGlobalData(null); })
      .finally(() => { if (alive) setGlobalLoading(false); });
    return () => { alive = false; };
  }, [tab, windowDays, refreshKey, globalFn]);

  // Regional Financial Breakdown (v6.5): India / International / Global computed
  // independently. Lazy on first open of the Global tab, cached in state.
  useEffect(() => {
    if (tab !== "global") return;
    let alive = true;
    setBreakdownLoading(true);
    breakdownFn({ data: { windowDays } })
      .then((res) => { if (alive) setBreakdown(res); })
      .catch(() => { if (alive) setBreakdown(null); })
      .finally(() => { if (alive) setBreakdownLoading(false); });
    return () => { alive = false; };
  }, [tab, windowDays, refreshKey, breakdownFn]);

  // Deep drill-down: any breakdown metric opens the ledger already filtered.
  const onBreakdownDrill = useCallback((d: BreakdownDrill) => {
    setLedgerRegion(d.region ?? "all");
    setPreset({
      status: d.status,
      country: d.country,
      currency: d.currency,
      gateway: d.gateway,
    });
    setTab("ledger");
  }, []);

  // CFO Dashboard (v7): lazy on first open of its tab, cached, refreshed with
  // the window / refresh key only — no duplicate database reads.
  useEffect(() => {
    if (tab !== "cfo") return;
    let alive = true;
    setCfoLoading(true);
    cfoFn({ data: { windowDays } })
      .then((res) => { if (alive) setCfo(res); })
      .catch(() => { if (alive) setCfo(null); })
      .finally(() => { if (alive) setCfoLoading(false); });
    return () => { alive = false; };
  }, [tab, windowDays, refreshKey, cfoFn]);

  // CFO drill-down: alerts and recommendations open the filtered ledger.
  const onCfoDrill = useCallback((d: CFODrill) => {
    setLedgerRegion("all");
    setPreset({ status: d.status });
    setTab("ledger");
  }, []);

  // Reconciliation dashboard (v8): fetched only when its tab is open.
  useEffect(() => {
    if (tab !== "recon") return;
    let alive = true;
    setReconLoading(true);
    reconFn({ data: { windowDays } })
      .then((res) => { if (alive) setRecon(res); })
      .catch(() => { if (alive) setRecon(null); })
      .finally(() => { if (alive) setReconLoading(false); });
    return () => { alive = false; };
  }, [tab, windowDays, refreshKey, reconFn]);

  // Executive drill-down: any reconciliation KPI opens its supporting records.
  const onReconDrill = useCallback((d: ReconDrill) => {
    setLedgerRegion(d.region ?? "all");
    setPreset({
      status: d.status,
      from: d.from,
      to: d.to,
      country: d.country,
      currency: d.currency,
      gateway: d.gateway,
    });
    setTab("ledger");
  }, []);

  const onReconExport = useCallback((report: string) => {
    void auditReconExport({ data: { report } }).catch(() => {});
  }, [auditReconExport]);

  // Finance Workspace (v9): only fetched while its tab is open.
  const loadWorkspace = useCallback(() => {
    setWorkspaceLoading(true);
    return workspaceFn({ data: { windowDays } })
      .then((res) => setWorkspace(res))
      .catch(() => setWorkspace(null))
      .finally(() => setWorkspaceLoading(false));
  }, [workspaceFn, windowDays]);

  useEffect(() => {
    if (tab !== "workspace") return;
    let alive = true;
    setWorkspaceLoading(true);
    workspaceFn({ data: { windowDays } })
      .then((res) => { if (alive) setWorkspace(res); })
      .catch(() => { if (alive) setWorkspace(null); })
      .finally(() => { if (alive) setWorkspaceLoading(false); });
    return () => { alive = false; };
  }, [tab, windowDays, refreshKey, workspaceFn]);

  // Every workspace task resolves into an existing surface — nothing new to learn.
  const onWorkspaceAction = useCallback((a: WorkspaceAction) => {
    const today = new Date().toISOString().slice(0, 10);
    setLedgerRegion("all");
    if (a === "ledger_failed") { setPreset({ status: "failed" }); setTab("ledger"); return; }
    if (a === "ledger_pending") { setPreset({ status: "pending" }); setTab("ledger"); return; }
    if (a === "ledger_refunds") { setPreset({ status: "refunded" }); setTab("ledger"); return; }
    if (a === "ledger_today") { setPreset({ from: today, to: today }); setTab("ledger"); return; }
    if (a === "ledger_all") { setPreset({}); setTab("ledger"); return; }
    if (a === "recon") { setTab("recon"); return; }
  }, []);

  const onWorkspaceSearch = useCallback(
    (q: string) => wsSearchFn({ data: { q } }),
    [wsSearchFn],
  );

  const onWorkspaceNote = useCallback(
    async (entityId: string, body: string, mention: string | null) => {
      await wsNoteFn({ data: { entityId, body, mention } });
      await loadWorkspace();
    },
    [wsNoteFn, loadWorkspace],
  );

  const onWorkspaceDecision = useCallback(
    async (d: WorkspaceDecision) => {
      await wsDecisionFn({ data: d });
      await loadWorkspace();
    },
    [wsDecisionFn, loadWorkspace],
  );


  // Every executive export is audited through the existing security trail.
  const onCfoExport = useCallback((report: string) => {
    void auditExportFn({ data: { report } }).catch(() => {});
  }, [auditExportFn]);





  // Finance Operations is fetched lazily on first open, then kept in state
  // and refreshed with the window / refresh key (no duplicate requests).
  useEffect(() => {
    if (tab !== "ops") return;
    let alive = true;
    setOpsLoading(true);
    opsFn({ data: { windowDays } })
      .then((res) => { if (alive) setOps(res); })
      .catch(() => { if (alive) setOps(null); })
      .finally(() => { if (alive) setOpsLoading(false); });
    return () => { alive = false; };
  }, [tab, windowDays, refreshKey, opsFn]);

  // Realtime: one debounced refresh for all finance tables (no duplicate requests).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ping = () => {
      setPulse(true);
      setTimeout(() => setPulse(false), 900);
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { load(); setRefreshKey((k) => k + 1); }, 1200);
    };
    const ch = supabase
      .channel("payments-center-v3")
      .on("postgres_changes", { event: "*", schema: "public", table: "payments" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "refunds" }, ping)
      .subscribe();
    return () => { if (timer) clearTimeout(timer); supabase.removeChannel(ch); };
  }, [load]);

  const onQuick = useCallback((k: QuickKey) => {
    setQuick(k);
    setLedgerRegion("all");
    const today = new Date().toISOString().slice(0, 10);

    if (k === "today") { setPreset({ from: today, to: today }); setTab("ledger"); return; }
    if (k === "pending") { setPreset({ status: "pending" }); setTab("ledger"); return; }
    if (k === "failed") { setPreset({ status: "failed" }); setTab("ledger"); return; }
    if (k === "refunds") { setPreset({ status: "refunded" }); setTab("ledger"); return; }
    if (k === "exports") { setPreset({}); setTab("ledger"); return; }
    setTab("overview"); // settlements: no source yet, overview explains why
  }, []);

  const onIntelAction = useCallback((action: string) => {
    if (action === "ledger_failed") { setPreset({ status: "failed" }); setTab("ledger"); return; }
    if (action === "ledger_refunds") { setPreset({ status: "refunded" }); setTab("ledger"); return; }
    if (action === "region_india") { setTab("india"); return; }
    if (action === "region_intl") { setTab("international"); return; }
    setTab("overview");
  }, []);

  const onOpsAction = useCallback((a: OpsAction) => {
    const today = new Date().toISOString().slice(0, 10);
    if (a === "ledger_failed") { setPreset({ status: "failed" }); setTab("ledger"); return; }
    if (a === "ledger_pending") { setPreset({ status: "pending" }); setTab("ledger"); return; }
    if (a === "ledger_refunds") { setPreset({ status: "refunded" }); setTab("ledger"); return; }
    if (a === "ledger_today") { setPreset({ from: today, to: today }); setTab("ledger"); return; }
    if (a === "ledger_all") { setPreset({}); setTab("ledger"); return; }
    if (a === "gateways") { setTab("overview"); return; }
  }, []);

  const facets: LedgerFacets = useMemo(() => {
    if (!data) return { currencies: [], gateways: [], methods: [], countries: [] };
    const cur = new Set<string>();
    const met = new Set<string>();
    const cty = new Set<string>();
    for (const region of ["india", "international"] as const) {
      const b = data.regions[region];
      b.currencies.forEach((c) => cur.add(c.k));
      b.methods.forEach((m) => met.add(m.k));
      if (region === "international") b.geo.forEach((g) => cty.add(g.k));
    }
    return {
      currencies: [...cur].sort(),
      gateways: data.gateways.map((g) => g.provider),
      methods: [...met].sort(),
      countries: [...cty].sort(),
    };
  }, [data]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:justify-between">
        <div className="min-w-0">
          <SegmentedTabs
            value={tab}
            onChange={setTab}
            items={[
              { value: "overview", label: "Overview", icon: <LayoutDashboard className="size-3" /> },
              { value: "workspace", label: "Workspace", icon: <ClipboardList className="size-3" /> },

              { value: "ops", label: "Operations", icon: <Gauge className="size-3" /> },
              { value: "finance", label: "Finance", icon: <LineChart className="size-3" /> },
              { value: "india", label: "🇮🇳 India" },
              { value: "international", label: "🌍 International" },
              { value: "global", label: "🌐 Global", icon: <Globe2 className="size-3" /> },
              { value: "cfo", label: "CFO", icon: <HeartPulse className="size-3" /> },
              { value: "recon", label: "Reconcile", icon: <Scale className="size-3" /> },


              { value: "ledger", label: "Payments", icon: <Table2 className="size-3" /> },
            ]}
          />
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <select
            value={windowDays}
            onChange={(e) => setWindowDays(Number(e.target.value))}
            className="bg-white/[0.03] border border-white/10 rounded-xl px-2.5 py-2 text-[11px] focus:outline-none focus:border-accent/40"
          >
            {WINDOWS.map((d) => <option key={d} value={d} className="bg-background">{d}d</option>)}
          </select>
          <button
            onClick={() => { load(); setRefreshKey((k) => k + 1); }}
            className="rounded-xl border border-white/10 p-2 hover:bg-white/5"
            title="Refresh"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin text-accent" : ""}`} />
          </button>
        </div>
      </div>

      {data && <QuickActionBar counts={data.quick} active={quick} onSelect={onQuick} />}

      {loading && !data && <Fallback />}

      {!loading && !data && (
        <Panel title="Payments Center">
          <EmptyState
            title="No payment data available yet."
            hint="Once your first order is paid, revenue, gateway performance and the full ledger appear here automatically."
          />
        </Panel>
      )}

      {data && (
        <div className="grid xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
          <div className="min-w-0">
            <Suspense fallback={<Fallback />}>
              {tab === "overview" && <PaymentsOverviewPanel data={data} />}
              {tab === "ops" && (
                ops
                  ? <FinanceOpsPanel data={ops} onAction={onOpsAction} onOpenPayment={setDetailId} />
                  : opsLoading ? <Fallback /> : (
                    <Panel title="Finance operations">
                      <EmptyState
                        title="No finance activity yet."
                        hint="The operations board, action queue, timeline and alerts appear as soon as payments, refunds or exports are recorded."
                      />
                    </Panel>
                  )
              )}
              {tab === "finance" && (
                intel
                  ? <FinancialIntelligencePanel data={intel} onAction={onIntelAction} />
                  : intelLoading ? <Fallback /> : (
                    <Panel title="Financial intelligence">
                      <EmptyState
                        title="No financial data available yet."
                        hint="Revenue, refunds, failures and commission analytics appear as soon as the marketplace records activity."
                      />
                    </Panel>
                  )
              )}
              {tab === "india" && <RegionPanel block={data.regions.india} />}
              {tab === "international" && <RegionPanel block={data.regions.international} />}
              {tab === "global" && (
                <div className="space-y-4">
                  {globalData
                    ? <GlobalFinancePanel data={globalData} />
                    : globalLoading ? <Fallback /> : (
                      <Panel title="Global financial intelligence">
                        <EmptyState
                          title="No financial data available yet."
                          hint="India, international and global analytics populate automatically once the marketplace records its first payment."
                        />
                      </Panel>
                    )}
                  {breakdown
                    ? <RegionalBreakdownPanel data={breakdown} onDrill={onBreakdownDrill} />
                    : breakdownLoading ? <Fallback /> : (
                      <Panel title="Regional financial breakdown">
                        <EmptyState title="No data available" />
                      </Panel>
                    )}
                </div>
              )}

              {tab === "cfo" && (
                cfo
                  ? <CFOPanel data={cfo} onDrill={onCfoDrill} windowDays={windowDays} onAuditExport={onCfoExport} />
                  : cfoLoading ? <Fallback /> : (
                    <Panel title="CFO dashboard">
                      <EmptyState
                        title="No data available"
                        hint="Financial health, profitability, cash flow and forecasts populate automatically once the marketplace records its first payment."
                      />
                    </Panel>
                  )
              )}


              {tab === "recon" && (
                recon
                  ? <ReconciliationPanel data={recon} onDrill={onReconDrill} onAuditExport={onReconExport} />
                  : reconLoading ? <Fallback /> : (
                    <Panel title="Financial reconciliation">
                      <EmptyState
                        title="No data available"
                        hint="Reconciliation, verification, leakage and audit intelligence populate automatically once orders and payments exist."
                      />
                    </Panel>
                  )
              )}

              {tab === "ledger" && (
                <PaymentsLedger
                  region={ledgerRegion}

                  facets={facets}
                  refreshKey={refreshKey}
                  preset={preset}
                  onSelect={setDetailId}
                />
              )}
            </Suspense>
          </div>
          <div className="hidden xl:block sticky top-4">
            <LiveActivityFeed items={data.activity} live={pulse} />
          </div>
        </div>
      )}

      {data && (
        <div className="xl:hidden">
          <LiveActivityFeed items={data.activity} live={pulse} />
        </div>
      )}

      {detailId && (
        <Suspense fallback={null}>
          <TransactionDrawer paymentId={detailId} onClose={() => setDetailId(null)} />
        </Suspense>
      )}
    </div>
  );
}
