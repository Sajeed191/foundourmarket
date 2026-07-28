/**
 * v11.0 — Decision History. A quiet timeline of what the admin approved,
 * rejected or snoozed, so today's changes are always explainable.
 */
import { History, Check, X, Clock, CheckCheck } from "lucide-react";
import type { Decision } from "@/lib/flash/use-flash-workspace";

const ICON = {
  approved: { icon: Check, cls: "text-emerald-300" },
  rejected: { icon: X, cls: "text-muted-foreground" },
  snoozed: { icon: Clock, cls: "text-sky-300" },
  completed: { icon: CheckCheck, cls: "text-emerald-300" },
} as const;

function when(at: number) {
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export function FlashDecisionHistory({ decisions }: { decisions: Decision[] }) {
  if (decisions.length === 0) {
    return (
      <p className="rounded-2xl border border-border bg-card p-5 text-center text-[12px] text-muted-foreground">
        No decisions recorded yet — approvals you make will appear here.
      </p>
    );
  }

  return (
    <section aria-label="Decision history" className="space-y-2">
      <p className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
        <History className="size-3.5" /> Decision history
      </p>
      <ol className="space-y-1.5">
        {decisions.slice(0, 20).map((d) => {
          const meta = ICON[d.action];
          const Icon = meta.icon;
          return (
            <li key={d.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 rounded-2xl border border-border bg-card p-3">
              <Icon className={`mt-0.5 size-3.5 shrink-0 ${meta.cls}`} />
              <div className="min-w-0">
                <p className="text-[13px] leading-snug">{d.title}</p>
                {d.product && <p className="truncate text-[11px] text-muted-foreground">{d.product}</p>}
                {d.expected && <p className="mt-0.5 text-[11px] text-emerald-300">{d.expected}</p>}
              </div>
              <span className="shrink-0 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{when(d.at)}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
