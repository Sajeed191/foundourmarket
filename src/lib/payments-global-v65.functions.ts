/**
 * Payments Center v6.5 — staff-gated read-only server function.
 * Reuses existing RBAC (`requireStaff`) and audit logging (`logSecurity`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, type StaffRole } from "./admin-guard.server";
import { buildRegionalBreakdown } from "./payments-global-v65.server";

const PAY_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

export type {
  RegionalBreakdown,
  ScopeBreakdown,
  RegionScope,
  RegionalComparison,
  RegionalComparisonRow,
  BreakdownInsight,
  PeriodRevenue,
  RankRow,
} from "./payments-global-v65.server";

/** India / International / Global financial breakdown. */
export const getRegionalBreakdownFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ windowDays: z.number().int().min(7).max(730).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v65.breakdown");
    const result = await buildRegionalBreakdown(data.windowDays ?? 90);
    await logSecurity({ actorId: userId, actorRole: primaryRole, action: "payments.v65.breakdown", success: true });
    return result;
  });
