/**
 * FoundOurMarket™ Marketplace Operations Copilot (v1.0) — public contracts.
 *
 * ORCHESTRATION LAYER ONLY.
 * The Copilot introduces no schema, no new AI engine, no business rule and no
 * validation logic. It reads the frozen public contracts (Products cache,
 * Catalog Intelligence 2.0, Marketplace Intelligence 3.0, Smart Queues,
 * Auto-Fix) and composes them into an operations-manager view: a daily brief,
 * opportunities, risks, predictions, a health score and a timeline.
 */
import type { SmartIssue } from "@/lib/smart-navigation";

export type CopilotSeverity = "critical" | "high" | "medium" | "low";
export type CopilotKind = "opportunity" | "risk" | "prediction";

/** Stable family id used for learning (accept/reject weighting). */
export type CopilotSignalId =
  | "bestseller_not_promoted"
  | "traffic_without_seo"
  | "weak_imagery"
  | "bundle_candidate"
  | "trending_without_promotion"
  | "vendor_improving"
  | "homepage_feature_ready"
  | "flash_ending_soon"
  | "inventory_depletion"
  | "poor_conversion"
  | "price_anomaly"
  | "missing_required_data"
  | "duplicate_listing"
  | "vendor_declining"
  | "predict_sellout"
  | "predict_flash_underperform"
  | "predict_vendor_miss"
  | "predict_category_momentum"
  | "predict_promotion_lift";

export type CopilotInsight = {
  /** Unique per render (signal + entity). */
  id: string;
  signal: CopilotSignalId;
  kind: CopilotKind;
  severity: CopilotSeverity;
  title: string;
  /** Plain-language reason, no jargon. */
  reason: string;
  /** Expected business impact, in plain language. */
  impact: string;
  /** 0–100. Adjusted by learning. */
  confidence: number;
  /** Estimated minutes to resolve. */
  minutes: number;
  /** Suggested one-click action label. */
  action: string;
  /** Deep-link payload for Universal Smart Navigation. */
  issue: SmartIssue;
  /** Entity label shown on the card. */
  subject: string;
  subjectImage?: string | null;
  /** Predictions are always labelled as estimates. */
  estimate?: boolean;
  /** Internal ranking score (higher first). */
  priority: number;
};

export type HealthPillarId =
  | "catalog"
  | "seo"
  | "inventory"
  | "pricing"
  | "vendors"
  | "promotions"
  | "customer_experience"
  | "trust";

export type HealthPillar = {
  id: HealthPillarId;
  label: string;
  score: number;
  detail: string;
  trend: "improving" | "stable" | "declining" | "unknown";
  delta: number;
};

export type CopilotHealth = {
  score: number;
  status: "Healthy" | "Good" | "Needs attention" | "Critical";
  pillars: HealthPillar[];
  history: { at: number; score: number }[];
};

export type CopilotBrief = {
  greeting: string;
  statusLine: string;
  priorities: string[];
  primary: CopilotInsight | null;
  criticalCount: number;
};

export type CopilotSnapshot = {
  version: 1;
  brief: CopilotBrief;
  opportunities: CopilotInsight[];
  risks: CopilotInsight[];
  predictions: CopilotInsight[];
  health: CopilotHealth;
  generatedAt: string;
  explainable: true;
};

export const SEVERITY_TONE: Record<CopilotSeverity, string> = {
  critical: "border-destructive/40 bg-destructive/10 text-destructive",
  high: "border-amber-400/40 bg-amber-400/10 text-amber-300",
  medium: "border-sky-400/40 bg-sky-400/10 text-sky-300",
  low: "border-border/50 bg-card/50 text-muted-foreground",
};

export const SEVERITY_LABEL: Record<CopilotSeverity, string> = {
  critical: "Critical",
  high: "High",
  medium: "Medium",
  low: "Low",
};
