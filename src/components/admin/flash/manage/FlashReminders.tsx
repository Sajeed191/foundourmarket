/**
 * v11.0 — Smart Reminders. Time-aware nudges derived from live deal state.
 * Each reminder can be completed or snoozed; state lives in local workspace
 * preferences only.
 */
import { BellRing, Check, Clock } from "lucide-react";
import type { Reminder } from "@/lib/flash/flash-assistant";

export function FlashReminders({
  reminders, states, onDone, onSnooze,
}: {
  reminders: Reminder[];
  states: Record<string, string | number>;
  onDone: (r: Reminder) => void;
  onSnooze: (r: Reminder) => void;
}) {
  const visible = reminders.filter((r) => {
    const s = states[r.id];
    if (s === "done" || s === "dismissed") return false;
    if (typeof s === "number" && s > Date.now()) return false;
    return true;
  });
  if (visible.length === 0) return null;

  const btn =
    "inline-flex min-h-11 items-center gap-1.5 rounded-full border border-white/10 px-3 text-[10px] font-mono uppercase tracking-widest text-muted-foreground transition hover:bg-white/5";

  return (
    <section aria-label="Smart reminders" className="space-y-2">
      <p className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
        <BellRing className="size-3.5" /> Reminders
      </p>
      <ul className="space-y-1.5">
        {visible.map((r) => (
          <li key={r.id} className="rounded-2xl border border-border bg-card p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                {r.due}
              </span>
              <p className="text-[13px] font-medium">{r.title}</p>
            </div>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{r.detail}</p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <button onClick={() => onDone(r)} className={btn}><Check className="size-3" /> Done</button>
              <button onClick={() => onSnooze(r)} className={btn}><Clock className="size-3" /> Snooze</button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
