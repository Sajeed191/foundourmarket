/**
 * Flash Deal Intelligence panel (Revenue Intelligence Engine v1.0).
 * Advisory only — every recommendation requires admin approval.
 */
import { SmartFixLink } from "@/components/admin/SmartFixLink";
import { money, type FlashRecommendation } from "@/lib/revenue-intelligence/types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<FlashRecommendation["kind"], { label: string; tone: string }> = {
  should_start: { label: "Start", tone: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" },
  should_end: { label: "End", tone: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
  priority_placement: { label: "Priority", tone: "border-accent/40 bg-accent/10 text-accent" },
  underperforming: { label: "Underperforming", tone: "border-amber-400/30 bg-amber-400/10 text-amber-300" },
  best_performing: { label: "Best performing", tone: "border-sky-400/30 bg-sky-400/10 text-sky-300" },
};

export function FlashIntelligencePanel({
  items,
  currency,
}: {
  items: FlashRecommendation[];
  currency: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-2xl border border-border/40 bg-card/40 p-6 text-center text-xs text-muted-foreground">
        No Flash Deal recommendations right now.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {items.map((f) => {
        const meta = KIND_LABEL[f.kind];
        return (
          <div key={f.id} className="rounded-2xl border border-border/40 bg-card/40 p-4">
            <div className="flex items-start gap-3">
              {f.subjectImage ? (
                <img src={f.subjectImage} alt="" loading="lazy" className="size-11 shrink-0 rounded-lg object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-full border px-2 py-0.5 text-[10px] font-medium", meta.tone)}>
                    {meta.label}
                  </span>
                  <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">{f.subject}</span>
                </div>
                <div className="mt-1.5 text-sm font-medium">{f.title}</div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{f.reason}</p>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
                  <span className={cn("tabular-nums", f.estimatedImpact >= 0 ? "text-emerald-300" : "text-rose-300")}>
                    {f.estimatedImpact >= 0 ? "+" : ""}
                    {money(f.estimatedImpact, currency)} impact
                  </span>
                  <span className="tabular-nums">Forecast {money(f.revenueForecast, currency)} / 30 days</span>
                  {f.selloutProbability != null ? (
                    <span className="tabular-nums">Sell-out {f.selloutProbability}%</span>
                  ) : null}
                  <span>Confidence {f.confidence}%</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <SmartFixLink issue={f.issue} origin="revenue-intelligence" className="text-xs">
                    Review in Flash Deals
                  </SmartFixLink>
                  <span className="text-[10px] text-muted-foreground">Requires admin approval</span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
