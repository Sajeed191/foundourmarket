/**
 * Reusable Flash Deal campaign templates.
 *
 * Templates only prefill the creation wizard — duration, priority, suggested
 * discount, campaign label and accent styling. Nothing is applied automatically
 * and every field stays fully editable before the admin publishes.
 */

export type CampaignTemplate = {
  key: string;
  label: string;
  /** Plain-language pitch shown in the picker. */
  blurb: string;
  /** Deal duration in hours. */
  durationHours: number;
  priority: number;
  /** Suggested discount percentage. */
  discountPct: number;
  /** Tailwind classes for the template chip. */
  accent: string;
};

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  { key: "weekend", label: "Weekend Sale", blurb: "Friday evening through Sunday night.", durationHours: 60, priority: 40, discountPct: 25, accent: "border-sky-500/30 bg-sky-500/10 text-sky-200" },
  { key: "festival", label: "Festival Offer", blurb: "Longer festive window with strong pricing.", durationHours: 120, priority: 60, discountPct: 35, accent: "border-amber-500/30 bg-amber-500/10 text-amber-200" },
  { key: "mega", label: "Mega Sale", blurb: "Headline event — deepest discounts, top priority.", durationHours: 72, priority: 90, discountPct: 45, accent: "border-accent/40 bg-accent/10 text-accent" },
  { key: "summer", label: "Summer Collection", blurb: "Seasonal push across a week.", durationHours: 168, priority: 30, discountPct: 20, accent: "border-orange-500/30 bg-orange-500/10 text-orange-200" },
  { key: "electronics", label: "Electronics Week", blurb: "Category spotlight for tech products.", durationHours: 168, priority: 50, discountPct: 18, accent: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200" },
  { key: "fashion", label: "Fashion Week", blurb: "Category spotlight for apparel and style.", durationHours: 168, priority: 50, discountPct: 30, accent: "border-pink-500/30 bg-pink-500/10 text-pink-200" },
  { key: "clearance", label: "Clearance", blurb: "Move excess inventory fast.", durationHours: 96, priority: 20, discountPct: 50, accent: "border-rose-500/30 bg-rose-500/10 text-rose-200" },
  { key: "midnight", label: "Midnight Drop", blurb: "Short overnight burst for urgency.", durationHours: 8, priority: 70, discountPct: 30, accent: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200" },
  { key: "launch", label: "New Launch", blurb: "Introductory pricing for a fresh arrival.", durationHours: 48, priority: 80, discountPct: 12, accent: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" },
  { key: "school", label: "Back to School", blurb: "Essentials bundle window.", durationHours: 120, priority: 35, discountPct: 22, accent: "border-violet-500/30 bg-violet-500/10 text-violet-200" },
];

export function templateWindow(t: CampaignTemplate, from = Date.now()) {
  return {
    start: new Date(from),
    end: new Date(from + t.durationHours * 3600_000),
  };
}
