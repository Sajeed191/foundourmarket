/**
 * Marketplace Operations Copilot (v1.0).
 *
 * An always-on operations manager: daily brief, opportunities, risks,
 * predictions, one health score and a timeline. Orchestration only — it reads
 * the frozen intelligence contracts and routes every action through Universal
 * Smart Navigation and the existing Universal AI Auto-Fix system.
 */
import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence } from "framer-motion";
import { ArrowLeft, RefreshCw, Sparkles } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { cn } from "@/lib/utils";
import { useCopilot } from "@/lib/copilot/use-copilot";
import { CopilotBrief } from "@/components/admin/copilot/CopilotBrief";
import { CopilotHealthPanel } from "@/components/admin/copilot/CopilotHealthPanel";
import { CopilotInsightCard } from "@/components/admin/copilot/CopilotInsightCard";
import { CopilotTimeline } from "@/components/admin/copilot/CopilotTimeline";
import { AutoFixBatchBar, type AutoFixCandidate } from "@/components/admin/AutoFixBatchBar";
import { AutoFixActivityLog } from "@/components/admin/AutoFixActivityLog";
import { useProducts } from "@/lib/use-products";
import { planAutoFixes } from "@/lib/auto-fix/planners";
import type { CopilotInsight } from "@/lib/copilot/types";

type TabId = "priorities" | "opportunities" | "risks" | "predictions";

const TABS: { id: TabId; label: string }[] = [
  { id: "priorities", label: "Priorities" },
  { id: "opportunities", label: "Opportunities" },
  { id: "risks", label: "Risks" },
  { id: "predictions", label: "Predictions" },
];

export const Route = createFileRoute("/admin-copilot")({
  head: () => ({
    meta: [
      { title: "Operations Copilot — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Always-on marketplace operations intelligence for FoundOurMarket™ — daily brief, opportunities, risks, predictions and marketplace health in one place.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CopilotPage,
});

function CopilotPage() {
  const { snapshot, loading, dismiss } = useCopilot();
  const { products } = useProducts();
  const [tab, setTab] = useState<TabId>("priorities");

  const lists = useMemo(() => {
    if (!snapshot) return { priorities: [], opportunities: [], risks: [], predictions: [] } as Record<TabId, CopilotInsight[]>;
    const priorities = [...snapshot.risks, ...snapshot.opportunities]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 20);
    return {
      priorities,
      opportunities: snapshot.opportunities,
      risks: snapshot.risks,
      predictions: snapshot.predictions,
    } as Record<TabId, CopilotInsight[]>;
  }, [snapshot]);

  const items = lists[tab];

  // Safe metadata fixes available for the products referenced on this screen.
  const candidates = useMemo<AutoFixCandidate[]>(() => {
    const slugs = new Set(items.filter((i) => i.issue.entity === "product").map((i) => i.issue.entityId));
    const out: AutoFixCandidate[] = [];
    for (const p of products) {
      if (!slugs.has(p.slug)) continue;
      const proposals = planAutoFixes(p);
      if (proposals.length) out.push({ product: p, proposals });
    }
    return out;
  }, [items, products]);

  return (
    <AdminShell
      title="Operations Copilot"
      subtitle="Always watching the marketplace — opportunities, risks and what to do next"
      actions={
        <div className="flex items-center gap-2">
          <Link
            to="/admin"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border/70 hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" /> Admin Home
          </Link>
          <Link
            to="/admin-work-queue"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border/70 hover:text-foreground"
          >
            <Sparkles className="size-3.5" /> Work Queue
          </Link>
        </div>
      }
    >
      {loading || !snapshot ? (
        <div className="rounded-2xl border border-border/40 bg-card/40 p-8 text-center text-sm text-muted-foreground">
          <RefreshCw className="mx-auto mb-3 size-5 animate-spin text-accent" />
          Copilot is reviewing the marketplace…
        </div>
      ) : (
        <div className="space-y-6">
          <CopilotBrief showLink={false} />

          <CopilotHealthPanel health={snapshot.health} />

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
                <span className="ml-1.5 tabular-nums text-[11px] opacity-80">({lists[t.id].length})</span>
              </button>
            ))}
          </div>

          {tab === "predictions" && (
            <p className="rounded-xl border border-violet-400/25 bg-violet-400/5 px-3 py-2 text-[11px] text-violet-200">
              Predictions are estimates based on current marketplace data — review before acting.
            </p>
          )}

          {candidates.length > 0 && tab !== "predictions" && <AutoFixBatchBar candidates={candidates} />}

          {items.length === 0 ? (
            <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/5 p-8 text-center">
              <div className="text-sm font-medium text-emerald-300">All clear</div>
              <div className="mt-1 text-xs text-muted-foreground">Nothing to act on in this view right now.</div>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence initial={false}>
                {items.map((insight, idx) => (
                  <CopilotInsightCard
                    key={insight.id}
                    insight={insight}
                    siblings={items}
                    index={idx}
                    onDismiss={dismiss}
                  />
                ))}
              </AnimatePresence>
            </div>
          )}

          <CopilotTimeline />
          <AutoFixActivityLog />
        </div>
      )}
    </AdminShell>
  );
}
