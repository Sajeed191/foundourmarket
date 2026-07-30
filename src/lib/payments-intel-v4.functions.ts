/**
 * Payments Center v4 — Financial Intelligence server function (read-only, staff-gated).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, type StaffRole } from "./admin-guard.server";
import { buildFinancialIntelligence } from "./payments-intel-v4.server";

const PAY_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

export type {
  FinancialIntelligence,
  ExecutiveSummary,
  RevenueBreakdown,
  RankingBlock,
  FailureCenter,
  RefundCenter,
  SettlementIntel,
  CommissionBlock,
  CustomerInsights,
  RiskCard,
  Recommendation,
  AuditEntry,
} from "./payments-intel-v4.server";

export const getFinancialIntelligenceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ windowDays: z.number().int().min(7).max(730).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v4.intelligence");
    const result = await buildFinancialIntelligence(data.windowDays ?? 90);
    await logSecurity({ actorId: userId, actorRole: primaryRole, action: "payments.v4.intelligence", success: true });
    return result;
  });
