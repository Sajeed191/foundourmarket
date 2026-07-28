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
  /** v12 — library metadata. Presentation only; nothing is auto-applied. */
  useCase?: string;
  categories?: string[];
  discountRange?: [number, number];
};

export const CAMPAIGN_TEMPLATES: CampaignTemplate[] = [
  { key: "weekend", label: "Weekend Sale", blurb: "Friday evening through Sunday night.", durationHours: 60, priority: 40, discountPct: 25, accent: "border-sky-500/30 bg-sky-500/10 text-sky-200" , useCase: "Fill the slow Friday-to-Sunday window with broad appeal.", categories: ["All categories"], discountRange: [20, 30] },
  { key: "festival", label: "Festival Offer", blurb: "Longer festive window with strong pricing.", durationHours: 120, priority: 60, discountPct: 35, accent: "border-amber-500/30 bg-amber-500/10 text-amber-200" , useCase: "Big seasonal moments where shoppers expect deep pricing.", categories: ["Fashion", "Home", "Electronics"], discountRange: [30, 45] },
  { key: "mega", label: "Mega Sale", blurb: "Headline event — deepest discounts, top priority.", durationHours: 72, priority: 90, discountPct: 45, accent: "border-accent/40 bg-accent/10 text-accent" , useCase: "Headline marketplace event you promote everywhere.", categories: ["All categories"], discountRange: [40, 55] },
  { key: "summer", label: "Summer Collection", blurb: "Seasonal push across a week.", durationHours: 168, priority: 30, discountPct: 20, accent: "border-orange-500/30 bg-orange-500/10 text-orange-200" , useCase: "Warm-season demand across a full week.", categories: ["Fashion", "Outdoor", "Home"], discountRange: [15, 28] },
  { key: "electronics", label: "Electronics Week", blurb: "Category spotlight for tech products.", durationHours: 168, priority: 50, discountPct: 18, accent: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200" , useCase: "Category spotlight when tech inventory is heavy.", categories: ["Electronics", "Accessories"], discountRange: [12, 25] },
  { key: "fashion", label: "Fashion Week", blurb: "Category spotlight for apparel and style.", durationHours: 168, priority: 50, discountPct: 30, accent: "border-pink-500/30 bg-pink-500/10 text-pink-200" , useCase: "Style-led week to refresh apparel exposure.", categories: ["Fashion", "Footwear", "Accessories"], discountRange: [25, 40] },
  { key: "clearance", label: "Clearance", blurb: "Move excess inventory fast.", durationHours: 96, priority: 20, discountPct: 50, accent: "border-rose-500/30 bg-rose-500/10 text-rose-200" , useCase: "Aged or excess stock you want to move quickly.", categories: ["All categories"], discountRange: [40, 60] },
  { key: "midnight", label: "Midnight Drop", blurb: "Short overnight burst for urgency.", durationHours: 8, priority: 70, discountPct: 30, accent: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200" , useCase: "Short urgency burst for engaged repeat shoppers.", categories: ["Electronics", "Fashion"], discountRange: [25, 40] },
  { key: "launch", label: "New Launch", blurb: "Introductory pricing for a fresh arrival.", durationHours: 48, priority: 80, discountPct: 12, accent: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" , useCase: "New arrivals that need first-week momentum.", categories: ["New arrivals"], discountRange: [8, 15] },
  { key: "school", label: "Back to School", blurb: "Essentials bundle window.", durationHours: 120, priority: 35, discountPct: 22, accent: "border-violet-500/30 bg-violet-500/10 text-violet-200" , useCase: "Back-to-school essentials before term starts.", categories: ["Stationery", "Electronics", "Bags"], discountRange: [18, 28] },
  { key: "midnight_madness", label: "Midnight Madness", blurb: "Four-hour overnight blitz at top priority.", durationHours: 4, priority: 95, discountPct: 40, accent: "border-indigo-500/30 bg-indigo-500/10 text-indigo-200" , useCase: "Overnight blitz to spike attention fast.", categories: ["Electronics", "Fashion"], discountRange: [35, 50] },
  { key: "electronics_hour", label: "Electronics Hour", blurb: "Single-hour tech spotlight for urgency.", durationHours: 1, priority: 85, discountPct: 15, accent: "border-cyan-500/30 bg-cyan-500/10 text-cyan-200" , useCase: "Single-hour spotlight to test tech demand.", categories: ["Electronics"], discountRange: [10, 20] },
  { key: "fashion_friday", label: "Fashion Friday", blurb: "One-day style event to close the week.", durationHours: 24, priority: 55, discountPct: 30, accent: "border-pink-500/30 bg-pink-500/10 text-pink-200" , useCase: "Weekly style ritual customers can expect.", categories: ["Fashion", "Accessories"], discountRange: [25, 35] },
  { key: "home_essentials", label: "Home Essentials", blurb: "Steady week-long push on everyday home goods.", durationHours: 168, priority: 25, discountPct: 20, accent: "border-teal-500/30 bg-teal-500/10 text-teal-200" , useCase: "Steady everyday demand with modest pricing.", categories: ["Home", "Kitchen"], discountRange: [15, 25] },
  { key: "holiday", label: "Holiday Deals", blurb: "Gift-season window across the long weekend.", durationHours: 96, priority: 65, discountPct: 30, accent: "border-red-500/30 bg-red-500/10 text-red-200", useCase: "Gifting peaks when shoppers buy for other people.", categories: ["Gifts", "Electronics", "Home"], discountRange: [25, 40] },
  { key: "winter_clearance", label: "Winter Clearance", blurb: "End-of-season markdown on cold-weather stock.", durationHours: 168, priority: 30, discountPct: 45, accent: "border-slate-400/30 bg-slate-400/10 text-slate-200", useCase: "Clear seasonal inventory before the next collection lands.", categories: ["Fashion", "Outdoor"], discountRange: [40, 60] },
];


export function templateWindow(t: CampaignTemplate, from = Date.now()) {
  return {
    start: new Date(from),
    end: new Date(from + t.durationHours * 3600_000),
  };
}
