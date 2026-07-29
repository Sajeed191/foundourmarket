/**
 * AI Revenue Dashboard — Revenue Intelligence Engine (v1.0).
 *
 * Orchestration only: reads Executive Analytics, the products cache, Traffic
 * Intelligence and Marketplace Health, then surfaces revenue KPIs,
 * opportunities, Flash Deal intelligence, ranking, forecast, alerts and a
 * what-if simulator. Every action routes through Universal Smart Navigation.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, RefreshCw, Sparkles } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { CopilotTimeline } from "@/components/admin/copilot/CopilotTimeline";
import { RevenueExecutiveSummaryCard, RevenueKpiGrid } from "@/components/admin/revenue/RevenueKpiGrid";
import { RevenueOpportunityCard } from "@/components/admin/revenue/RevenueOpportunityCard";
import { FlashIntelligencePanel } from "@/components/admin/revenue/FlashIntelligencePanel";
import {
  ProductRankingPanel,
  RevenueAlertsPanel,
  RevenueForecastPanel,
  RevenueSimulatorPanel,
} from "@/components/admin/revenue/RevenuePanels";
import { useRevenueIntelligence } from "@/lib/revenue-intelligence/use-revenue-intelligence";
import { dismiss as dismissOpportunity, recordFeedback } from "@/lib/revenue-intelligence/learning";
import { useProducts } from "@/lib/use-products";
import { cn } from "@/lib/utils";

type TabId = "opportunities" | "flash" | "ranking" | "alerts" | "simulator";

const TABS: { id: TabId; label: string }[] = [
  { id: "opportunities", label: "Opportunities" },
  { id: "flash", label: "Flash Deals" },
  { id: "ranking", label: "Ranking" },
  { id: "alerts", label: "Alerts" },
  { id: "simulator", label: "Simulator" },
];

export const Route = createFileRoute("/admin-revenue")({
  head: () => ({
    meta: [
      { title: "Revenue Intelligence — FoundOurMarket™" },
      {
        name: "description",
        content:
          "AI revenue dashboard for FoundOurMarket™ — revenue KPIs, opportunity detection, Flash Deal intelligence, product ranking, forecasts and a what-if simulator.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RevenuePage,
});

function RevenuePage() {
  const { snapshot, loading, error, refreshLearning } = useRevenueIntelligence();
  const { products } = useProducts();
  const [tab, setTab] = useState<TabId>("opportunities");

  const counts = useMemo(
    () => ({
      opportunities: snapshot?.opportunities.length ?? 0,
      flash: snapshot?.flash.length ?? 0,
      ranking: snapshot?.ranking.length ?? 0,
      alerts: snapshot?.alerts.length ?? 0,
      simulator: 0,
    }),
    [snapshot],
  );

  return (
    <AdminShell
      title="Revenue Intelligence"
      subtitle="Where revenue is coming from, what is being left on the table, and what to do next"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border/70 hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Admin Home
          </Link>
          <Link
            to="/admin-copilot"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border/70 hover:text-foreground"
          >
            <Sparkles className="size-3.5" /> Copilot
          </Link>
        </div>
      }
    >
      {error ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
          {error}
        </div>
      ) : loading || !snapshot ? (
        <div className="rounded-2xl border border-border/40 bg-card/40 p-8 text-center text-sm text-muted-foreground">
          <RefreshCw className="mx-auto mb-3 size-5 animate-spin text-accent" />
          Reading revenue signals…
        </div>
      ) : (
        <div className="space-y-6">
          <RevenueExecutiveSummaryCard snapshot={snapshot} />
          <RevenueKpiGrid snapshot={snapshot} />
          <RevenueForecastPanel forecast={snapshot.forecast} currency={snapshot.kpis.currency} />

          <div className="flex flex-wrap gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "rounded-full border px-3.5 py-1.5 text-xs font-medium transition",
                  tab === t.id
                    ? "border-accent/50 bg-accent/10 text-accent"
                    : "border-border/40 bg-card/40 text-muted-foreground hover:border-border/70 hover:text-foreground",
                )}
              >
                {t.label}
                {counts[t.id] > 0 ? (
                  <span className="ml-1.5 tabular-nums text-[11px] opacity-80">({counts[t.id]})</span>
                ) : null}
              </button>
            ))}
          </div>

          {tab === "opportunities" &&
            (snapshot.opportunities.length === 0 ? (
              <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-8 text-center text-sm text-emerald-300">
                No open revenue opportunities.
              </div>
            ) : (
              <div className="space-y-2">
                <AnimatePresence initial={false}>
                  {snapshot.opportunities.map((o, idx) => (
                    <RevenueOpportunityCard
                      key={o.id}
                      opportunity={o}
                      currency={snapshot.kpis.currency}
                      siblings={snapshot.opportunities}
                      index={idx}
                      onAccept={(x) => {
                        recordFeedback(x.signal, "accepted");
                        refreshLearning();
                      }}
                      onDismiss={(x) => {
                        recordFeedback(x.signal, "dismissed");
                        dismissOpportunity(x.id);
                        refreshLearning();
                      }}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ))}

          {tab === "flash" && <FlashIntelligencePanel items={snapshot.flash} currency={snapshot.kpis.currency} />}
          {tab === "ranking" && <ProductRankingPanel ranking={snapshot.ranking} currency={snapshot.kpis.currency} />}
          {tab === "alerts" && <RevenueAlertsPanel alerts={snapshot.alerts} />}
          {tab === "simulator" && <RevenueSimulatorPanel products={products} currency={snapshot.kpis.currency} />}

          <CopilotTimeline />
        </div>
      )}
    </AdminShell>
  );
}
