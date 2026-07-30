/**
 * Payments Center v6 — staff-gated read-only server function.
 * Reuses existing RBAC (`requireStaff`) and audit logging (`logSecurity`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, type StaffRole } from "./admin-guard.server";
import { buildGlobalFinance } from "./payments-global-v6.server";

const PAY_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

export type {
  GlobalFinance,
  ScopeKpis,
  Scope,
  CountryRow,
  CurrencyRow,
  GatewayRow,
  TaxRow,
  SettlementBlock,
  VendorRevenueRow,
  GlobalInsight,
  RegionSeriesPoint,
  NativeAmount,
} from "./payments-global-v6.server";

/** India / International / Global financial intelligence. */
export const getGlobalFinanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ windowDays: z.number().int().min(7).max(730).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v6.global");
    const result = await buildGlobalFinance(data.windowDays ?? 90);
    await logSecurity({ actorId: userId, actorRole: primaryRole, action: "payments.v6.global", success: true });
    return result;
  });
