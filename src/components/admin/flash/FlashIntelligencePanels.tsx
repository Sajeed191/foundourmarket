/**
 * Homepage Quality Dashboard + AI Deal Assistant + Conflict Intelligence.
 * Every card is recommendation-first: nothing changes until an admin taps a fix.
 */
import { useState } from "react";
import {
  Activity, AlertTriangle, ChevronDown, Crown, Info, Lightbulb, ShieldCheck, Sparkles,
} from "lucide-react";
import type { HealthTone } from "@/lib/flash/flash-health";
import type { AssistantInsight, Conflict, HeroSuggestion, HomepageQuality } from "@/lib/flash/flash-intelligence";

const TONE_TEXT: Record<HealthTone, string> = {
  green: "text-emerald-300", blue: "text-sky-300", amber: "text-amber-300", red: "text-destructive",
};
const TONE_CHIP: Record<HealthTone, string> = {
  green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  blue: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  red: "border-destructive/30 bg-destructive/10 text-destructive",
};
const TONE_DOT: Record<HealthTone, string> = { green: "🟢", blue: "🔵", amber: "🟡", red: "🔴" };

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-2.5">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold tabular-nums mt-0.5">{value}</p>
    </div>
  );
}

export function FlashHomepageHealth({ quality }: { quality: HomepageQuality }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label="Homepage quality">
      <div className="flex items-start gap-3">
        <div className="shrink-0 grid place-items-center size-16 rounded-2xl border border-border bg-background/50">
          <span className={`text-xl font-display font-semibold tabular-nums ${TONE_TEXT[quality.tone]}`}>{quality.score}</span>
          <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">/100</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground">
            <Activity className="size-3.5 text-accent" /> Homepage quality
          </p>
          <p className="mt-1 text-sm">{TONE_DOT[quality.tone]} {quality.summary}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-2">
        <Stat label="Active deals" value={String(quality.activeCount)} />
        <Stat label="Avg discount" value={`${quality.avgDiscount.toFixed(0)}%`} />
        <Stat label="Avg flash score" value={quality.avgFlashScore.toFixed(0)} />
        <Stat label="Category mix" value={`${Math.round(quality.categoryDiversity * 100)}%`} />
        <Stat label="Brand mix" value={`${Math.round(quality.brandDiversity * 100)}%`} />
        <Stat label="Stock health" value={`${Math.round(quality.stockHealth * 100)}%`} />
        <Stat label="Ending today" value={String(quality.endingToday)} />
        <Stat label="Expiring in 3d" value={String(quality.upcomingExpirations)} />
        <Stat label="Freshness" value={`${Math.round(quality.freshness * 100)}%`} />
        <Stat label="Duplicate guard" value={quality.duplicatesPrevented ? "On" : "Off"} />
      </div>
    </section>
  );
}

export function FlashAssistant({ insights, onOpen }: {
  insights: AssistantInsight[];
  onOpen: (entryKey: string) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label="AI deal assistant">
      <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
        <Sparkles className="size-3.5 text-accent" /> Deal assistant
      </p>
      <ul className="space-y-2">
        {insights.map((i) => (
          <li key={i.id} className="rounded-xl border border-border bg-background/40 p-3">
            <div className="flex items-start gap-2">
              <span aria-hidden className="text-sm leading-5">{TONE_DOT[i.tone]}</span>
              <p className="flex-1 text-sm">{i.message}</p>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                onClick={() => setOpen(open === i.id ? null : i.id)}
                aria-expanded={open === i.id}
                className="inline-flex items-center gap-1 rounded-full border border-white/10 px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
                Why? <ChevronDown className={`size-3 transition-transform ${open === i.id ? "rotate-180" : ""}`} />
              </button>
              {i.entryKey && (
                <button onClick={() => onOpen(i.entryKey!)}
                  className="rounded-full border border-accent/40 text-accent px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-accent/10">
                  Review deal
                </button>
              )}
            </div>
            {open === i.id && (
              <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
                {i.why.map((w) => <li key={w}>• {w}</li>)}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function FlashHeroOptimizer({ hero, onReview }: { hero: HeroSuggestion; onReview: (key: string) => void }) {
  const [why, setWhy] = useState(false);
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label="Hero optimizer">
      <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
        <Crown className="size-3.5 text-accent" /> Hero optimizer
      </p>
      <div className="grid sm:grid-cols-2 gap-2">
        <div className="rounded-xl border border-border bg-background/40 p-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Current hero</p>
          <p className="text-sm mt-1 truncate">{hero.current?.product.name ?? "None"}</p>
        </div>
        <div className={`rounded-xl border p-3 ${hero.shouldReplace ? "border-accent/40 bg-accent/[0.06]" : "border-border bg-background/40"}`}>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Recommended hero</p>
          <p className="text-sm mt-1 truncate">{hero.suggested?.product.name ?? "None"}</p>
        </div>
      </div>
      <p className="mt-2 text-sm">
        {hero.shouldReplace
          ? "🟡 A stronger hero is available — raise its priority to feature it."
          : "🟢 The current hero is the strongest available choice."}
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <button onClick={() => setWhy((w) => !w)} aria-expanded={why}
          className="rounded-full border border-white/10 px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-white/5">
          Why?
        </button>
        {hero.suggested && (
          <button onClick={() => onReview(hero.suggested!.key)}
            className="rounded-full border border-accent/40 text-accent px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-accent/10">
            Review recommended
          </button>
        )}
      </div>
      {why && (
        <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
          {hero.reasons.map((r) => <li key={r}>• {r}</li>)}
        </ul>
      )}
    </section>
  );
}

const SEVERITY_ICON = {
  critical: AlertTriangle,
  warning: AlertTriangle,
  info: Info,
} as const;
const SEVERITY_TONE: Record<Conflict["severity"], HealthTone> = { critical: "red", warning: "amber", info: "blue" };

export function FlashConflictCenter({ conflicts, onFix }: {
  conflicts: Conflict[];
  onFix: (c: Conflict) => void;
}) {
  if (conflicts.length === 0) {
    return (
      <section className="rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-4">
        <p className="flex items-center gap-2 text-sm text-emerald-200">
          <ShieldCheck className="size-4" /> No conflicts detected — the homepage is consistent.
        </p>
      </section>
    );
  }
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-label="Conflict intelligence">
      <p className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">
        <Lightbulb className="size-3.5 text-accent" /> Conflicts · {conflicts.length}
      </p>
      <ul className="space-y-2">
        {conflicts.map((c) => {
          const Icon = SEVERITY_ICON[c.severity];
          const tone = SEVERITY_TONE[c.severity];
          return (
            <li key={c.id} className="rounded-xl border border-border bg-background/40 p-3">
              <div className="flex items-start gap-2">
                <Icon className={`size-4 shrink-0 mt-0.5 ${TONE_TEXT[tone]}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm">{c.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{c.detail}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${TONE_CHIP[tone]}`}>
                  {c.severity}
                </span>
              </div>
              {c.fix && (
                <button onClick={() => onFix(c)}
                  className="mt-2 rounded-full border border-accent/40 text-accent px-3 min-h-11 text-[10px] font-mono uppercase tracking-widest hover:bg-accent/10">
                  {c.fixLabel ?? "Fix"}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
