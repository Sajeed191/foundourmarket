/**
 * Copilot Timeline (v1.0).
 *
 * A local, session-durable record of what the Copilot surfaced, what the admin
 * did about it, and the Auto-Fix activity already tracked elsewhere. Purely a
 * presentation log — the authoritative audit trail remains `admin_activity_logs`.
 */
import { readAutoFixLog } from "@/lib/auto-fix/log";

const KEY = "fom.copilot.timeline.v1";
const MAX = 200;

export type TimelineKind =
  | "recommendation"
  | "auto_fix"
  | "admin_action"
  | "marketplace_event"
  | "flash_change"
  | "improvement";

export type TimelineEntry = {
  id: string;
  at: number;
  kind: TimelineKind;
  title: string;
  detail?: string;
  subject?: string;
};

type Listener = (entries: TimelineEntry[]) => void;
const listeners = new Set<Listener>();

export const TIMELINE_LABEL: Record<TimelineKind, string> = {
  recommendation: "AI recommendation",
  auto_fix: "Auto Fix",
  admin_action: "Admin action",
  marketplace_event: "Marketplace event",
  flash_change: "Flash Deal change",
  improvement: "Improvement",
};

function readOwn(): TimelineEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TimelineEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: TimelineEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    /* ignore quota */
  }
  listeners.forEach((l) => l(entries));
}

export function recordTimeline(entry: Omit<TimelineEntry, "id" | "at"> & { at?: number }) {
  const full: TimelineEntry = {
    ...entry,
    at: entry.at ?? Date.now(),
    id: `${entry.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  };
  write([full, ...readOwn()]);
  return full;
}

/** Copilot entries merged with the existing Auto-Fix activity log. */
export function readTimeline(): TimelineEntry[] {
  const autoFix: TimelineEntry[] = readAutoFixLog().map((e) => ({
    id: `af-${e.id}`,
    at: e.at,
    kind: "auto_fix",
    title: e.undone ? `Auto Fix undone — ${e.kinds.join(", ")}` : `Auto Fix applied — ${e.kinds.join(", ")}`,
    detail: e.changes.map((c) => c.label).join(" · "),
    subject: e.productName,
  }));
  return [...readOwn(), ...autoFix].sort((a, b) => b.at - a.at).slice(0, MAX);
}

export type TimelineRange = "today" | "7d" | "30d";

export function filterTimeline(entries: TimelineEntry[], range: TimelineRange): TimelineEntry[] {
  const now = new Date();
  let from: number;
  if (range === "today") {
    from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  } else {
    from = now.getTime() - (range === "7d" ? 7 : 30) * 24 * 3600_000;
  }
  return entries.filter((e) => e.at >= from);
}

export function subscribeTimeline(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function clearTimeline() {
  write([]);
}
