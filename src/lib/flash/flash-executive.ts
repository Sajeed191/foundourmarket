/**
 * Flash Deals v10.0 — Executive & Autonomous Operations derivations.
 *
 * Pure, read-only maths on top of the existing contracts (`DealEntry`,
 * `DealIntelligence`, `Conflict`, `DealAdvice`, `QueueItem`). Nothing in this
 * module writes to the database or touches rotation, countdown, realtime,
 * analytics, RLS or any existing mutation: it only turns data the platform
 * already has into an executive summary, campaign health, forecasts,
 * scheduling suggestions, a homepage balance report, deal lifecycles,
 * product journeys and transparent explanations.
 */
import type { DealEntry } from "@/lib/flash/use-flash-admin";
import type { DealIntelligence, Conflict } from "@/lib/flash/flash-intelligence";
import type { QueueItem } from "@/lib/flash/flash-autonomy";
import { inventoryVerdict, simulateDeal } from "@/lib/flash/flash-autonomy";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

export type Tone = "green" | "blue" | "amber" | "red";

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

export function toneForScore(score: number): Tone {
  if (score >= 85) return "green";
  if (score >= 70) return "blue";
  if (score >= 50) return "amber";
  return "red";
}

/* ------------------------------------------------- 1. executive dashboard */

export type ExecutiveMetric = {
  key: string;
  label: string;
  score: number;
  tone: Tone;
  /** Short, human value shown under the label. */
  value: string;
};

export type ExecutiveSummary = {
  overall: number;
  tone: Tone;
  sentence: string;
  metrics: ExecutiveMetric[];
  revenueOpportunity: number;
  attention: number;
};

export function executiveSummary(args: {
  entries: DealEntry[];
  conflicts: Conflict[];
  scores: Map<string, DealIntelligence>;
  queue: QueueItem[];
  balance: BalanceReport;
  cap: number;
  visibleCount: number;
  now: number;
}): ExecutiveSummary {
  const { entries, conflicts, scores, queue, balance, cap, visibleCount } = args;

  const live = entries.filter((e) => e.status === "active");
  const scheduled = entries.filter((e) => e.status === "scheduled");
  const critical = conflicts.filter((c) => c.severity === "critical").length;

  // Flash deal health — average intelligence score across deals we can score.
  const scored = entries.map((e) => scores.get(e.key)?.score).filter((n): n is number => typeof n === "number");
  const dealHealth = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : 60;

  // Marketplace health — are the homepage slots filled with healthy deals?
  const fillPct = cap > 0 ? clamp((visibleCount / cap) * 100) : 0;
  const marketplace = Math.round(clamp(fillPct * 0.6 + dealHealth * 0.4 - critical * 6));

  // Revenue opportunity — value still sitting in live deal inventory.
  const revenueOpportunity = live.reduce(
    (a, e) => a + e.dealPrice * Math.max(0, e.product.stockQuantity ?? 0),
    0,
  );

  // Risk — conflicts, guardrail breaches and sell-out exposure.
  const risky = entries.filter((e) => e.warnings.length > 0).length;
  const risk = Math.round(clamp(100 - critical * 18 - risky * 4));

  // Rotation — how many live deals actually reach a homepage slot.
  const reaching = live.filter((e) => e.rotationRank != null && e.rotationRank < cap).length;
  const rotation = live.length ? Math.round(clamp((reaching / live.length) * 100)) : 70;

  // Inventory — share of deals in a safe stock position.
  const verdicts = live.map((e) => inventoryVerdict(e).tone);
  const safe = verdicts.filter((t) => t === "green" || t === "blue").length;
  const inventory = verdicts.length ? Math.round(clamp((safe / verdicts.length) * 100)) : 80;

  // Campaign — is anything planned beyond right now?
  const campaign = Math.round(clamp(scheduled.length === 0 ? 45 : 60 + Math.min(40, scheduled.length * 8)));

  const metrics: ExecutiveMetric[] = [
    { key: "marketplace", label: "Marketplace health", score: marketplace, tone: toneForScore(marketplace), value: `${visibleCount}/${cap} slots filled` },
    { key: "deals", label: "Flash deal health", score: dealHealth, tone: toneForScore(dealHealth), value: `${live.length} live` },
    { key: "revenue", label: "Live deal inventory value", score: rotationPlaceholderScore, tone: "neutral", value: `${money(revenueOpportunity)} in stock` },
    { key: "risk", label: "Risk level", score: risk, tone: toneForScore(risk), value: critical ? `${critical} critical` : risky ? `${risky} warnings` : "No issues" },
    { key: "rotation", label: "Rotation status", score: rotation, tone: toneForScore(rotation), value: `${reaching} on the homepage` },
    { key: "inventory", label: "Inventory health", score: inventory, tone: toneForScore(inventory), value: `${safe}/${Math.max(1, verdicts.length)} safe` },
    { key: "campaign", label: "Campaign status", score: campaign, tone: toneForScore(campaign), value: scheduled.length ? `${scheduled.length} scheduled` : "Nothing planned" },
    { key: "balance", label: "Homepage balance", score: balance.score, tone: toneForScore(balance.score), value: balance.headline },
  ];

  const overall = Math.round(
    marketplace * 0.3 + dealHealth * 0.2 + risk * 0.18 +
    rotation * 0.12 + inventory * 0.1 + campaign * 0.05 + balance.score * 0.05,
  );

  const parts: string[] = [];
  parts.push(
    overall >= 85 ? "Flash Deals are performing excellently."
      : overall >= 70 ? "Flash Deals are healthy."
      : overall >= 50 ? "Flash Deals need some attention."
      : "Flash Deals are underperforming.",
  );
  const needs = critical || queue.filter((q) => q.urgency === "now").length;
  if (needs > 0) parts.push(`${needs} deal${needs === 1 ? "" : "s"} require${needs === 1 ? "s" : ""} immediate attention.`);
  else parts.push("Nothing requires immediate attention.");

  return {
    overall,
    tone: toneForScore(overall),
    sentence: parts.join(" "),
    metrics,
    revenueOpportunity,
    attention: conflicts.length,
  };
}

