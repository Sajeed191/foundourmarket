import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";

export type HealthTone = "excellent" | "good" | "warn" | "bad";

export type HealthCard = {
  id: string;
  label: string;
  status: string;
  tone: HealthTone;
  icon: LucideIcon;
  detail?: string;
  onFix?: () => void;
  fixLabel?: string;
};

const TONE: Record<HealthTone, { text: string; ring: string; dot: string; bg: string }> = {
  excellent: { text: "text-emerald-400", ring: "border-emerald-500/25", dot: "bg-emerald-400", bg: "bg-emerald-500/[0.06]" },
  good: { text: "text-accent", ring: "border-accent/25", dot: "bg-accent", bg: "bg-accent/[0.06]" },
  warn: { text: "text-amber-400", ring: "border-amber-500/25", dot: "bg-amber-400", bg: "bg-amber-500/[0.06]" },
  bad: { text: "text-destructive", ring: "border-destructive/25", dot: "bg-destructive", bg: "bg-destructive/[0.06]" },
};

/**
 * Product Health Dashboard — premium status cards instead of an error list.
 * Pure presentation: everything is derived from the live form state.
 */
export function HealthDashboard({
  score,
  ready,
  cards,
}: {
  score: number;
  ready: boolean;
  cards: HealthCard[];
}) {
  const scoreTone: HealthTone = score >= 90 ? "excellent" : score >= 70 ? "good" : score >= 45 ? "warn" : "bad";
  const st = TONE[scoreTone];

  return (
    <div className="space-y-3">
      <div className={`rounded-2xl border ${st.ring} ${st.bg} px-4 py-3`}>
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
          <div className="min-w-0">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Overall product score</p>
            <p className={`mt-0.5 text-2xl font-bold leading-none ${st.text}`}>{score}%</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider ${
              ready ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"
            }`}
          >
            {ready ? "Marketplace ready" : "Not ready"}
          </span>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <div className={`h-full rounded-full ${st.dot} transition-all duration-500`} style={{ width: `${score}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {cards.map((c) => {
          const t = TONE[c.tone];
          const Icon = c.icon;
          const interactive = !!c.onFix;
          const Tag = (interactive ? "button" : "div") as "button" | "div";
          return (
            <Tag
              key={c.id}
              {...(interactive
                ? { type: "button" as const, onClick: c.onFix, "aria-label": `${c.label}: ${c.status}. ${c.fixLabel ?? "Fix"}` }
                : {})}
              className={`min-h-11 rounded-xl border ${t.ring} ${t.bg} px-3 py-2.5 text-left transition-all ${
                interactive ? "hover:brightness-125 active:scale-[0.98]" : ""
              }`}
            >
              <span className="flex items-center gap-1.5">
                <Icon className={`size-3.5 shrink-0 ${t.text}`} />
                <span className="min-w-0 truncate text-[9px] font-mono uppercase tracking-[0.15em] text-muted-foreground">
                  {c.label}
                </span>
              </span>
              <span className="mt-1 flex items-center gap-1">
                <span className={`min-w-0 truncate text-[13px] font-semibold ${t.text}`}>{c.status}</span>
                {interactive && <ChevronRight className="ml-auto size-3.5 shrink-0 text-muted-foreground" />}
              </span>
              {c.detail && <span className="mt-0.5 block truncate text-[10px] text-muted-foreground">{c.detail}</span>}
            </Tag>
          );
        })}
      </div>
    </div>
  );
}
