import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, LayoutDashboard, Table2, RefreshCw } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { SegmentedTabs } from "@/components/admin/SegmentedTabs";
import { supabase } from "@/integrations/supabase/client";
import {
  getPaymentsOverviewFn,
  type PaymentsOverview,
} from "@/lib/payments-center-v3.functions";
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

type Tab = "overview" | "india" | "international" | "ledger";

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
    const today = new Date().toISOString().slice(0, 10);
    if (k === "today") { setPreset({ from: today, to: today }); setTab("ledger"); return; }
    if (k === "pending") { setPreset({ status: "pending" }); setTab("ledger"); return; }
    if (k === "failed") { setPreset({ status: "failed" }); setTab("ledger"); return; }
    if (k === "refunds") { setPreset({ status: "refunded" }); setTab("ledger"); return; }
    if (k === "exports") { setPreset({}); setTab("ledger"); return; }
    setTab("overview"); // settlements: no source yet, overview explains why
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
              { value: "india", label: "🇮🇳 India" },
              { value: "international", label: "🌍 International" },
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
              {tab === "india" && <RegionPanel block={data.regions.india} />}
              {tab === "international" && <RegionPanel block={data.regions.international} />}
              {tab === "ledger" && (
                <PaymentsLedger
                  region="all"
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