export function money(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/* ----------------------------------------------------- 2. campaign health */

export type CampaignStatus = "excellent" | "healthy" | "warning" | "critical";

export type CampaignHealth = {
  name: string;
  deals: number;
  score: number;
  status: CampaignStatus;
  revenue: number;
  ctr: number;
  conversion: number;
  /** % of the campaign's starting inventory already consumed. */
  inventoryConsumption: number;
  traffic: number;
  profitability: number;
  momentum: number;
  trend: "up" | "flat" | "down";
  note: string;
};

export function campaignHealth(entries: DealEntry[], avgCtr: number): CampaignHealth[] {
  const groups = new Map<string, DealEntry[]>();
  for (const e of entries) {
    if (!e.deal) continue;
    const name = e.campaign || "Unassigned";
    const list = groups.get(name) ?? [];
    list.push(e);
    groups.set(name, list);
  }

  const out: CampaignHealth[] = [];
  for (const [name, list] of groups) {
    const views = list.reduce((a, e) => a + e.stats.views, 0);
    const clicks = list.reduce((a, e) => a + e.stats.clicks, 0);
    const purchases = list.reduce((a, e) => a + e.stats.purchases, 0);
    const revenue = list.reduce((a, e) => a + e.stats.purchases * e.dealPrice, 0);
    const ctr = views > 0 ? (clicks / views) * 100 : 0;
    const conversion = views > 0 ? (purchases / views) * 100 : 0;

    const stock = list.reduce((a, e) => a + Math.max(0, e.product.stockQuantity ?? 0), 0);
    const sold = list.reduce((a, e) => a + e.stats.purchases, 0);
    const inventoryConsumption = stock + sold > 0 ? Math.round((sold / (stock + sold)) * 100) : 0;

    const avgDiscount = list.reduce((a, e) => a + e.discountPct, 0) / Math.max(1, list.length);
    const profitability = Math.round(clamp(100 - avgDiscount * 1.4));
    const momentum = Math.round(clamp((ctr / Math.max(0.5, avgCtr)) * 55));
    const live = list.filter((e) => e.status === "active").length;

    const score = Math.round(
      clamp(momentum * 0.3 + profitability * 0.2 + Math.min(100, conversion * 12) * 0.2 +
        Math.min(100, views / 4) * 0.15 + (live > 0 ? 100 : 40) * 0.15),
    );

    const status: CampaignStatus =
      score >= 85 ? "excellent" : score >= 68 ? "healthy" : score >= 45 ? "warning" : "critical";
    const trend: CampaignHealth["trend"] = momentum >= 65 ? "up" : momentum >= 40 ? "flat" : "down";

    out.push({
      name, deals: list.length, score, status, revenue, ctr, conversion,
      inventoryConsumption, traffic: views, profitability, momentum, trend,
      note:
        status === "critical" ? "Traffic and clicks are far below your average — refresh the products or the pricing."
        : status === "warning" ? "Performing below potential. A deeper discount or a better time slot usually helps."
        : status === "healthy" ? "Steady performance with healthy margin."
        : "Outperforming your marketplace average — consider extending it.",
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/* ----------------------------------------------------- 3. revenue forecast */

export type ForecastHorizon = "next_hour" | "today" | "tomorrow" | "weekend" | "campaign_end";

export type ForecastRow = {
  horizon: ForecastHorizon;
  label: string;
  orders: number;
  revenue: number;
  inventoryRemaining: number;
  sellOutProbability: number;
  confidence: "high" | "medium" | "low";
};

const HORIZON_HOURS: Record<ForecastHorizon, number> = {
  next_hour: 1,
  today: 8,
  tomorrow: 32,
  weekend: 72,
  campaign_end: 0, // resolved per-deal
};

/**
 * Deliberately transparent projection: recent per-hour order velocity is
 * extended across each horizon and always capped by real remaining stock.
 */
export function revenueForecast(entries: DealEntry[], now: number): ForecastRow[] {
  const live = entries.filter((e) => e.status === "active");
  const stock = live.reduce((a, e) => a + Math.max(0, e.product.stockQuantity ?? 0), 0);
  const purchases = live.reduce((a, e) => a + e.stats.purchases, 0);
  const views = live.reduce((a, e) => a + e.stats.views, 0);
  const avgPrice = live.length ? live.reduce((a, e) => a + e.dealPrice, 0) / live.length : 0;

  // Observed velocity over the events window (30 days of data, weighted to now).
  const ordersPerHour = Math.max(0, purchases / (30 * 24)) * 6;
  const longestMs = live.reduce((a, e) => Math.max(a, e.msRemaining ?? 0), 0);

  const rows: ForecastRow[] = [];
  const build = (horizon: ForecastHorizon, label: string, hours: number): ForecastRow => {
    const projected = Math.round(ordersPerHour * hours);
    const orders = Math.min(stock, projected);
    const remaining = Math.max(0, stock - orders);
    const sellOut = stock > 0 ? Math.round(clamp((projected / stock) * 100)) : 0;
    const confidence: ForecastRow["confidence"] =
      views >= 500 && hours <= 32 ? "high" : views >= 100 ? "medium" : "low";
    return {
      horizon, label, orders,
      revenue: Math.round(orders * avgPrice),
      inventoryRemaining: remaining,
      sellOutProbability: sellOut,
      confidence,
    };
  };

  rows.push(build("next_hour", "Next hour", HORIZON_HOURS.next_hour));
  rows.push(build("today", "Rest of today", HORIZON_HOURS.today));
  rows.push(build("tomorrow", "Tomorrow", HORIZON_HOURS.tomorrow));
  rows.push(build("weekend", "This weekend", HORIZON_HOURS.weekend));
  rows.push(build("campaign_end", "Until campaign end", Math.max(1, Math.round(longestMs / HOUR))));

  void now;
  return rows;
}

/* --------------------------------------------- 4. smart scheduling assistant */

export type ScheduleSuggestion = {
  startHour: number;
  endHour: number;
  durationHours: number;
  weekday: string;
  campaign: string | null;
  reason: string;
  expectedLiftPct: number;
  confidence: "high" | "medium" | "low";
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Learns from the hours and weekdays that already produced the most clicks in
 * the existing event history. Suggestion only — nothing is scheduled.
 */
export function scheduleSuggestion(
  entries: DealEntry[],
  events: { event_type: string; deal_id: string | null; created_at: string }[],
): ScheduleSuggestion {
  const hourScore = new Array(24).fill(0) as number[];
  const dayScore = new Array(7).fill(0) as number[];
  let samples = 0;

  for (const ev of events) {
    if (ev.event_type !== "click" && ev.event_type !== "purchase") continue;
    const d = new Date(ev.created_at);
    const weight = ev.event_type === "purchase" ? 3 : 1;
    hourScore[d.getHours()] += weight;
    dayScore[d.getDay()] += weight;
    samples += weight;
  }

  const bestHour = samples > 0 ? hourScore.indexOf(Math.max(...hourScore)) : 19;
  const bestDay = samples > 0 ? dayScore.indexOf(Math.max(...dayScore)) : 5;

  // Shorter windows create urgency; long ones dilute it.
  const durations = entries
    .filter((e) => e.deal && e.stats.views > 20)
    .map((e) => ({
      hours: (new Date(e.deal!.end_at).getTime() - new Date(e.deal!.start_at).getTime()) / HOUR,
      ctr: e.stats.ctr,
    }));
  const best = durations.sort((a, b) => b.ctr - a.ctr)[0];
  const durationHours = best ? Math.max(4, Math.min(48, Math.round(best.hours))) : 12;

  const campaigns = new Map<string, number>();
  for (const e of entries) if (e.campaign) campaigns.set(e.campaign, (campaigns.get(e.campaign) ?? 0) + e.stats.clicks);
  const campaign = [...campaigns.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const share = samples > 0 ? hourScore[bestHour] / samples : 0;
  const expectedLiftPct = Math.round(clamp(share * 180, 5, 45));

  return {
    startHour: bestHour,
    endHour: (bestHour + durationHours) % 24,
    durationHours,
    weekday: WEEKDAYS[bestDay],
    campaign,
    reason: samples > 0
      ? `${WEEKDAYS[bestDay]} around ${String(bestHour).padStart(2, "0")}:00 produced the most clicks and orders in your recorded history.`
      : "Not enough recorded activity yet — this is the evening window that performs best across marketplaces.",
    expectedLiftPct,
    confidence: samples >= 300 ? "high" : samples >= 60 ? "medium" : "low",
  };
}

/* --------------------------------------------- 5. homepage balance monitor */

export type BalanceBar = { label: string; pct: number; tone: Tone };

export type BalanceDimension = {
  key: string;
  label: string;
  score: number;
  tone: Tone;
  bars: BalanceBar[];
  advice: string;
};

export type BalanceReport = {
  score: number;
  headline: string;
  dimensions: BalanceDimension[];
  recommendations: string[];
};

function distribution(values: string[]): BalanceBar[] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  const total = Math.max(1, values.length);
  return [...counts.entries()]
    .map(([label, n]) => {
      const pct = Math.round((n / total) * 100);
      return { label, pct, tone: (pct > 50 ? "red" : pct > 35 ? "amber" : "green") as Tone };
    })
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 6);
}

function dimensionScore(bars: BalanceBar[]) {
  const top = bars[0]?.pct ?? 0;
  return Math.round(clamp(100 - Math.max(0, top - 30) * 1.8));
}

export function balanceReport(visible: DealEntry[], streaks: Map<string, number>): BalanceReport {
  const priceBand = (p: number) => (p < 50 ? "Under 50" : p < 150 ? "50–150" : p < 400 ? "150–400" : "400+");
  const discountBand = (d: number) => (d < 10 ? "Under 10%" : d < 25 ? "10–25%" : d < 40 ? "25–40%" : "40%+");
  const stockBand = (n: number) => (n <= 5 ? "Critical" : n <= 25 ? "Low" : n <= 150 ? "Healthy" : "Excess");

  const dims: BalanceDimension[] = [
    { key: "category", label: "Category mix", values: visible.map((e) => e.product.category || "Unspecified"), advice: "Feature a different category to widen appeal." },
    { key: "brand", label: "Brand mix", values: visible.map((e) => e.product.brand || "Unbranded"), advice: "One brand dominates the homepage — rotate in another." },
    { key: "price", label: "Price spread", values: visible.map((e) => priceBand(e.dealPrice)), advice: "Add a deal in a different price band so every budget is served." },
    { key: "discount", label: "Discount spread", values: visible.map((e) => discountBand(e.discountPct)), advice: "Vary the discount depth so the offers do not look identical." },
    { key: "inventory", label: "Inventory balance", values: visible.map((e) => stockBand(e.product.stockQuantity ?? 0)), advice: "Too many deals sit in the same stock position — mix in safer inventory." },
    { key: "vendor", label: "Vendor balance", values: visible.map((e) => e.product.brand || "In-house"), advice: "Spread exposure across more vendors." },
  ].map((d) => {
    const bars = distribution(d.values);
    const score = dimensionScore(bars);
    return { key: d.key, label: d.label, score, tone: toneForScore(score), bars, advice: d.advice };
  });

  // Duplicate exposure + freshness are derived from rotation streaks.
  const repeated = visible.filter((e) => (streaks.get(e.product.slug) ?? 0) >= 3).length;
  const dupScore = Math.round(clamp(100 - repeated * 22));
  dims.push({
    key: "duplicate",
    label: "Duplicate exposure",
    score: dupScore,
    tone: toneForScore(dupScore),
    bars: [{ label: "Repeated 3+ windows", pct: visible.length ? Math.round((repeated / visible.length) * 100) : 0, tone: repeated ? "amber" : "green" }],
    advice: repeated ? "Some products have held a slot for several windows — reshuffle or rest them." : "No product is over-exposed.",
  });

  const fresh = visible.filter((e) => (streaks.get(e.product.slug) ?? 0) <= 1).length;
  const freshScore = visible.length ? Math.round((fresh / visible.length) * 100) : 100;
  dims.push({
    key: "freshness",
    label: "Freshness",
    score: freshScore,
    tone: toneForScore(freshScore),
    bars: [{ label: "New this window", pct: freshScore, tone: toneForScore(freshScore) === "red" ? "red" : "green" }],
    advice: freshScore < 50 ? "The homepage looks the same as the last window — introduce new products." : "The lineup feels fresh.",
  });

  const score = Math.round(dims.reduce((a, d) => a + d.score, 0) / Math.max(1, dims.length));
  const worst = [...dims].sort((a, b) => a.score - b.score).slice(0, 3).filter((d) => d.score < 75);

  return {
    score,
    headline: score >= 85 ? "Well balanced" : score >= 65 ? "Slightly repetitive" : "Repetitive lineup",
    dimensions: dims,
    recommendations: worst.map((d) => `${d.label}: ${d.advice}`),
  };
}

/* --------------------------------------------------------- 6. deal lifecycle */

export type LifecycleStage = "created" | "scheduled" | "live" | "trending" | "ending_soon" | "expired" | "archived";

export const LIFECYCLE_ORDER: LifecycleStage[] = [
  "created", "scheduled", "live", "trending", "ending_soon", "expired", "archived",
];

export const LIFECYCLE_LABEL: Record<LifecycleStage, string> = {
  created: "Created",
  scheduled: "Scheduled",
  live: "Live",
  trending: "Trending",
  ending_soon: "Ending soon",
  expired: "Expired",
  archived: "Archived",
};

export function lifecycleStage(e: DealEntry, avgCtr: number, now: number): LifecycleStage {
  if (!e.deal) return "created";
  const end = new Date(e.deal.end_at).getTime();
  if (!e.deal.active && end < now) return "archived";
  if (end < now) return "expired";
  if (e.status === "scheduled") return "scheduled";
  if (e.msRemaining != null && e.msRemaining <= 2 * HOUR) return "ending_soon";
  if (e.status === "active" && e.stats.views > 50 && e.stats.ctr > avgCtr * 1.25) return "trending";
  if (e.status === "active") return "live";
  return "created";
}

/* ---------------------------------------------------------- 7. product journey */

export type JourneyStat = { label: string; value: string };

export type ProductJourney = {
  name: string;
  image: string | null;
  stats: JourneyStat[];
  discounts: number[];
  campaigns: string[];
  rotation: { window: string; slot: number | null }[];
};

export function productJourney(args: {
  entry: DealEntry;
  siblings: DealEntry[];
  streak: number;
  cap: number;
  windows: { startsAt: number; slugs: string[] }[];
}): ProductJourney {
  const { entry, siblings, streak, cap, windows } = args;
  const all = siblings.filter((e) => e.product.slug === entry.product.slug);
  const featured = all.filter((e) => e.deal).length;
  const views = all.reduce((a, e) => a + e.stats.views, 0);
  const clicks = all.reduce((a, e) => a + e.stats.clicks, 0);
  const purchases = all.reduce((a, e) => a + e.stats.purchases, 0);
  const revenue = all.reduce((a, e) => a + e.stats.purchases * e.dealPrice, 0);

  return {
    name: entry.product.name,
    image: entry.product.image ?? null,
    stats: [
      { label: "Times featured", value: String(Math.max(featured, entry.hasBadge ? 1 : 0)) },
      { label: "Flash appearances", value: String(windows.filter((w) => w.slugs.indexOf(entry.product.slug) >= 0).length) },
      { label: "Average CTR", value: `${(views > 0 ? (clicks / views) * 100 : 0).toFixed(1)}%` },
      { label: "Average conversion", value: `${(views > 0 ? (purchases / views) * 100 : 0).toFixed(1)}%` },
      { label: "Revenue generated", value: money(revenue) },
      { label: "Rotation streak", value: `${streak} window${streak === 1 ? "" : "s"}` },
    ],
    discounts: all.map((e) => e.discountPct).filter((d) => d > 0),
    campaigns: [...new Set(all.map((e) => e.campaign).filter((c): c is string => Boolean(c)))],
    rotation: windows.slice(0, 6).map((w, i) => {
      const idx = w.slugs.indexOf(entry.product.slug);
      return { window: i === 0 ? "Now" : `+${i * 6}h`, slot: idx >= 0 && idx < cap ? idx + 1 : null };
    }),
  };
}

/* -------------------------------------------------------- 8. explainability */

export type Explanation = {
  why: string;
  dataUsed: string[];
  expectedImprovement: string;
  confidence: "high" | "medium" | "low";
  downside: string;
  alternative: string;
};

export function explainQueueItem(item: QueueItem, entry: DealEntry | undefined): Explanation {
  const kind = item.advice.action.kind;
  const data: string[] = [
    `${entry?.stats.views ?? 0} impressions and ${entry?.stats.clicks ?? 0} clicks recorded for this deal`,
    `${entry?.discountPct ?? 0}% current discount against the marketplace guardrail`,
    `${entry?.product.stockQuantity ?? 0} units in stock`,
  ];
  if (entry?.rotationRank != null) data.push(`Rotation position ${entry.rotationRank + 1}`);
  if (entry?.campaign) data.push(`Campaign: ${entry.campaign}`);

  const downside =
    kind === "discount" && (item.advice.action as { deltaPct: number }).deltaPct > 0
      ? "A deeper discount reduces margin per order and can sell the stock out faster than planned."
      : kind === "discount"
      ? "A shallower discount protects margin but may slow the deal down."
      : kind === "priority"
      ? "Raising priority pushes another deal down the homepage."
      : kind === "shift" || kind === "tomorrow" || kind === "evening"
      ? "Moving the window delays the revenue and may clash with another campaign."
      : "Manual edits bypass the guardrails, so double-check pricing before saving.";

  const alternative =
    kind === "discount"
      ? "Alternatively, raise the deal priority so it reaches a homepage slot before changing the price."
      : kind === "priority"
      ? "Alternatively, extend the window so the deal collects more impressions at the current priority."
      : "Alternatively, leave the schedule and increase the discount by 5% instead.";

  return {
    why: item.reason,
    dataUsed: data,
    expectedImprovement: `${item.impact}${item.revenueDelta > 0 ? ` · about ${money(item.revenueDelta)} additional revenue` : ""}${item.ctrDelta > 0 ? ` · +${item.ctrDelta}% CTR` : ""}`,
    confidence: item.confidence,
    downside,
    alternative,
  };
}

/* ------------------------------------------------------ 9. marketplace feed */

export type FeedSeverity = "info" | "warning" | "critical";

export type MarketFeedItem = {
  id: string;
  at: number;
  text: string;
  severity: FeedSeverity;
  mine: boolean;
};

export function marketplaceFeed(args: {
  entries: DealEntry[];
  events: { event_type: string; deal_id: string | null; created_at: string }[];
  now: number;
  myActions: { id: string; at: number; text: string }[];
}): MarketFeedItem[] {
  const { entries, events, now, myActions } = args;
  const out: MarketFeedItem[] = [];
  const nameByDeal = new Map<string, DealEntry>();
  for (const e of entries) if (e.deal) nameByDeal.set(e.deal.id, e);

  for (const e of entries) {
    if (!e.deal) continue;
    const start = new Date(e.deal.start_at).getTime();
    const end = new Date(e.deal.end_at).getTime();
    const qty = e.product.stockQuantity ?? 0;
    if (start <= now && start > now - 12 * HOUR)
      out.push({ id: `s:${e.deal.id}`, at: start, text: `${e.product.name} — campaign started`, severity: "info", mine: false });
    if (end <= now && end > now - 12 * HOUR)
      out.push({ id: `e:${e.deal.id}`, at: end, text: `${e.product.name} — campaign ended`, severity: "info", mine: false });
    if (e.status === "active" && qty > 0 && qty <= 5)
      out.push({ id: `low:${e.deal.id}`, at: now, text: `${e.product.name} — only ${qty} left in stock`, severity: "warning", mine: false });
    if (qty <= 0 && e.status === "active")
      out.push({ id: `out:${e.deal.id}`, at: now, text: `${e.product.name} — sold out while live`, severity: "critical", mine: false });
    if (!e.deal.active && end > now)
      out.push({ id: `p:${e.deal.id}`, at: new Date(e.deal.created_at).getTime(), text: `${e.product.name} — deal paused`, severity: "warning", mine: false });
    const revenue = e.stats.purchases * e.dealPrice;
    if (revenue >= 1000)
      out.push({ id: `rev:${e.deal.id}`, at: now, text: `${e.product.name} — passed ${money(revenue)} in flash revenue`, severity: "info", mine: false });
  }

  const buckets = new Map<string, { count: number; at: number; deal: string }>();
  for (const ev of events) {
    if (!ev.deal_id || ev.event_type !== "purchase") continue;
    const at = new Date(ev.created_at).getTime();
    if (at < now - 6 * HOUR) continue;
    const cur = buckets.get(ev.deal_id);
    if (cur) { cur.count++; cur.at = Math.max(cur.at, at); }
    else buckets.set(ev.deal_id, { count: 1, at, deal: ev.deal_id });
  }
  for (const [k, b] of buckets) {
    const e = nameByDeal.get(b.deal);
    out.push({
      id: `o:${k}`, at: b.at, severity: "info", mine: false,
      text: `${e?.product.name ?? "A flash deal"} — ${b.count} order${b.count === 1 ? "" : "s"} in the last hours`,
    });
  }

  for (const a of myActions) out.push({ id: a.id, at: a.at, text: a.text, severity: "info", mine: true });

  return out.sort((a, b) => b.at - a.at).slice(0, 40);
}

/* ---------------------------------------------------- 10. executive reports */

export type ReportRange = "today" | "yesterday" | "week" | "month";

export type ExecutiveReport = {
  range: ReportRange;
  label: string;
  generatedAt: number;
  revenue: number;
  orders: number;
  views: number;
  clicks: number;
  ctr: number;
  conversion: number;
  best: { name: string; revenue: number; ctr: number }[];
  worst: { name: string; views: number; ctr: number }[];
  campaigns: CampaignHealth[];
  inventory: { safe: number; low: number; out: number };
  recommendations: string[];
};

const RANGE_MS: Record<ReportRange, number> = {
  today: DAY,
  yesterday: 2 * DAY,
  week: 7 * DAY,
  month: 30 * DAY,
};

export function executiveReport(args: {
  range: ReportRange;
  entries: DealEntry[];
  events: { event_type: string; deal_id: string | null; created_at: string }[];
  campaigns: CampaignHealth[];
  balance: BalanceReport;
  queue: QueueItem[];
  now: number;
}): ExecutiveReport {
  const { range, entries, events, campaigns, balance, queue, now } = args;
  const from = now - RANGE_MS[range];
  const to = range === "yesterday" ? now - DAY : now;

  const byDeal = new Map<string, { views: number; clicks: number; purchases: number }>();
  for (const ev of events) {
    if (!ev.deal_id) continue;
    const at = new Date(ev.created_at).getTime();
    if (at < from || at > to) continue;
    const cur = byDeal.get(ev.deal_id) ?? { views: 0, clicks: 0, purchases: 0 };
    if (ev.event_type === "impression") cur.views++;
    else if (ev.event_type === "click") cur.clicks++;
    else if (ev.event_type === "purchase") cur.purchases++;
    byDeal.set(ev.deal_id, cur);
  }

  let views = 0, clicks = 0, orders = 0, revenue = 0;
  const perDeal: { name: string; revenue: number; ctr: number; views: number }[] = [];
  for (const e of entries) {
    if (!e.deal) continue;
    const s = byDeal.get(e.deal.id);
    if (!s) continue;
    views += s.views; clicks += s.clicks; orders += s.purchases;
    const r = s.purchases * e.dealPrice;
    revenue += r;
    perDeal.push({ name: e.product.name, revenue: r, ctr: s.views ? (s.clicks / s.views) * 100 : 0, views: s.views });
  }

  const live = entries.filter((e) => e.status === "active");
  const inventory = {
    safe: live.filter((e) => (e.product.stockQuantity ?? 0) > 25).length,
    low: live.filter((e) => (e.product.stockQuantity ?? 0) > 0 && (e.product.stockQuantity ?? 0) <= 25).length,
    out: live.filter((e) => (e.product.stockQuantity ?? 0) <= 0).length,
  };

  return {
    range,
    label: range === "today" ? "Today" : range === "yesterday" ? "Yesterday" : range === "week" ? "Last 7 days" : "Last 30 days",
    generatedAt: now,
    revenue, orders, views, clicks,
    ctr: views ? (clicks / views) * 100 : 0,
    conversion: views ? (orders / views) * 100 : 0,
    best: [...perDeal].sort((a, b) => b.revenue - a.revenue).slice(0, 5).map(({ name, revenue: r, ctr }) => ({ name, revenue: r, ctr })),
    worst: [...perDeal].filter((d) => d.views >= 20).sort((a, b) => a.ctr - b.ctr).slice(0, 5).map(({ name, views: v, ctr }) => ({ name, views: v, ctr })),
    campaigns,
    inventory,
    recommendations: [
      ...queue.slice(0, 5).map((q) => `${q.productName}: ${q.title} — ${q.impact}`),
      ...balance.recommendations,
    ].slice(0, 8),
  };
}

export function reportToCsv(r: ExecutiveReport) {
  const rows: string[][] = [
    ["Flash Deals executive report", r.label],
    ["Generated", new Date(r.generatedAt).toISOString()],
    [],
    ["Metric", "Value"],
    ["Revenue", String(Math.round(r.revenue))],
    ["Orders", String(r.orders)],
    ["Views", String(r.views)],
    ["Clicks", String(r.clicks)],
    ["CTR %", r.ctr.toFixed(2)],
    ["Conversion %", r.conversion.toFixed(2)],
    [],
    ["Best performers", "Revenue", "CTR %"],
    ...r.best.map((b) => [b.name, String(Math.round(b.revenue)), b.ctr.toFixed(2)]),
    [],
    ["Needs attention", "Views", "CTR %"],
    ...r.worst.map((b) => [b.name, String(b.views), b.ctr.toFixed(2)]),
    [],
    ["Campaign", "Score", "Status", "Revenue", "CTR %"],
    ...r.campaigns.map((c) => [c.name, String(c.score), c.status, String(Math.round(c.revenue)), c.ctr.toFixed(2)]),
    [],
    ["Inventory", "Safe", "Low", "Out"],
    ["Live deals", String(r.inventory.safe), String(r.inventory.low), String(r.inventory.out)],
    [],
    ["Recommendations"],
    ...r.recommendations.map((x) => [x]),
  ];
  return rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
}

/* --------------------------------------------------- shared re-export helper */

export { simulateDeal };
