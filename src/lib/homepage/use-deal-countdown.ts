/**
 * Live Flash Deal countdown — presentation only.
 *
 * Reads the real `end_at` timestamp already supplied by useFlashDeals; never
 * invents or extends a deadline. Ticks once per second and stops at zero. When
 * a deal expires the countdown simply stops — removing the product remains the
 * responsibility of the existing backend/eligibility refresh.
 */

import { useEffect, useState } from "react";

export type CountdownUrgency = "normal" | "last-hour" | "final" | "expired";

export type Countdown = {
  /** Preformatted label, e.g. "2d 04h 18m", "23h 18m 42s", "42m 18s", "38s". */
  label: string;
  msLeft: number;
  urgency: CountdownUrgency;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.floor(msLeft / 1000));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;

  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}

function urgencyOf(msLeft: number): CountdownUrgency {
  if (msLeft <= 0) return "expired";
  if (msLeft <= 10 * 60 * 1000) return "final";
  if (msLeft <= 60 * 60 * 1000) return "last-hour";
  return "normal";
}

/** Returns null when there is no real end timestamp to count down to. */
export function useDealCountdown(endAt: string | null | undefined): Countdown | null {
  const end = endAt ? new Date(endAt).getTime() : NaN;
  const valid = Number.isFinite(end);

  const [msLeft, setMsLeft] = useState(() => (valid ? Math.max(0, end - Date.now()) : 0));

  useEffect(() => {
    if (!valid) return;
    setMsLeft(Math.max(0, end - Date.now()));
    if (end - Date.now() <= 0) return;
    const id = window.setInterval(() => {
      const next = Math.max(0, end - Date.now());
      setMsLeft(next);
      if (next <= 0) window.clearInterval(id);
    }, 1000);
    return () => window.clearInterval(id);
  }, [end, valid]);

  if (!valid) return null;
  return { label: formatCountdown(msLeft), msLeft, urgency: urgencyOf(msLeft) };
}
