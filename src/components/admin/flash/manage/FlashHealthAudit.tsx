/**
 * v11.0 — Automatic Health Check. Runs silently on load and only appears when
 * something is actually wrong. Read-only: it points the admin at the section
 * that needs work rather than changing anything.
 */
import { ShieldCheck, AlertTriangle, AlertOctagon, Info } from "lucide-react";
import type { AuditIssue } from "@/lib/flash/flash-assistant";

const STYLE: Record<AuditIssue["severity"], { icon: typeof Info; cls: string }> = {
  critical: { icon: AlertOctagon, cls: "border-destructive/25 bg-destructive/[0.07] text-destructive" },
  warning: { icon: AlertTriangle, cls: "border-amber-500/25 bg-amber-500/[0.06] text-amber-200" },
  info: { icon: Info, cls: "border-white/10 bg-white/[0.03] text-muted-foreground" },
};

export function FlashHealthAudit({ issues, onJump }: { issues: AuditIssue[]; onJump: (issue: AuditIssue) => void }) {
  if (issues.length === 0) {
    return (
      <p className="inline-flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2 text-[11px] text-emerald-200">
        <ShieldCheck className="size-3.5" /> Health check passed — no issues found.
      </p>
    );
  }

  return (
    <section aria-label="Automatic health check" className="space-y-2">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
        Health check · {issues.length} finding{issues.length === 1 ? "" : "s"}
      </p>
      <ul className="space-y-1.5">
        {issues.slice(0, 6).map((i) => {
          const s = STYLE[i.severity];
          const Icon = s.icon;
          return (
            <li key={i.id}>
              <button
                onClick={() => onJump(i)}
                className={`grid w-full grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 rounded-2xl border p-3 text-left transition hover:brightness-110 ${s.cls}`}
              >
                <Icon className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium leading-snug text-foreground">{i.title}</span>
                  <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{i.detail}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
