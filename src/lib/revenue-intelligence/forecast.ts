/**
 * Revenue Forecast (Revenue Intelligence Engine v1.0).
 *
 * Transparent arithmetic over the Executive Analytics daily series. No model
 * training, no external service, no stored predictions — every number is
 * recomputed from real orders and labelled as an estimate.
 */
import type { RevenueForecast } from "./types";

export type DailyPoint = { date: string; revenue: number; orders: number };

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Day-of-week demand index vs. the trailing average (1.0 = a typical day). */
export function seasonalIndex(daily: DailyPoint[], when = new Date()): { index: number; note: string } {
  const usable = daily.filter((d) => Number.isFinite(d.revenue));
  if (usable.length < 14) {
    return { index: 1, note: "Not enough history yet for a day-of-week pattern." };
  }
  const avg = usable.reduce((s, d) => s + d.revenue, 0) / usable.length;
  if (avg <= 0) return { index: 1, note: "No revenue recorded in the trailing window." };

  const dow = when.getDay();
  const sameDay = usable.filter((d) => new Date(d.date).getDay() === dow);
  if (sameDay.length < 2) return { index: 1, note: "Not enough same-weekday history yet." };

  const dayAvg = sameDay.reduce((s, d) => s + d.revenue, 0) / sameDay.length;
  const index = Math.max(0.4, Math.min(2.2, dayAvg / avg));
  const delta = Math.round((index - 1) * 100);
  const note =
    Math.abs(delta) < 5
      ? `${DAY_NAMES[dow]} trades in line with a typical day.`
      : `${DAY_NAMES[dow]} typically runs ${Math.abs(delta)}% ${delta > 0 ? "above" : "below"} average.`;
  return { index, note };
}

export type ForecastInput = {
  revToday: number;
  revWeek: number;
  revMonth: number;
  daily: DailyPoint[];
  flashForecast: number;
  now?: Date;
};

export function buildForecast(input: ForecastInput): RevenueForecast {
  const now = input.now ?? new Date();
  const hoursElapsed = Math.max(1, now.getHours() + now.getMinutes() / 60);
  const { index, note } = seasonalIndex(input.daily, now);

  // Today: extrapolate the hours already traded across the full day.
  const todayProjection = Math.round((input.revToday / hoursElapsed) * 24);

  // Week / month: blend the current run-rate with the trailing daily average.
  const trailingAvg =
    input.daily.length > 0 ? input.daily.reduce((s, d) => s + d.revenue, 0) / input.daily.length : 0;
  const dailyRunRate = input.revWeek > 0 ? input.revWeek / 7 : trailingAvg;
  const blended = trailingAvg > 0 ? (dailyRunRate + trailingAvg) / 2 : dailyRunRate;

  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  return {
    today: Math.max(input.revToday, todayProjection),
    week: Math.round(blended * 7 * index),
    month: Math.round(input.revMonth + blended * Math.max(0, daysInMonth - dayOfMonth)),
    flash: Math.round(input.flashForecast),
    seasonalIndex: Number(index.toFixed(2)),
    seasonalNote: note,
    estimate: true,
    basis:
      "Today is extrapolated from hours traded; week and month blend the current run-rate with the trailing daily average and the day-of-week index.",
  };
}
