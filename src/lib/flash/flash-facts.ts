/**
 * v13.0 — Real marketplace facts for the Flash Deals Command Center.
 *
 * Zero Fake Intelligence: every number here is counted directly from rows that
 * already exist (`flash_deals`, `flash_deal_events`, `products`,
 * `product_badges`). Nothing is estimated, projected or modelled. When a fact
 * has no underlying rows it is reported as unavailable so the UI can say
 * "No data available yet" instead of inventing a value.
 */
import type { DealEntry } from "@/lib/flash/use-flash-admin";

export type FactValue = {
  label: string;
  /** Formatted value, or null when there is no data behind it yet. */
  value: string | null;
  /** Raw source of the number, shown so admins can trust it. */
  source: string;
};

export type FlashFacts = {
  /** Counts straight from the deal rows / badge state. */
  counts: { label: string; value: number }[];
  /** Today's measured performance, from flash_deal_events only. */
  today: FactValue[];
  /** True when at least one event row exists for today. */
  hasTodayData: boolean;
  todayRevenue: number;
  todayImpressions: number;
  todayClicks: number;
  todayOrders: number;
};

const money = (n: number) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(1)}K` : String(Math.round(n));

export function flashFacts(args: {
  entries: DealEntry[];
  events: { event_type: string; deal_id: string | null; created_at: string }[];
  now: number;
}): FlashFacts {
  const { entries, events, now } = args;

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const dayStartMs = dayStart.getTime();

  const priceByDeal = new Map<string, number>();
  for (const e of entries) if (e.deal) priceByDeal.set(e.deal.id, e.dealPrice);

  let impressions = 0;
  let clicks = 0;
  let orders = 0;
  let revenue = 0;
  for (const ev of events) {
    if (new Date(ev.created_at).getTime() < dayStartMs) continue;
    if (ev.event_type === "impression") impressions++;
    else if (ev.event_type === "click") clicks++;
    else if (ev.event_type === "purchase") {
      orders++;
      revenue += ev.deal_id ? priceByDeal.get(ev.deal_id) ?? 0 : 0;
    }
  }

  const withDeal = entries.filter((e) => e.deal);
  const active = entries.filter((e) => e.status === "active");
  const endingSoon = active.filter((e) => e.msRemaining != null && e.msRemaining <= 45 * 60_000).length;
  const avgDiscount = withDeal.length
    ? withDeal.reduce((a, e) => a + e.discountPct, 0) / withDeal.length
    : null;

  const counts = [
    { label: "Active deals", value: active.length },
    { label: "Scheduled", value: entries.filter((e) => e.status === "scheduled").length },
    { label: "Paused", value: entries.filter((e) => e.status === "paused").length },
    { label: "Expired", value: entries.filter((e) => e.status === "expired").length },
    { label: "Ending in 45 min", value: endingSoon },
    { label: "Badge products", value: entries.filter((e) => e.hasBadge).length },
    { label: "Out of stock", value: entries.filter((e) => !e.product.inStock || e.product.stockQuantity <= 0).length },
    { label: "Missing badge", value: entries.filter((e) => !e.hasBadge).length },
  ];

  const hasTodayData = impressions + clicks + orders > 0;

  const today: FactValue[] = [
    { label: "Revenue today", value: orders > 0 ? money(revenue) : null, source: "flash_deal_events · purchase" },
    { label: "Orders today", value: orders > 0 ? String(orders) : null, source: "flash_deal_events · purchase" },
    { label: "Clicks today", value: clicks > 0 ? String(clicks) : null, source: "flash_deal_events · click" },
    { label: "Impressions today", value: impressions > 0 ? String(impressions) : null, source: "flash_deal_events · impression" },
    {
      label: "CTR today",
      value: impressions > 0 ? `${((clicks / impressions) * 100).toFixed(1)}%` : null,
      source: "clicks ÷ impressions",
    },
    {
      label: "Conversion today",
      value: impressions > 0 ? `${((orders / impressions) * 100).toFixed(1)}%` : null,
      source: "orders ÷ impressions",
    },
    {
      label: "Average discount",
      value: avgDiscount != null ? `${Math.round(avgDiscount)}%` : null,
      source: "flash_deals · flash_price",
    },
    {
      label: "Ending soon",
      value: active.length > 0 ? String(endingSoon) : null,
      source: "flash_deals · end_at",
    },
  ];

  return {
    counts,
    today,
    hasTodayData,
    todayRevenue: revenue,
    todayImpressions: impressions,
    todayClicks: clicks,
    todayOrders: orders,
  };
}
