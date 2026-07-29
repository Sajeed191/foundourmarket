/**
 * FoundOurMarket™ Universal AI Auto-Fix (v1.0) — Activity log.
 *
 * Local audit trail for auto-applied fixes. Purely additive: the authoritative
 * server-side audit already happens inside the existing update mutation
 * (`admin_activity_logs`). This log powers the in-session UI (what changed,
 * old → new, confidence, undo availability).
 */
import type { AutoFixablePatch, FieldChange } from "./planners";

const KEY = "fom.autofix.log.v1";
const MAX = 100;
/** Undo stays available for 30 seconds after an Auto Fix is applied. */
export const UNDO_WINDOW_MS = 30_000;

export type AutoFixLogEntry = {
  id: string;
  productSlug: string;
  productName: string;
  kinds: string[];
  changes: FieldChange[];
  /** Values captured before the fix — used to restore via the same mutation. */
  previous: AutoFixablePatch;
  confidence: number;
  at: number;
  actor: string;
  undone: boolean;
};

type Listener = (entries: AutoFixLogEntry[]) => void;
const listeners = new Set<Listener>();

export function readAutoFixLog(): AutoFixLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AutoFixLogEntry[]) : [];
  } catch {
    return [];
  }
}

function write(entries: AutoFixLogEntry[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, MAX)));
  } catch {
    /* ignore quota */
  }
  listeners.forEach((l) => l(entries));
}

export function recordAutoFix(entry: Omit<AutoFixLogEntry, "id" | "at" | "undone">): AutoFixLogEntry {
  const full: AutoFixLogEntry = {
    ...entry,
    id: `${entry.productSlug}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: Date.now(),
    undone: false,
  };
  write([full, ...readAutoFixLog()]);
  return full;
}

export function markUndone(id: string) {
  write(readAutoFixLog().map((e) => (e.id === id ? { ...e, undone: true } : e)));
}

export function canUndo(entry: AutoFixLogEntry): boolean {
  return !entry.undone && Date.now() - entry.at < UNDO_WINDOW_MS;
}

export function subscribeAutoFixLog(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
