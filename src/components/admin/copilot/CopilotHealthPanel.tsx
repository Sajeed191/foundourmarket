/**
 * CopilotHealthPanel — one score, eight pillars, trend over time.
 */
import { TrendingDown, TrendingUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CopilotHealth } from "@/lib/copilot/types";

function tone(score: number) {
  if (score >= 90) return "text-emerald-300";
  if (score >= 75) return "text-sky-300";
  if (score >= 55) return "text-amber-300";
  return "text-destructive";
}

function bar(score: number) {
  if (score >= 90) return "bg-emerald-400/70";
  if (score >= 75) return "bg-sky-400/70";
  if (score >= 55) return "bg-amber-400/70";
  return "bg-destructive/70";
}

function TrendIcon({ trend, delta }: { trend: string; delta: number }) {
  if (trend === "improving") return <span className="inline-flex items-center gap-0.5 text-emerald-300"><TrendingUp className="size-3" />+{Math.abs(delta)}</span>;
  if (trend === "declining") return <span className="inline-flex items-center gap-0.5 text-destructive"><TrendingDown className="size-3" />−{Math.abs(delta)}</span>;
  if (trend === "stable") return <span className="inline-flex items-center gap-0.5 text-muted-foreground"><Minus className="size-3" />0</span>;
  return null;
}

export function CopilotHealthPanel({ health }: { health: CopilotHealth }) {
  const history = health.history.slice(-24);
  const max = Math.max(100, ...history.map((h) => h.score));

  return (
    <section className="card-premium rounded-2xl p-5" aria-label="Marketplace health score">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Marketplace health</div>
          <div className={cn("mt-1 text-4xl font-light tabular-nums tracking-tight", tone(health.score))}>
            {health.score}
            <span className="ml-1 text-base text-muted-foreground">/100</span>
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">{health.status}</div>
        </div>

        {history.length > 1 && (
          <div className="ml-auto flex h-12 items-end gap-1" aria-hidden>
            {history.map((h) => (
              <div
                key={h.at}
                className={cn("w-1.5 rounded-sm", bar(h.score))}
                style={{ height: `${Math.max(8, (h.score / max) * 48)}px` }}
                title={`${h.score} · ${new Date(h.at).toLocaleString()}`}
              />
            ))}
          </div>
        )}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {health.pillars.map((p) => (
          <div key={p.id} className="rounded-xl border border-border/40 bg-card/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{p.label}</span>
              <span className="flex items-center gap-2 text-[11px] tabular-nums">
                <TrendIcon trend={p.trend} delta={p.delta} />
                <span className={tone(p.score)}>{p.score}</span>
              </span>
            </div>
            <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted/25">
              <div className={cn("h-full rounded-full", bar(p.score))} style={{ width: `${Math.max(2, p.score)}%` }} />
            </div>
            <div className="mt-1.5 text-[11px] text-muted-foreground">{p.detail}</div>
          </div>
        ))}
      </div>
    </section>
  );
}
