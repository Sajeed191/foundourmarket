/**
 * FoundOurMarket™ Universal AI Auto-Fix (v1.0) — Auto Fix button + preview.
 *
 * UX layer only. Shows a preview of the proposed changes, applies them through
 * the existing update mutation, then offers a 30-second Undo.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles, Loader2, ShieldCheck, ArrowRight } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/products";
import type { AutoFixProposal } from "@/lib/auto-fix/planners";
import { useAutoFix } from "@/lib/auto-fix/use-auto-fix";
import type { AutoFixLogEntry } from "@/lib/auto-fix/log";

export function ChangeDiff({ proposals }: { proposals: AutoFixProposal[] }) {
  return (
    <div className="space-y-3">
      {proposals.map((p) => (
        <div key={p.kind} className="rounded-xl border border-border/40 bg-card/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-foreground">{p.title}</span>
            <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-0.5 text-[10px] tabular-nums text-emerald-300">
              {p.confidence}% confidence
            </span>
            <span className="rounded-full border border-border/40 bg-card/60 px-2 py-0.5 text-[10px] capitalize text-muted-foreground">
              {p.risk} risk
            </span>
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
            <span className="text-foreground/70">Why:</span> {p.reason}{" "}
            <span className="text-foreground/70">Impact:</span> {p.impact}
          </p>
          <div className="mt-2 space-y-1.5">
            {p.changes.map((c) => (
              <div key={`${p.kind}-${c.field}`} className="rounded-lg bg-muted/20 p-2 text-[11px]">
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
                <div className="mt-1 flex items-start gap-2">
                  <span className="min-w-0 flex-1 break-words text-muted-foreground line-through/0 opacity-70">{c.before}</span>
                  <ArrowRight className="mt-0.5 size-3 shrink-0 text-accent" />
                  <span className="min-w-0 flex-1 break-words text-foreground">{c.after}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function offerUndo(entry: AutoFixLogEntry, undo: (e: AutoFixLogEntry) => Promise<void>) {
  toast.success(`Auto Fix applied — ${entry.productName}`, {
    duration: 30_000,
    description: `${entry.changes.length} field${entry.changes.length === 1 ? "" : "s"} updated · undo available for 30s`,
    action: {
      label: "Undo",
      onClick: () => {
        undo(entry)
          .then(() => toast.success("Reverted to previous values."))
          .catch((e) => toast.error(e instanceof Error ? e.message : "Undo failed."));
      },
    },
  });
}

export function AutoFixButton({
  product,
  proposals,
  className,
  onApplied,
}: {
  product: Product;
  proposals: AutoFixProposal[];
  className?: string;
  onApplied?: (entry: AutoFixLogEntry) => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { apply, undo } = useAutoFix();

  if (!proposals.length) return null;

  const run = async () => {
    setBusy(true);
    try {
      const entry = await apply(product, proposals);
      setOpen(false);
      offerUndo(entry, undo);
      onApplied?.(entry);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Auto Fix failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/20",
          className,
        )}
      >
        <Sparkles className="size-3.5" /> Auto Fix
        <span className="tabular-nums opacity-70">({proposals.length})</span>
      </button>

      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-emerald-400" /> Preview Auto Fix
            </DialogTitle>
            <DialogDescription className="text-xs">
              {product.name} — review the proposed changes before applying. Nothing is written until you press Apply.
            </DialogDescription>
          </DialogHeader>

          <ChangeDiff proposals={proposals} />

          <div className="flex items-start gap-2 rounded-xl border border-border/30 bg-card/30 p-3 text-[11px] leading-relaxed text-muted-foreground">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-400" />
            Auto Fix only edits metadata and presentation text. Price, stock, images, variants, publication state and compliance fields are never changed automatically.
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              onClick={() => setOpen(false)}
              disabled={busy}
              className="rounded-lg border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={run}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/15 px-3.5 py-1.5 text-xs font-medium text-emerald-300 transition hover:bg-emerald-400/25 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
              Apply {proposals.length} change{proposals.length === 1 ? "" : "s"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
