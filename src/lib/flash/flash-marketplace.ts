/**
 * Flash Deals v12.0 — Marketplace Merchandising Intelligence.
 *
 * Pure, read-only compositions over contracts the platform already owns
 * (`DealEntry`, `Product` flags, `BalanceReport`, `LifecycleStage`,
 * `MarketFeedItem`, rotation windows). Nothing here writes to the database or
 * touches rotation, countdown, pricing, realtime, analytics, RLS or any
 * existing mutation — it only explains how Flash Deals interact with the rest
 * of the marketplace.
 */
import type { DealEntry } from "@/lib/flash/use-flash-admin";
import type { MarketFeedItem, Tone, LifecycleStage } from "@/lib/flash/flash-executive";

const HOUR = 3600_000;
const DAY = 24 * HOUR;

/* --------------------------------------------------- 1. marketplace impact */

export type ImpactTag = {
  key: string;
  label: string;
  tone: Tone;
  /** Plain-language evidence, always derived from data we already hold. */
  why: string;
};

/**
 * Why this deal matters to the marketplace, not just to itself. Every tag is
 * backed by an existing signal — rotation slot, category share, recorded
 * clicks, stock position, price band or campaign label.
 */
export function marketplaceImpact(
  e: DealEntry,
  ctx: { cap: number; categoryShare: Map<string, number>; avgCtr: number; avgPrice: number; now: number },
): ImpactTag[] {
  const tags: ImpactTag[] = [];
  const onHomepage = e.rotationRank != null && e.rotationRank < ctx.cap;
  const qty = e.product.stockQuantity ?? 0;
  const category = e.product.category || "Unspecified";
  const share = ctx.categoryShare.get(category) ?? 0;
  const ageDays = e.product.createdAt ? (ctx.now - new Date(e.product.createdAt).getTime()) / DAY : 0;

  if (onHomepage && e.stats.views > 0 && e.stats.ctr >= ctx.avgCtr) {
    tags.push({
      key: "traffic",
      label: "Drives traffic",
      tone: "green",
      why: `${e.stats.clicks} clicks from ${e.stats.views} homepage impressions — at or above the flash average.`,
    });
  }

  if (onHomepage && share <= 1) {
    tags.push({
      key: "category",
      label: "Improves category visibility",
      tone: "blue",
      why: `${category} has only ${share} deal${share === 1 ? "" : "s"} on the homepage right now.`,
    });
  }

  if (onHomepage && share >= 3) {
    tags.push({
      key: "repeat",
      label: "Repeats a category",
      tone: "amber",
      why: `${share} homepage slots already show ${category} — swapping this deal would widen the lineup.`,
    });
  } else if (onHomepage) {
    tags.push({
      key: "balance",
      label: "Balances homepage",
      tone: "green",
      why: `Adds ${category} to a lineup that is otherwise spread across other categories.`,
    });
  }

  if (ageDays >= 90 && qty > 25) {
    tags.push({
      key: "inventory",
      label: "Reduces old inventory",
      tone: "blue",
      why: `Listed ${Math.round(ageDays)} days ago with ${qty} units still in stock.`,
    });
  }

  if (e.dealPrice >= ctx.avgPrice * 1.5) {
    tags.push({
      key: "premium",
      label: "Increases premium exposure",
      tone: "blue",
      why: `Priced well above the average flash deal, keeping the higher price band visible.`,
    });
  }

  if (e.campaign) {
    tags.push({
      key: "campaign",
      label: "Supports campaign",
      tone: "green",
      why: `Part of the ${e.campaign} campaign.`,
    });
  }

  return tags.slice(0, 3);
}

