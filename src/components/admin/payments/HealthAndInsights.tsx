import { Activity, AlertTriangle, CheckCircle2, Info, Sparkles, TriangleAlert } from "lucide-react";
import type { HealthBlock, Insight } from "@/lib/payments-center-v3.functions";
import { EmptyState, Panel } from "./ui";

const GRADE_TONE: Record<string, string> = {
  Excellent: "text-emerald-400",
  Good: "text-sky-400",
  Fair: "text-amber-400",
  "At risk": "text-destructive",
};

/** Single composite health score — computed only from metrics that exist. */
export function PaymentHealthCard({ health }: { health: HealthBlock }) {
  const score = health.score;
  const grade = health.grade ?? "";
  const tone = GRADE_TONE[grade] ?? "text-muted-foreground";
  const ring = score == null ? 0 : score;

  return (
    <section className="glass border border-white/10 rounded-2xl p-4">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-4">
        <div className="relative size-20 shrink-0 grid place-items-center">
          <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className="text-white/10" strokeWidth="2.5" />
            <circle
              cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"
              className={tone} strokeDasharray={`${ring} 100`}
            />
          </svg>
          <div className="text-center">
            <p className="text-lg font-semibold tabular-nums leading-none">{score == null ? "—" : score}</p>
            <p className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground">/100</p>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground flex items-center gap-1.5">
            <Activity className="size-3 text-accent" /> Payment health
          </p>
          <p className={`mt-1 text-base font-semibold ${tone}`}>{score == null ? "Not enough data" : grade}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {score == null
              ? "A score appears once payment attempts are recorded."
              : `Weighted from ${health.factors.filter((f) => f.score != null && f.weight > 0).length} live metric(s).`}
          </p>
        </div>
      </div>

      <ul className="mt-3 grid sm:grid-cols-2 gap-1.5">
        {health.factors.map((f) => (
          <li key={f.key} className="rounded-xl border border-white/10 bg-white/[0.02] px-2.5 py-2 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] truncate">{f.label}</span>
              <span className={`font-mono text-[11px] shrink-0 ${f.score == null ? "text-muted-foreground" : ""}`}>
                {f.score == null ? "No data" : Math.round(f.score)}
              </span>
            </div>
            <p className="text-[9px] text-muted-foreground truncate">{f.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

const TONE_ICON = {
  good: { Icon: CheckCircle2, cls: "text-emerald-400" },
  info: { Icon: Info, cls: "text-sky-400" },
  warn: { Icon: TriangleAlert, cls: "text-amber-400" },
  bad: { Icon: AlertTriangle, cls: "text-destructive" },
} as const;

/** Insights derived from real aggregates. Unavailable insights are simply absent. */
export function SmartInsights({ insights }: { insights: Insight[] }) {
  return (
    <Panel title="Smart insights" hint="Derived from your recorded payment data">
      {insights.length ? (
        <ul className="space-y-2">
          {insights.map((i) => {
            const { Icon, cls } = TONE_ICON[i.tone];
            return (
              <li key={i.id} className="flex items-start gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-2.5">
                <Icon className={`size-3.5 mt-0.5 shrink-0 ${cls}`} />
                <div className="min-w-0">
                  <p className="text-[12px] leading-snug">{i.title}</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">{i.detail}</p>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyState
          title="No insights available yet."
          hint="Insights appear automatically once enough payments, refunds and gateway activity exist to compare."
        />
      )}
      <p className="mt-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">
        <Sparkles className="size-3 text-accent" /> Insights only describe data already recorded — nothing is predicted or invented.
      </p>
    </Panel>
  );
}
