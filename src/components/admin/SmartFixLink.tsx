/**
 * SmartFixLink — Universal Smart Navigation entry point (v1.0).
 *
 * NAVIGATION / UX ONLY. Any admin surface (dashboard, intelligence module,
 * alert, notification, daily brief, future module…) can render this to send the
 * admin straight to the exact page, tab, section and field that resolves the
 * issue — and back again after saving.
 *
 *   <SmartFixLink issue={{ entity: "product", entityId: slug, module: "seo_intelligence" }}>
 *     Fix SEO
 *   </SmartFixLink>
 */
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  rememberIssueQueue,
  rememberOrigin,
  resolveSmartTarget,
  type IssueQueueEntry,
  type SmartIssue,
} from "@/lib/smart-navigation";

export function SmartFixLink({
  issue,
  origin = "admin",
  children,
  className,
  variant = "solid",
  siblings,
  index = 0,
  originState,
}: {
  issue: SmartIssue;
  /** Identifier of the originating screen (used for the return trip). */
  origin?: string;
  children?: ReactNode;
  className?: string;
  variant?: "solid" | "ghost";
  /** All issues on this screen — enables "1 of 4" Previous / Next at the destination. */
  siblings?: SmartIssue[];
  index?: number;
  /** Extra presentation state to restore on return (tab, filters, search). */
  originState?: Record<string, string | number | boolean | null>;
}) {
  const target = resolveSmartTarget(issue, origin);

  const onNavigate = () => {
    rememberOrigin({ ui: originState, productId: issue.entityId ?? undefined });
    if (siblings && siblings.length > 1) {
      const entries: IssueQueueEntry[] = siblings.map((s) => {
        const t = resolveSmartTarget(s, origin);
        return { to: t.to, params: t.params, search: t.search, label: t.label };
      });
      rememberIssueQueue(entries, index);
    }
  };

  return (
    <Link
      to={target.to as "/admin-product/$slug/details"}
      params={target.params as never}
      search={target.search as never}
      onClick={onNavigate}
      title={`Resolve here — ${target.label}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition",
        variant === "solid"
          ? "border border-accent/30 bg-accent/10 text-accent hover:bg-accent/20"
          : "text-accent hover:underline",
        className,
      )}
    >
      {children ?? (
        <>
          <Sparkles className="size-3.5" /> Fix {target.label}
        </>
      )}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

/** Small "AI Recommendation" chip used on destination screens. */
export function SmartRecommendationBanner({
  label,
  originLabel,
  nav,
}: {
  label?: string | null;
  originLabel?: string;
  nav?: { label: string | null; prev: (() => void) | null; next: (() => void) | null };
}) {
  return (
    <div className="flex flex-wrap items-start gap-2.5 rounded-2xl border border-accent/30 bg-accent/[0.07] px-4 py-3">
      <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full border border-accent/40 bg-accent/15 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-accent">
        AI Recommendation
      </span>
      <p className="min-w-0 flex-1 text-xs leading-relaxed text-muted-foreground">
        Resolve this recommendation here{label ? ` — ${label}` : ""}. You&apos;ll return to {originLabel ?? "where you came from"} after saving.
      </p>
      {nav?.label && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span className="tabular-nums">{nav.label}</span>
          <button
            onClick={() => nav.prev?.()}
            disabled={!nav.prev}
            className="rounded-md border border-border/50 px-2 py-0.5 disabled:opacity-40 hover:text-foreground transition"
          >
            Previous
          </button>
          <button
            onClick={() => nav.next?.()}
            disabled={!nav.next}
            className="rounded-md border border-border/50 px-2 py-0.5 disabled:opacity-40 hover:text-foreground transition"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