/** Homepage category share for the deals that are actually visible. */
export function categoryShare(visible: DealEntry[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of visible) {
    const c = e.product.category || "Unspecified";
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}

/* ------------------------------------------------ 2. cross-section conflicts */

export type HomepageSection = "Flash Deals" | "Trending" | "Best Sellers" | "Featured" | "Recently Added" | "Recommended";

export type SectionConflict = {
  id: string;
  slug: string;
  product: string;
  sections: HomepageSection[];
  why: string;
  winner: HomepageSection;
  improve: string;
};

function otherSections(e: DealEntry, now: number): HomepageSection[] {
  const p = e.product;
  const out: HomepageSection[] = [];
  if (p.trending) out.push("Trending");
  if (p.bestseller) out.push("Best Sellers");
  if (p.featured) out.push("Featured");
  const fresh = p.createdAt ? now - new Date(p.createdAt).getTime() <= 14 * DAY : false;
  if (p.newArrival || fresh) out.push("Recently Added");
  return out;
}

/**
 * A product shown by Flash Deals *and* another homepage section repeats itself
 * to the shopper. Flash Deals wins while the deal is live because it carries
 * the price advantage; afterwards the other section should take over.
 */
export function crossSectionConflicts(entries: DealEntry[], cap: number, now: number): SectionConflict[] {
  const out: SectionConflict[] = [];
  for (const e of entries) {
    const visible = e.rotationRank != null && e.rotationRank < cap;
    if (!visible && e.status !== "active") continue;
    const others = otherSections(e, now);
    if (others.length === 0) continue;
    const live = e.status === "active";
    out.push({
      id: `x:${e.key}`,
      slug: e.product.slug,
      product: e.product.name,
      sections: ["Flash Deals", ...others],
      why: `${e.product.name} appears in Flash Deals and ${others.length === 1 ? others[0] : `${others.slice(0, -1).join(", ")} and ${others[others.length - 1]}`}, so shoppers see the same product more than once on the homepage.`,
      winner: live ? "Flash Deals" : others[0],
      improve: live
        ? `Keep the flash slot while the deal is live — it shows the discounted price — and rest the product in ${others[0]} until the window ends.`
        : `The deal is not live, so ${others[0]} should keep the slot. Schedule the flash window or remove the flash badge.`,
    });
  }
  return out.sort((a, b) => b.sections.length - a.sections.length).slice(0, 12);
}

/* ------------------------------------------------------- 4. campaign journey */

export type JourneyStage = "draft" | "scheduled" | "live" | "peak" | "ending" | "completed" | "archived";

export const JOURNEY_ORDER: JourneyStage[] = [
  "draft", "scheduled", "live", "peak", "ending", "completed", "archived",
];

export const JOURNEY_LABEL: Record<JourneyStage, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  live: "Live",
  peak: "Peak",
  ending: "Ending",
  completed: "Completed",
  archived: "Archived",
};

/** Maps the existing lifecycle stage onto the campaign journey vocabulary. */
export function journeyStage(stage: LifecycleStage): JourneyStage {
  switch (stage) {
    case "created": return "draft";
    case "scheduled": return "scheduled";
    case "trending": return "peak";
    case "ending_soon": return "ending";
    case "expired": return "completed";
    case "archived": return "archived";
    default: return "live";
  }
}

/* --------------------------------------- 5. product merchandising history */

export type HistoryRow = { label: string; value: string; hint?: string };

export function merchandisingHistory(args: {
  entry: DealEntry;
  siblings: DealEntry[];
  windows: { startsAt: number; slugs: string[] }[];
  cap: number;
  streak: number;
}): HistoryRow[] {
  const { entry, siblings, windows, cap, streak } = args;
  const all = siblings.filter((e) => e.product.slug === entry.product.slug);
  const deals = all.filter((e) => e.deal).length;
  const appearances = windows.filter((w) => {
    const i = w.slugs.indexOf(entry.product.slug);
    return i >= 0 && i < cap;
  }).length;
  const campaigns = [...new Set(all.map((e) => e.campaign).filter(Boolean))] as string[];
  const views = all.reduce((a, e) => a + e.stats.views, 0);
  const clicks = all.reduce((a, e) => a + e.stats.clicks, 0);
  const purchases = all.reduce((a, e) => a + e.stats.purchases, 0);
  const ctr = views > 0 ? (clicks / views) * 100 : 0;

  const sections = otherSections(entry, Date.now());

  return [
    { label: "Previously featured", value: entry.product.featured ? "Yes" : "No", hint: "Featured flag on the product record" },
    { label: "Previous flash deals", value: String(deals) },
    { label: "Homepage appearances", value: `${appearances} of ${windows.length} windows` },
    { label: "Campaign history", value: campaigns.length ? campaigns.join(", ") : "None" },
    { label: "Also recommended in", value: sections.length ? sections.join(", ") : "Flash Deals only" },
    { label: "Performance trend", value: `${ctr.toFixed(1)}% CTR · ${purchases} order${purchases === 1 ? "" : "s"}` },
    { label: "Rotation streak", value: `${streak} window${streak === 1 ? "" : "s"}` },
  ];
}

/* -------------------------------------------------------- 7. marketplace events */

export type EventDay = { key: string; label: string; items: MarketFeedItem[] };

const DAY_FMT = new Intl.DateTimeFormat(undefined, { weekday: "long", day: "numeric", month: "short" });

export function groupEventsByDay(feed: MarketFeedItem[], now: number): EventDay[] {
  const today = new Date(now).toDateString();
  const yesterday = new Date(now - DAY).toDateString();
  const map = new Map<string, MarketFeedItem[]>();
  for (const item of feed) {
    const key = new Date(item.at).toDateString();
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  }
  return [...map.entries()]
    .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime())
    .map(([key, items]) => ({
      key,
      label: key === today ? "Today" : key === yesterday ? "Yesterday" : DAY_FMT.format(new Date(key)),
      items: items.sort((a, b) => b.at - a.at),
    }));
}

/* ---------------------------------------------------- 9. one-click operations */

/** Low risk = high confidence and nothing urgent riding on it. */
export function isLowRisk(confidence: "high" | "medium" | "low", urgency: "now" | "today" | "soon") {
  return confidence === "high" && urgency !== "now";
}
