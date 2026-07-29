/**
 * Revenue opportunity card (Revenue Intelligence Engine v1.0).
 * One recommendation: reason, estimated gain, confidence, one-click action.
 */
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { SmartFixLink } from "@/components/admin/SmartFixLink";
import { money, SEVERITY_LABEL, SEVERITY_TONE, type RevenueOpportunity } from "@/lib/revenue-intelligence/types";
import { cn } from "@/lib/utils";

export function RevenueOpportunityCard({
  opportunity,
  currency,
  siblings,
  index,
  onAccept,
  onDismiss,
}: {
  opportunity: RevenueOpportunity;
  currency: string;
  siblings?: RevenueOpportunity[];
  index?: number;
  onAccept?: (o: RevenueOpportunity) => void;
  onDismiss?: (o: RevenueOpportunity) => void;
}) {
  const o = opportunity;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.18 }}
      className="rounded-2xl border border-border/40 bg-card/40 p-4"
    >
      <div className="flex items-start gap-3">
        {o.subjectImage ? (
          <img
            src={o.subjectImage}
            alt=""
            loading="lazy"
            className="size-11 shrink-0 rounded-lg object-cover"
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", SEVERITY_TONE[o.severity])}>
              {SEVERITY_LABEL[o.severity]}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{o.subject}</span>
          </div>
          <div className="mt-1.5 text-sm font-medium">{o.title}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{o.reason}</p>

          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
            <span className="tabular-nums text-emerald-300">+{money(o.estimatedGain, currency)} / 30 days</span>
            <span className="text-muted-foreground">Confidence {o.confidence}%</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground">Basis: {o.basis}</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <SmartFixLink
              issue={o.issue}
              origin="revenue-intelligence"
              siblings={siblings?.map((s) => s.issue)}
              index={index}
              originState={{ surface: "revenue" }}
              className="text-xs"
            >
              {o.action}
            </SmartFixLink>
            {onAccept ? (
              <button
                onClick={() => onAccept(o)}
                className="rounded-lg border border-emerald-400/30 bg-emerald-400/5 px-2.5 py-1.5 text-[11px] text-emerald-300 transition hover:bg-emerald-400/10"
              >
                Mark as useful
              </button>
            ) : null}
            {onDismiss ? (
              <button
                onClick={() => onDismiss(o)}
                aria-label="Dismiss recommendation"
                className="inline-flex items-center gap-1 rounded-lg border border-border/40 px-2.5 py-1.5 text-[11px] text-muted-foreground transition hover:text-foreground"
              >
                <X className="size-3" /> Dismiss
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
