/**
 * FoundOurMarket™ Universal AI Auto-Fix (v1.0) — Per-issue action strip.
 *
 * Renders the category chip (Auto Fix / Review Required / Manual Fix), the AI
 * confidence + reasoning + expected impact + risk line, and the right action
 * for that category. Manual and Review keep the existing Smart Navigation
 * deep-link behaviour untouched.
 */
import type { ReactNode } from "react";
import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/products";
import type { AutoFixProposal } from "@/lib/auto-fix/planners";
import { CATEGORY_TONE, type ClassifiedIssue } from "@/lib/auto-fix/classify";
import { AutoFixButton } from "./AutoFixButton";

export function CategoryChip({ classified }: { classified: ClassifiedIssue }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium",
        CATEGORY_TONE[classified.category],
      )}
    >
      {classified.label}
    </span>
  );
}

export function ConfidenceLine({
  classified,
  confidence,
  impact,
}: {
  classified: ClassifiedIssue;
  confidence: number;
  impact: string;
}) {
  return (
    <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
      <span className="text-foreground/70">Confidence:</span> <span className="tabular-nums">{confidence}%</span>
      {" · "}
      <span className="text-foreground/70">Why:</span> {classified.reason}
      {" · "}
      <span className="text-foreground/70">Impact:</span> {impact}
      {" · "}
      <span className="text-foreground/70">Risk:</span> <span className="capitalize">{classified.risk}</span>
    </p>
  );
}

export function IssueActions({
  classified,
  product,
  proposals,
  deepLink,
  onReject,
}: {
  classified: ClassifiedIssue;
  product: Product | null;
  proposals: AutoFixProposal[];
  /** The existing Smart Navigation link — used for Review and Manual. */
  deepLink: ReactNode;
  onReject?: () => void;
}) {
  if (classified.category === "auto" && product && proposals.length) {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <AutoFixButton product={product} proposals={proposals} />
        {deepLink}
      </div>
    );
  }

  if (classified.category === "review") {
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        {deepLink}
        {product && proposals.length ? (
          <AutoFixButton product={product} proposals={proposals} className="border-amber-400/30 bg-amber-400/10 text-amber-300 hover:bg-amber-400/20" />
        ) : null}
        {onReject && (
          <button
            onClick={onReject}
            className="inline-flex items-center gap-1 rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
          >
            Reject
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="hidden items-center gap-1 text-[10px] text-muted-foreground sm:inline-flex">
        <ShieldAlert className="size-3" /> human required
      </span>
      {deepLink}
    </div>
  );
}
