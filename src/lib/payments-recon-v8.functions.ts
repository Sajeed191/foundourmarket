/**
 * Payments Center v8.0 — staff-gated, read-only server functions.
 * Reuses the existing RBAC guard (`requireStaff`) and audit trail (`logSecurity`).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, type StaffRole } from "./admin-guard.server";
import { buildReconDashboard, searchFinancialAudit } from "./payments-recon-v8.server";

const PAY_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

export type {
  ReconDashboard,
  ReconciliationCenter,
  ReconLine,
  RevenueVerification,
  VerificationIssue,
  SettlementVerification,
  GatewayTimeline,
  GatewayBucket,
  LeakageFinding,
  CountryIntel,
  VendorFinance,
  ExecutiveInsight,
  AuditRecord,
  DrillRef,
} from "./payments-recon-v8.server";

/** Reconciliation, verification, gateway health, leakage, country & vendor finance. */
export const getReconDashboardFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ windowDays: z.number().int().min(7).max(730).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v8.recon");
    const result = await buildReconDashboard(data.windowDays ?? 90);
    await logSecurity({ actorId: userId, actorRole: primaryRole, action: "payments.v8.recon", success: true });
    return result;
  });

/** Financial Audit Explorer — traceable record lookup with full timeline. */
export const searchFinancialAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        query: z.string().max(120).optional(),
        from: z.string().max(20).optional(),
        to: z.string().max(20).optional(),
        gateway: z.string().max(40).optional(),
        currency: z.string().max(10).optional(),
        country: z.string().max(40).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v8.audit_search");
    const result = await searchFinancialAudit(data);
    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "payments.v8.audit_search",
      success: true,
      detail: { results: result.records.length },
    });
    return result;
  });

/** Audit trail for reconciliation exports (files are generated client-side from loaded rows). */
export const auditReconExportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ report: z.string().max(80) }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v8.export");
    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: `payments.v8.export.${data.report}`,
      success: true,
    });
    return { ok: true };
  });
