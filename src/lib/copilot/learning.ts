/**
 * Copilot Learning (v1.0) — prioritisation memory.
 *
 * The Copilot learns from admin decisions: repeatedly accepted signal families
 * gain visibility, repeatedly dismissed ones fade. Learning influences RANKING
 * AND DISPLAY CONFIDENCE ONLY — it never changes business rules, validation,
 * eligibility or any underlying intelligence output.
 */
import type { CopilotSignalId } from "./types";

const KEY = "fom.copilot.learning.v1";

export type SignalStat = { accepted: number; dismissed: number; lastAt: number };
export type LearningMap = Partial<Record<CopilotSignalId, SignalStat>>;

type Listener = (map: LearningMap) => void;
const listeners = new Set<Listener>();

export function readLearning(): LearningMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LearningMap) : {};
  } catch {
    return {};
  }
}

function write(map: LearningMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
  listeners.forEach((l) => l(map));
}

export function recordDecision(signal: CopilotSignalId, decision: "accepted" | "dismissed") {
  const map = readLearning();
  const stat = map[signal] ?? { accepted: 0, dismissed: 0, lastAt: 0 };
  write({
    ...map,
    [signal]: {
      accepted: stat.accepted + (decision === "accepted" ? 1 : 0),
      dismissed: stat.dismissed + (decision === "dismissed" ? 1 : 0),
      lastAt: Date.now(),
    },
  });
}

/**
 * Ranking multiplier for a signal family, in the range 0.55 … 1.45.
 * Neutral (1.0) until the admin has made at least two decisions.
 */
export function signalWeight(signal: CopilotSignalId, map: LearningMap = readLearning()): number {
  const stat = map[signal];
  if (!stat) return 1;
  const total = stat.accepted + stat.dismissed;
  if (total < 2) return 1;
  const ratio = stat.accepted / total; // 0..1
  return Math.round((0.55 + ratio * 0.9) * 100) / 100;
}

/** Display-confidence nudge (±8 points max) derived from the same history. */
export function confidenceAdjustment(signal: CopilotSignalId, map: LearningMap = readLearning()): number {
  const stat = map[signal];
  if (!stat) return 0;
  const total = stat.accepted + stat.dismissed;
  if (total < 3) return 0;
  const ratio = stat.accepted / total;
  return Math.round((ratio - 0.5) * 16);
}

export function learningNote(signal: CopilotSignalId, map: LearningMap = readLearning()): string | null {
  const stat = map[signal];
  if (!stat) return null;
  const total = stat.accepted + stat.dismissed;
  if (total < 2) return null;
  if (stat.accepted > stat.dismissed) return `You usually act on these (${stat.accepted}/${total}) — ranked higher.`;
  if (stat.dismissed > stat.accepted) return `You usually skip these (${stat.dismissed}/${total}) — ranked lower.`;
  return null;
}

export function subscribeLearning(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function resetLearning() {
  write({});
}
