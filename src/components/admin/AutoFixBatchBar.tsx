/**
 * FoundOurMarket™ Universal AI Auto-Fix (v1.0) — Batch Auto Fix.
 *
 * Applies safe fixes across many products sequentially through the existing
 * update mutation, with live progress. No new APIs, no bulk database writes.
 */
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, ShieldCheck } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import type { Product } from "@/lib/products";
import type { AutoFixKind, AutoFixProposal } from "@/lib/auto-fix/planners";
import { useAutoFix } from "@/lib/auto-fix/use-auto-fix";

export type AutoFixCandidate = { product: Product; proposals: AutoFixProposal[] };

type BatchScope = { id: string; label: string; kinds: AutoFixKind[] | null };

const SCOPES: BatchScope[] = [
  { id: "all_low_risk", label: "All low-risk issues", kinds: null },
  { id: "seo", label: "All SEO issues", kinds: ["seo_title", "seo_description"] },
  { id: "titles", label: "All title formatting", kinds: ["title_formatting", "whitespace"] },
  { id: "metadata", label: "All metadata", kinds: ["seo_title", "seo_description", "search_keywords", "units"] },
];

export function AutoFixBatchBar({ candidates }: { candidates: AutoFixCandidate[] }) {
  const [scope, setScope] = useState<BatchScope | null>(null);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const { apply } = useAutoFix();

  const scoped = useMemo<AutoFixCandidate[]>(() => {
    if (!scope) return [];
    return candidates
      .map((c) => ({
        product: c.product,
        proposals: scope.kinds ? c.proposals.filter((p) => scope.kinds!.includes(p.kind)) : c.proposals.filter((p) => p.risk === "low"),
      }))
      .filter((c) => c.proposals.length > 0);
  }, [candidates, scope]);

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of SCOPES) {
      map[s.id] = candidates.reduce(
        (n, c) =>
          n +
          (c.proposals.some((p) => (s.kinds ? s.kinds.includes(p.kind) : p.risk === "low")) ? 1 : 0),
        0,
      );
    }
    return map;
  }, [candidates]);

  const run = async () => {
    setRunning(true);
    setDone(0);
    let ok = 0;
    let failed = 0;
    for (const c of scoped) {
      try {
        await apply(c.product, c.proposals, "Admin (batch)");
        ok += 1;
      } catch {
        failed += 1;
      }
      setDone((d) => d + 1);
    }
    setRunning(false);
    setScope(null);
    toast.success(`Batch Auto Fix complete — ${ok} product${ok === 1 ? "" : "s"} updated${failed ? `, ${failed} failed` : ""}.`, {
      description: "Individual entries remain undoable from the Auto-Fix activity log for 30 seconds.",
    });
  };

  if (!candidates.length) return null;

  return (
    <>
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.05] p-4">
        <div className="flex items-center gap-2 text-xs font-medium text-emerald-300">
          <Sparkles className="size-3.5" /> Batch Auto Fix
          <span className="text-muted-foreground font-normal">
            {candidates.length} product{candidates.length === 1 ? "" : "s"} have safe fixes available
          </span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {SCOPES.map((s) => (
            <button
              key={s.id}
              disabled={!counts[s.id]}
              onClick={() => setScope(s)}
              className="rounded-lg border border-border/40 bg-card/50 px-3 py-1.5 text-[11px] text-muted-foreground transition hover:border-emerald-400/40 hover:text-emerald-300 disabled:opacity-40 disabled:hover:border-border/40 disabled:hover:text-muted-foreground"
            >
              {s.label} <span className="tabular-nums opacity-70">({counts[s.id] ?? 0})</span>
            </button>
          ))}
        </div>
      </div>

      <Dialog open={!!scope} onOpenChange={(v) => !running && !v && setScope(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">{scope?.label}</DialogTitle>
            <DialogDescription className="text-xs">
              {scoped.length} product{scoped.length === 1 ? "" : "s"} will be updated sequentially using the existing product update flow.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-56 space-y-1.5 overflow-y-auto">
            {scoped.slice(0, 40).map((c) => (
              <div key={c.product.slug} className="flex items-center justify-between gap-2 rounded-lg bg-muted/20 px-2.5 py-1.5 text-[11px]">
                <span className="min-w-0 truncate text-foreground/90">{c.product.name}</span>
                <span className="shrink-0 text-muted-foreground">{c.proposals.length} fix{c.proposals.length === 1 ? "" : "es"}</span>
              </div>
            ))}
          </div>

          {running && (
            <div className="space-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/30">
                <div
                  className="h-full rounded-full bg-emerald-400 transition-all"
                  style={{ width: `${scoped.length ? (done / scoped.length) * 100 : 0}%` }}
                />
              </div>
              <div className="text-[11px] tabular-nums text-muted-foreground">
                {done} of {scoped.length} processed…
              </div>
            </div>
          )}

          <div className="flex items-start gap-2 rounded-xl border border-border/30 bg-card/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
            Metadata and formatting only. Prices, stock, images, variants and publication state are never touched.
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              onClick={() => setScope(null)}
              disabled={running}
              className="rounded-lg border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={run}
              disabled={running || !scoped.length}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/15 px-3.5 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/25 disabled:opacity-50"
            >
              {running ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Apply to {scoped.length}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
