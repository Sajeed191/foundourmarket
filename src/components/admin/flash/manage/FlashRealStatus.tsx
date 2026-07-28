/**
 * v13.0 — Flash Deals Status. Replaces the written brief with counted facts.
 * Presentation only: every value is passed in from `flashFacts`, which counts
 * existing database rows. Missing data is stated, never estimated.
 */
import { Database } from "lucide-react";
import type { FlashFacts } from "@/lib/flash/flash-facts";

export function FlashRealStatus({ facts }: { facts: FlashFacts }) {
  return (
    <section
      aria-label="Flash deals status"
      className="rounded-[23px] border border-border bg-card p-5 sm:p-6"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Live from the database</p>
          <h2 className="mt-1 font-display text-lg font-semibold sm:text-xl">Flash deals status</h2>
        </div>
        <span className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-muted-foreground">
          <Database className="size-4" />
        </span>
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        {facts.counts.map((c) => (
          <div key={c.label} className="min-w-0">
            <dt className="truncate text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{c.label}</dt>
            <dd className="mt-0.5 text-xl font-semibold tabular-nums">{c.value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-5 border-t border-white/5 pt-4">
        <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Measured today</p>
        {!facts.hasTodayData && (
          <p className="mt-2 text-sm text-muted-foreground">
            No data available yet — waiting for the first tracked impression, click or order today.
          </p>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          {facts.today.map((f) => (
            <div key={f.label} className="min-w-0">
              <dt className="truncate text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{f.label}</dt>
              <dd
                className={`mt-0.5 truncate text-lg font-semibold tabular-nums ${f.value == null ? "text-muted-foreground" : ""}`}
                title={f.source}
              >
                {f.value ?? "No data yet"}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
