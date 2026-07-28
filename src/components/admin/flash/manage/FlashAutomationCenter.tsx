/**
 * v13.0 — Automation Center.
 *
 * One card holding every assistant automation preference. These are workspace
 * preferences persisted locally: they decide which recommendations the
 * assistant keeps watching for. No backend job, rotation rule or mutation is
 * changed by toggling them.
 */
import { memo, useCallback, useEffect, useState } from "react";
import { Bot, CircleCheck, PauseCircle } from "lucide-react";

export type AutomationKey =
  | "schedule" | "rotation" | "replace" | "inventory"
  | "conflict" | "suggestions" | "notifications" | "refresh";

const ITEMS: { key: AutomationKey; label: string; hint: string }[] = [
  { key: "schedule", label: "Auto schedule", hint: "Watch for gaps and propose the next window." },
  { key: "rotation", label: "Auto rotation", hint: "Flag products stuck in or out of the homepage rotation." },
  { key: "replace", label: "Auto replace", hint: "Suggest a swap when a deal underperforms." },
  { key: "inventory", label: "Inventory protection", hint: "Warn before a live deal sells out." },
  { key: "conflict", label: "Conflict resolution", hint: "Surface overlapping promotions with a fix." },
  { key: "suggestions", label: "AI suggestions", hint: "Keep suggesting products worth featuring." },
  { key: "notifications", label: "Notifications", hint: "Show alerts for deals ending soon." },
  { key: "refresh", label: "Campaign refresh", hint: "Remind you when a campaign has run too long." },
];

const KEY = "fom.flash.automation.v13";
const DEFAULTS: Record<AutomationKey, boolean> = {
  schedule: true, rotation: true, replace: true, inventory: true,
  conflict: true, suggestions: true, notifications: true, refresh: false,
};

export function useFlashAutomation() {
  const [state, setState] = useState<Record<AutomationKey, boolean>>(DEFAULTS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setState({ ...DEFAULTS, ...(JSON.parse(raw) as Partial<Record<AutomationKey, boolean>>) });
    } catch { /* first run */ }
  }, []);

  const toggle = useCallback((k: AutomationKey) => {
    setState((prev) => {
      const next = { ...prev, [k]: !prev[k] };
      try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked */ }
      return next;
    });
  }, []);

  return { state, toggle };
}

export const FlashAutomationCenter = memo(function FlashAutomationCenter({
  state, onToggle, healthy,
}: {
  state: Record<AutomationKey, boolean>;
  onToggle: (key: AutomationKey) => void;
  /** True when the silent audit found nothing critical. */
  healthy: boolean;
}) {
  const running = ITEMS.filter((i) => state[i.key]).length;

  return (
    <section className="overflow-hidden rounded-[22px] border border-border bg-card">
      <header className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/5 p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent">
          <Bot className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Automation</p>
          <p className="truncate text-sm">{running} of {ITEMS.length} assistants are running</p>
        </div>
        <span
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest ${
            healthy
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
              : "border-orange-500/30 bg-orange-500/10 text-orange-300"
          }`}
        >
          {healthy ? <CircleCheck className="size-3" aria-hidden /> : <PauseCircle className="size-3" aria-hidden />}
          {healthy ? "Healthy" : "Needs review"}
        </span>
      </header>

      <ul className="grid gap-px bg-white/5 sm:grid-cols-2">
        {ITEMS.map((i) => {
          const on = state[i.key];
          return (
            <li key={i.key} className="bg-card">
              <button
                onClick={() => onToggle(i.key)}
                role="switch"
                aria-checked={on}
                className="grid w-full min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 p-3 text-left transition hover:bg-white/[0.03] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{i.label}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{i.hint}</span>
                </span>
                <span
                  aria-hidden
                  className={`relative h-6 w-10 shrink-0 rounded-full border transition-colors duration-200 ${
                    on ? "border-accent/40 bg-accent/25" : "border-white/10 bg-white/5"
                  }`}
                >
                  <span
                    className={`absolute top-1/2 size-4 -translate-y-1/2 rounded-full transition-all duration-200 motion-reduce:transition-none ${
                      on ? "left-[1.25rem] bg-accent" : "left-1 bg-muted-foreground/60"
                    }`}
                  />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
