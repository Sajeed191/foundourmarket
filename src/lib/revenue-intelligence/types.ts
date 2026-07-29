/**
 * FoundOurMarket™ Revenue Intelligence Engine (v1.0) — public contracts.
 *
 * ORCHESTRATION ONLY.
 * This layer introduces no schema, no checkout/payment/order logic, no new AI
 * engine and no business rules. It reads data the platform already produces
 * (Executive Analytics RPC, Products cache, Traffic Intelligence, Marketplace
 * Health, Catalog Intelligence) and composes it into a financial view:
 * KPIs, revenue opportunities, Flash Deal recommendations, a live product
 * ranking score, forecasts, alerts and a what-if simulator.
 *
 * Everything here is ADVISORY. Nothing in this module starts, ends or changes
 * a promotion, price, placement or product. Admins act through Universal Smart
 * Navigation and Universal AI Auto-Fix, exactly as before.
 */
import type { SmartIssue } from "@/lib/smart-navigation";

export type RevenueSeverity = "critical" | "high" | "medium" | "low";

/** Stable family ids — used by ranking + learning memory. */
export type RevenueSignalId =
  | "bestseller_not_featured"
  | "converting_without_flash"
  | "traffic_low_conversion"
  | "low_stock_bestseller"
  | "bundle_candidate"
  | "frequently_bought_together"
  | "missing_cross_sell"
  | "trending_category_no_promo";

export type RevenueAlertId =
  | "bestseller_stock_low"
  | "flash_underperforming"
  | "traffic_spike"
  | "conversion_drop"
  | "cart_abandonment"
  | "vendor_out_of_stock";

export type RevenueOpportunity = {
  id: string;
  signal: RevenueSignalId;
  title: string;
  /** Plain-language explanation of why this was surfaced. */
  reason: string;
  /** Estimated additional revenue over the next 30 days (currency units). */
  estimatedGain: number;
  /** 0–100. */
  confidence: number;
  /** Suggested one-click action label. */
  action: string;
  subject: string;
  subjectImage?: string | null;
  /** Deep-link payload for Universal Smart Navigation. */
  issue: SmartIssue;
  severity: RevenueSeverity;
  /** Internal ranking score (higher first). */
  priority: number;
  /** How the estimate was derived — always shown to the admin. */
  basis: string;
};

export type RevenueAlert = {
  id: string;
  signal: RevenueAlertId;
  severity: RevenueSeverity;
  title: string;
  detail: string;
  subject?: string;
  issue: SmartIssue;
};

export type FlashRecommendationKind =
  | "should_start"
  | "should_end"
  | "priority_placement"
  | "underperforming"
  | "best_performing";

export type FlashRecommendation = {
  id: string;
  kind: FlashRecommendationKind;
  title: string;
  reason: string;
  subject: string;
  subjectImage?: string | null;
  confidence: number;
  /** Estimated 30-day revenue effect of approving this recommendation. */
  estimatedImpact: number;
  /** 0–100 chance the product sells out within the current window. */
  selloutProbability: number | null;
  /** Estimated revenue while promoted, next 30 days. */
  revenueForecast: number;
  issue: SmartIssue;
  /** Admin approval is always required — the engine never acts. */
  requiresApproval: true;
};

export type RankComponentId =
  | "velocity"
  | "conversion"
  | "views"
  | "wishlist"
  | "inventory"
  | "reviews"
  | "confidence";

export type ProductRankScore = {
  slug: string;
  name: string;
  image: string | null;
  /** 0–100 composite. */
  score: number;
  components: Record<RankComponentId, number>;
  /** Recommended homepage placement derived from the score. */
  placement: "homepage_hero" | "featured_rail" | "category_rail" | "catalog_only";
  /** Estimated 30-day revenue at current velocity. */
  revenueRunRate: number;
  /** Signals the platform does not currently record — never faked. */
  unavailable: string[];
};

export const PLACEMENT_LABEL: Record<ProductRankScore["placement"], string> = {
  homepage_hero: "Homepage hero",
  featured_rail: "Featured rail",
  category_rail: "Category rail",
  catalog_only: "Catalogue only",
};

export type RevenueKpis = {
  today: number;
  week: number;
  month: number;
  aov: number;
  /** Storefront conversion rate (%), from Traffic Intelligence. */
  conversionRate: number;
  /** Revenue attributed to products currently carrying a flash/hot badge. */
  flashRevenue: number;
  ordersToday: number;
  ordersMonth: number;
  topCategories: { label: string; revenue: number; units: number }[];
  topVendors: { label: string; revenue: number }[];
  topProducts: { slug: string; name: string; revenue: number; units: number }[];
  /** Sum of the estimated gain of every open opportunity. */
  lostRevenue: number;
  currency: string;
};

export type RevenueForecast = {
  /** Full-day projection for today, extrapolated from hours elapsed. */
  today: number;
  week: number;
  month: number;
  flash: number;
  /** Day-of-week demand index vs. the trailing average (1.0 = typical). */
  seasonalIndex: number;
  seasonalNote: string;
  /** Always true — forecasts are estimates, never commitments. */
  estimate: true;
  basis: string;
};

export type SimulatorScenarioId =
  | "add_to_flash"
  | "increase_discount"
  | "homepage_placement"
  | "create_bundle"
  | "improve_seo"
  | "add_images";

export type SimulationResult = {
  scenario: SimulatorScenarioId;
  label: string;
  revenueDelta: number;
  conversionDelta: number;
  ordersDelta: number;
  profitDelta: number;
  confidence: number;
  assumption: string;
  estimate: true;
};

export type RevenueExecutiveSummary = {
  healthScore: number;
  /** Estimated monthly growth available if every open opportunity lands (%). */
  growthAvailable: number;
  highestPriority: string;
  highestRisk: string;
};

export type RevenueSnapshot = {
  version: 1;
  kpis: RevenueKpis;
  opportunities: RevenueOpportunity[];
  flash: FlashRecommendation[];
  ranking: ProductRankScore[];
  forecast: RevenueForecast;
  alerts: RevenueAlert[];
  summary: RevenueExecutiveSummary;
  generatedAt: string;
  advisoryOnly: true;
};

export const SEVERITY_TONE: Record<RevenueSeverity, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  medium: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  low: "border-border/50 bg-card/50 text-muted-foreground",
};

export const SEVERITY_LABEL: Record<RevenueSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Currency formatter shared by every Revenue Intelligence surface. */
export function money(n: number, currency: string): string {
  const safe = Number.isFinite(n) ? n : 0;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(safe);
  } catch {
    return `${Math.round(safe)}`;
  }
}

export function pct(n: number, digits = 1): string {
  return `${(Number.isFinite(n) ? n : 0).toFixed(digits)}%`;
}
