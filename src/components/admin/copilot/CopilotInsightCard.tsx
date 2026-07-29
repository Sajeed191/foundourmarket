/**
 * CopilotInsightCard — one insight, one action.
 *
 * Follows the platform AI UX rule: plain language, a single prioritised
 * recommendation, progressive disclosure, one click to resolve. All navigation
 * flows through Universal Smart Navigation; safe fixes flow through the
 * existing Universal AI Auto-Fix system.
 */
import { motion } from "framer-motion";
import { Clock, Sparkles, X, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartFixLink } from "@/components/admin/SmartFixLink";
import { recordDecision, learningNote } from "@/lib/copilot/learning";
import { recordTimeline } from "@/lib/copilot/timeline";
import { SEVERITY_LABEL, SEVERITY_TONE, type CopilotInsight } from "@/lib/copilot/types";

export function CopilotInsightCard({
  insight,
  siblings,
  index = 0,
  onDismiss,
  compact,
}: {
  insight: CopilotInsight;
  siblings?: CopilotInsight[];
  index?: number;
  onDismiss?: (id: string) => void;
  compact?: boolean;
}) {
  const note = learningNote(insight.signal);

  const accept = () => {
    recordDecision(insight.signal, "accepted");
    recordTimeline({
      kind: "recommendation",
      title: `Accepted — ${insight.title}`,
      detail: insight.action,
      subject: insight.subject,
    });
  };

  const dismiss = () => {
    recordDecision(insight.signal, "dismissed");
    recordTimeline({
      kind: "admin_action",
      title: `Dismissed — ${insight.title}`,
      subject: insight.subject,
    });
    onDismiss?.(insight.id);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.22, delay: Math.min(index * 0.015, 0.18) }}
      className="group rounded-2xl border border-border/40 bg-card/40 p-4 transition hover:border-border/70 hover:bg-card/60"
    >
      <div className="flex items-start gap-3">
        {insight.subjectImage ? (
          <img
            src={insight.subjectImage}
            alt=""
            loading="lazy"
            className="size-11 shrink-0 rounded-lg border border-border/40 object-cover"
          />
        ) : (
          <div className="grid size-11 shrink-0 place-items-center rounded-lg border border-border/40 bg-muted/20">
            <Sparkles className="size-4 text-accent" />
          </div>
        )}

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide", SEVERITY_TONE[insight.severity])}>
              {SEVERITY_LABEL[insight.severity]}
            </span>
            {insight.estimate && (
              <span className="rounded-full border border-violet-400/40 bg-violet-400/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-violet-300">
                Estimate
              </span>
            )}
            <span className="truncate text-[11px] text-muted-foreground">{insight.subject}</span>
          </div>

          <div className="mt-1.5 text-sm font-medium">{insight.title}</div>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{insight.reason}</p>

          {!compact && (
            <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground/90">
              <TrendingUp className="mt-0.5 size-3 shrink-0 text-accent" />
              {insight.impact}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            <span className="tabular-nums">{insight.confidence}% confidence</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" /> ≈ {insight.minutes}m to resolve
            </span>
            {note && <span className="text-accent/80">{note}</span>}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span onClick={accept}>
              <SmartFixLink
                issue={insight.issue}
                origin="admin-copilot"
                siblings={siblings?.map((s) => s.issue)}
                index={index}
              >
                {insight.action}
              </SmartFixLink>
            </span>
            {onDismiss && (
              <button
                onClick={dismiss}
                className="inline-flex items-center gap-1 rounded-lg border border-border/40 bg-card/40 px-2.5 py-1.5 text-[11px] text-muted-foreground transition hover:border-border/70 hover:text-foreground"
              >
                <X className="size-3" /> Not now
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
