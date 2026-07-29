/**
 * Revenue learning memory (Revenue Intelligence Engine v1.0).
 *
 * Local, per-admin feedback loop: accepted signals gain priority, dismissed
 * signals lose it. Stored in localStorage only — no schema, no server writes,
 * no effect on customer-facing behaviour.
 */
import type { RevenueOpportunity, RevenueSignalId } from "./types";

const KEY = "fom.revenue.learning.v1";

type Memory = Partial<Record<RevenueSignalId | string, { accepted: number; dismissed: number }>>;

function read(): Memory {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Memory;
  } catch {
    return {};
  }
}

function write(m: Memory) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(m));
  } catch {
    /* storage unavailable — learning is best-effort */
  }
}

export function recordFeedback(signal: string, outcome: "accepted" | "dismissed") {
  const m = read();
  const row = m[signal] ?? { accepted: 0, dismissed: 0 };
  row[outcome] += 1;
  m[signal] = row;
  write(m);
}

/** Multiplier in the 0.5–1.5 range derived from past admin decisions. */
export function signalWeight(signal: string): number {
  const row = read()[signal];
  if (!row) return 1;
  const total = row.accepted + row.dismissed;
  if (total < 2) return 1;
  const ratio = row.accepted / total;
  return Math.max(0.5, Math.min(1.5, 0.5 + ratio));
}

/** Re-rank opportunities using learned weights, keeping estimates untouched. */
export function applyLearning(items: RevenueOpportunity[]): RevenueOpportunity[] {
  return [...items]
    .map((o) => ({ ...o, priority: o.priority * signalWeight(o.signal) }))
    .sort((a, b) => b.priority - a.priority);
}

export function dismissedIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    return new Set(JSON.parse(window.localStorage.getItem(`${KEY}.hidden`) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

export function dismiss(id: string) {
  if (typeof window === "undefined") return;
  const next = dismissedIds();
  next.add(id);
  try {
    window.localStorage.setItem(`${KEY}.hidden`, JSON.stringify([...next]));
  } catch {
    /* ignore */
  }
}

export function clearDismissed() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(`${KEY}.hidden`);
  } catch {
    /* ignore */
  }
}
