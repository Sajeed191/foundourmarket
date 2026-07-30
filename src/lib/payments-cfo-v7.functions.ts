/**
 * Payments Center v7.0 — staff-gated read-only server function.
 * Reuses the existing RBAC guard (`requireStaff`) and audit trail (`logSecurity`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, type StaffRole } from "./admin-guard.server";
import { buildCFODashboard } from "./payments-cfo-v7.server";

const PAY_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

export type {
  CFODashboard,
  HealthScore,
  HealthFactor,
  Profitability,
  CashFlow,
  LiveRevenue,
  Forecast,
  CustomerIntel,
  VendorRow,
  GatewayRow,
  RefundIntel,
  SettlementCenter,
  TaxDashboard,
  CurrencyIntel,
  TimelineEvent,
  FinanceAlert,
  SmartRecommendation,
  RegionPerf,
  Rank,
} from "./payments-cfo-v7.server";

/** CFO dashboard — health, profitability, cash flow, forecast, intelligence. */
export const getCFODashboardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ windowDays: z.number().int().min(7).max(730).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v7.cfo");
    const result = await buildCFODashboard(data.windowDays ?? 90);
    await logSecurity({ actorId: userId, actorRole: primaryRole, action: "payments.v7.cfo", success: true });
    return result;
  });

/** Audit trail for CFO-grade exports (report generation is client-side from loaded rows). */
export const auditCFOExportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ report: z.string().max(80) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v7.export");
    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: `payments.v7.export.${data.report}`,
      success: true,
    });
    return { ok: true };
  });
