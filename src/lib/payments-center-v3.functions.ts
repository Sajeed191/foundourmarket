/**
 * Payments Center v3 — staff-gated read-only server functions.
 *
 * Only `admin`, `super_admin` and `manager` can read payment analytics.
 * These functions never write to payments, orders, refunds or gateways.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, type StaffRole } from "./admin-guard.server";
import { buildPaymentsOverview, buildLedger, buildPaymentDetail } from "./payments-center-v3.server";

const PAY_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

export type {
  PaymentsOverview,
  PaymentsKpis,
  RegionBlock,
  GatewayBlock,
  RefundBlock,
  ActivityItem,
  LedgerRow,
  LedgerResult,
  Bucket,
  DayPoint,
  HourPoint,
  Region,
  HealthBlock,
  HealthFactor,
  Insight,
  QuickCounts,
  VendorPayoutBlock,
  VendorPayoutRow,
  PaymentDetail,
  TimelineEvent,
} from "./payments-center-v3.server";


/** Executive overview: KPIs, region split, charts, gateways, refunds, activity. */
export const getPaymentsOverviewFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ windowDays: z.number().int().min(7).max(730).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v3.overview");
    const result = await buildPaymentsOverview(data.windowDays ?? 90);
    await logSecurity({ actorId: userId, actorRole: primaryRole, action: "payments.v3.overview", success: true });
    return result;
  });

/** Filtered / sorted / paginated payment ledger. */
export const getPaymentsLedgerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().max(160).optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        region: z.enum(["all", "india", "international"]).optional(),
        country: z.string().max(60).optional(),
        currency: z.string().max(10).optional(),
        gateway: z.string().max(40).optional(),
        method: z.string().max(40).optional(),
        status: z.string().max(40).optional(),
        orderStatus: z.string().max(40).optional(),
        minAmount: z.number().optional(),
        maxAmount: z.number().optional(),
        sort: z.enum(["recent", "oldest", "amount_desc", "amount_asc"]).optional(),
        page: z.number().int().min(0).max(100000).optional(),
        pageSize: z.number().int().min(10).max(200).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v3.ledger");
    const result = await buildLedger({
      ...data,
      page: data.page ?? 0,
      pageSize: data.pageSize ?? 50,
    });
    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "payments.v3.ledger",
      success: true,
      detail: { page: data.page ?? 0, status: data.status ?? "all", region: data.region ?? "all" },
    });
    return result;
  });

/** Read-only detail payload for one payment (drawer view). */
export const getPaymentDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ paymentId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v3.detail");
    const result = await buildPaymentDetail(data.paymentId);
    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "payments.v3.detail",
      success: true,
      detail: { payment_id: data.paymentId },
    });
    return result;
  });
