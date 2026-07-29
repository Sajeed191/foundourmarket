/**
 * Revenue Simulator (Revenue Intelligence Engine v1.0).
 *
 * Pure what-if arithmetic. Nothing is saved, queued or applied — the simulator
 * exists so an admin can sanity-check a decision before making it in the
 * existing tools. Every scenario states its assumption openly.
 */
import type { Product } from "@/lib/products";
import type { SimulationResult, SimulatorScenarioId } from "./types";
import { unitMargin, unitPrice, velocityPerDay } from "./scoring";

type Scenario = {
  id: SimulatorScenarioId;
  label: string;
  /** Multiplier applied to current sales velocity. */
  salesUplift: number;
  /** Absolute change to listing conversion, in percentage points. */
  conversionDelta: number;
  /** Share of unit margin given up (discount scenarios). */
  marginGiveaway: number;
  confidence: number;
  assumption: string;
};

export const SCENARIOS: Scenario[] = [
  {
    id: "add_to_flash",
    label: "Add to Flash Deals",
    salesUplift: 0.35,
    conversionDelta: 0.6,
    marginGiveaway: 0.1,
    confidence: 72,
    assumption: "Promoted placement historically lifts unit sales ~35% while giving up ~10% of unit margin.",
  },
  {
    id: "increase_discount",
    label: "Increase discount by 10%",
    salesUplift: 0.22,
    conversionDelta: 0.4,
    marginGiveaway: 0.1,
    confidence: 66,
    assumption: "A 10-point discount lifts demand ~22% and reduces margin by the same 10 points of price.",
  },
  {
    id: "homepage_placement",
    label: "Move to homepage placement",
    salesUplift: 0.18,
    conversionDelta: 0.25,
    marginGiveaway: 0,
    confidence: 70,
    assumption: "Homepage exposure lifts unit sales ~18% with no margin cost.",
  },
  {
    id: "create_bundle",
    label: "Create a bundle",
    salesUplift: 0.12,
    conversionDelta: 0.15,
    marginGiveaway: 0.05,
    confidence: 58,
    assumption: "Bundling adds ~12% attach revenue at a small bundle discount.",
  },
  {
    id: "improve_seo",
    label: "Improve SEO",
    salesUplift: 0.14,
    conversionDelta: 0.1,
    marginGiveaway: 0,
    confidence: 55,
    assumption: "Complete titles, descriptions and keywords typically add ~14% qualified traffic over 30 days.",
  },
  {
    id: "add_images",
    label: "Add better images",
    salesUplift: 0.16,
    conversionDelta: 0.35,
    marginGiveaway: 0,
    confidence: 62,
    assumption: "Richer galleries typically lift listing conversion, worth ~16% more units.",
  },
];

const HORIZON_DAYS = 30;

export function simulate(product: Product, scenario: SimulatorScenarioId): SimulationResult {
  const s = SCENARIOS.find((x) => x.id === scenario) ?? SCENARIOS[0];
  const price = unitPrice(product);
  const margin = unitMargin(product);
  const baseUnits = velocityPerDay(product) * HORIZON_DAYS;
  const extraUnits = baseUnits * s.salesUplift;

  const revenueDelta = Math.round(extraUnits * price * (1 - s.marginGiveaway));
  const profitDelta = Math.round(
    extraUnits * (margin - price * s.marginGiveaway) - baseUnits * price * s.marginGiveaway,
  );

  return {
    scenario: s.id,
    label: s.label,
    revenueDelta,
    conversionDelta: s.conversionDelta,
    ordersDelta: Math.round(extraUnits),
    profitDelta,
    confidence: s.confidence,
    assumption: s.assumption,
    estimate: true,
  };
}

export function simulateAll(product: Product): SimulationResult[] {
  return SCENARIOS.map((s) => simulate(product, s.id)).sort((a, b) => b.revenueDelta - a.revenueDelta);
}
