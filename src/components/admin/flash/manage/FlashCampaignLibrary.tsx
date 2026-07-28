/**
 * v12.0 — Smart campaign library. The existing templates, presented with the
 * information an admin actually needs to choose one. Selecting a template only
 * prefills the existing creation wizard.
 */
import { Sparkles } from "lucide-react";
import { CAMPAIGN_TEMPLATES, type CampaignTemplate } from "@/lib/flash/campaign-templates";

function duration(hours: number) {
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 7 ? "1 week" : `${days} day${days === 1 ? "" : "s"}`;
}

export function FlashCampaignLibrary({ onUse }: { onUse: (t: CampaignTemplate) => void }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {CAMPAIGN_TEMPLATES.map((t) => (
        <li key={t.key} className="flex flex-col rounded-2xl border border-border bg-card p-3.5">
          <div className="flex items-center justify-between gap-2">
            <span className={`rounded-full border px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ${t.accent}`}>
              {t.label}
            </span>
            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              {duration(t.durationHours)}
            </span>
          </div>

          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{t.useCase ?? t.blurb}</p>

          <dl className="mt-3 space-y-1.5 text-[10px]">
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-mono uppercase tracking-widest text-muted-foreground">Categories</dt>
              <dd className="min-w-0 text-foreground/80">{(t.categories ?? ["All categories"]).join(", ")}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="w-20 shrink-0 font-mono uppercase tracking-widest text-muted-foreground">Discount</dt>
              <dd className="text-foreground/80 tabular-nums">
                {t.discountRange ? `${t.discountRange[0]}–${t.discountRange[1]}%` : `${t.discountPct}%`}
              </dd>
            </div>
          </dl>

          <button
            onClick={() => onUse(t)}
            className="mt-3 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-accent/40 px-3 text-[10px] font-mono uppercase tracking-widest text-accent transition hover:bg-accent/10"
          >
            <Sparkles className="size-3.5" /> Use template
          </button>
        </li>
      ))}
    </ul>
  );
}
