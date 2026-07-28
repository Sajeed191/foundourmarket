/**
 * Flash Deals v11.0 — local workspace state (presentation only).
 *
 * Mode, focus, brief dismissal, task snoozes, reminder states, decision
 * history and team notes are stored in localStorage. No backend, schema or
 * RLS involvement: these are UI preferences that ride alongside the existing
 * flash deal engine.
 */
import { useCallback, useEffect, useState } from "react";
import type { WorkspaceMode } from "@/lib/flash/flash-assistant";

const KEY = "fom.flash.workspace.v11";

export type Decision = {
  id: string;
  at: number;
  action: "approved" | "rejected" | "snoozed" | "completed";
  title: string;
  product: string | null;
  /** Presentation-only projection captured at approval time. */
  expected: string | null;
};

export type TeamNote = {
  id: string;
  at: number;
  text: string;
  /** Optional deal key the note is pinned to. */
  entryKey: string | null;
};

type Persisted = {
  mode: WorkspaceMode;
  focus: boolean;
  /** yyyy-mm-dd the daily brief was dismissed for. */
  briefDismissedOn: string | null;
  /** task id → epoch ms until which it stays hidden. */
  snoozed: Record<string, number>;
  ignored: string[];
  /** reminder id → "done" | epoch ms snooze | "dismissed". */
  reminders: Record<string, string | number>;
  decisions: Decision[];
  notes: TeamNote[];
};

const EMPTY: Persisted = {
  mode: "operations",
  focus: false,
  briefDismissedOn: null,
  snoozed: {},
  ignored: [],
  reminders: {},
  decisions: [],
  notes: [],
};

function read(): Persisted {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    return { ...EMPTY, ...(JSON.parse(raw) as Partial<Persisted>) };
  } catch {
    return EMPTY;
  }
}

export function todayKey(now = Date.now()) {
  return new Date(now).toISOString().slice(0, 10);
}

export function useFlashWorkspace() {
  const [state, setState] = useState<Persisted>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setState(read());
    setHydrated(true);
  }, []);

  const patch = useCallback((next: Partial<Persisted> | ((p: Persisted) => Partial<Persisted>)) => {
    setState((prev) => {
      const merged = { ...prev, ...(typeof next === "function" ? next(prev) : next) };
      try {
        window.localStorage.setItem(KEY, JSON.stringify(merged));
      } catch {
        /* storage full or blocked — presentation state only */
      }
      return merged;
    });
  }, []);

  const setMode = useCallback((mode: WorkspaceMode) => patch({ mode, focus: false }), [patch]);
  const toggleFocus = useCallback(() => patch((p) => ({ focus: !p.focus })), [patch]);

  const dismissBriefToday = useCallback(() => patch({ briefDismissedOn: todayKey() }), [patch]);

  const snoozeTask = useCallback(
    (id: string, hours = 4) => patch((p) => ({ snoozed: { ...p.snoozed, [id]: Date.now() + hours * 3600_000 } })),
    [patch],
  );
  const ignoreTask = useCallback(
    (id: string) => patch((p) => ({ ignored: [...new Set([...p.ignored, id])] })),
    [patch],
  );

  const setReminder = useCallback(
    (id: string, value: string | number) => patch((p) => ({ reminders: { ...p.reminders, [id]: value } })),
    [patch],
  );

  const logDecision = useCallback(
    (d: Omit<Decision, "id" | "at">) =>
      patch((p) => ({
        decisions: [{ ...d, id: `${Date.now()}:${Math.random().toString(36).slice(2, 7)}`, at: Date.now() }, ...p.decisions].slice(0, 60),
      })),
    [patch],
  );

  const addNote = useCallback(
    (text: string, entryKey: string | null = null) =>
      patch((p) => ({
        notes: [{ id: `${Date.now()}`, at: Date.now(), text, entryKey }, ...p.notes].slice(0, 40),
      })),
    [patch],
  );
  const removeNote = useCallback(
    (id: string) => patch((p) => ({ notes: p.notes.filter((n) => n.id !== id) })),
    [patch],
  );

  /** Task ids currently hidden (ignored forever, or snoozed and still inside the window). */
  const hiddenTaskIds = new Set<string>([
    ...state.ignored,
    ...Object.entries(state.snoozed).filter(([, until]) => until > Date.now()).map(([id]) => id),
  ]);

  return {
    ...state,
    hydrated,
    hiddenTaskIds,
    briefVisible: hydrated && state.briefDismissedOn !== todayKey(),
    setMode,
    toggleFocus,
    dismissBriefToday,
    snoozeTask,
    ignoreTask,
    setReminder,
    logDecision,
    addNote,
    removeNote,
  };
}
