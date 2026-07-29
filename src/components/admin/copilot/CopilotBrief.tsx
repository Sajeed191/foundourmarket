/**
 * CopilotBrief — the "Good morning" daily brief.
 *
 * One glance: marketplace status, today's priorities, one primary action.
 */
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { SmartFixLink } from "@/components/admin/SmartFixLink";
import { useCopilot } from "@/lib/copilot/use-copilot";

const STATUS_TONE: Record<string, string> = {
  Healthy: "border-emerald-400/30 text-emerald-300",
  Good: "border-sky-400/30 text-sky-300",
  "Needs attention": "border-amber-400/30 text-amber-300",
  Critical: "border-destructive/40 text-destructive",
};

export function CopilotBrief({ showLink = true }: { showLink?: boolean }) {
  const { snapshot, loading } = useCopilot();

  if (loading || !snapshot) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card/40 p-5 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-accent" /> Copilot is reviewing the marketplace…
      </div>
    );
  }

  const { brief, health } = snapshot;

  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-premium rounded-2xl p-5"
      aria-label="Marketplace Operations Copilot daily brief"
    >
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-accent">
          <Sun className="size-3.5" /> Copilot
        </div>
        <span className={cn("rounded-full border px-2.5 py-0.5 text-[11px]", STATUS_TONE[health.status] ?? "")}>
          {brief.statusLine}
        </span>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">Health {health.score}/100</span>
      </div>

      <h2 className="mt-3 text-xl font-medium tracking-tight">{brief.greeting}</h2>

      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {brief.priorities.map((p) => (
          <li key={p} className="flex items-start gap-2 text-xs text-muted-foreground">
            <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent/70" />
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {brief.primary ? (
          <SmartFixLink issue={brief.primary.issue} origin="admin-copilot-brief">
            {brief.primary.action}
          </SmartFixLink>
        ) : (
          <span className="text-xs text-muted-foreground">Nothing needs your attention right now.</span>
        )}
        {showLink && (
          <Link
            to="/admin-copilot"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border/40 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border/70 hover:text-foreground"
          >
            Open Copilot <ArrowRight className="size-3.5" />
          </Link>
        )}
      </div>

      {brief.primary && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Why: {brief.primary.reason}
        </p>
      )}
    </motion.section>
  );
}
