/**
 * Payments Center v5 — Finance Operations Hub server functions (staff-gated).
 *
 * Read-only analytics plus audited, non-mutating workspace actions
 * (export receipts, queue review marks, alert archiving).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, type StaffRole } from "./admin-guard.server";
import { buildFinanceOps, searchFinance, recordFinanceAction } from "./payments-ops-v5.server";

const PAY_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

export type {
  FinanceOps,
  OpsBoard,
  OpsCard,
  OpsAction,
  QueueItem,
  TimelineEvent,
  SettlementCalendar,
  CalendarDay,
  AlertCard,
  GatewayRow,
  CountryRow,
  Digest,
  ExportRecord,
  FinanceSearchHit,
} from "./payments-ops-v5.server";

export const getFinanceOpsFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ windowDays: z.number().int().min(7).max(730).optional() }).parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v5.ops");
    const result = await buildFinanceOps(data.windowDays ?? 90);
    await logSecurity({ actorId: userId, actorRole: primaryRole, action: "payments.v5.ops", success: true });
    return result;
  });

export const searchFinanceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ q: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, PAY_STAFF, "payments.v5.search");
    return searchFinance(data.q.slice(0, 120));
  });

export const recordFinanceActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        kind: z.enum(["export", "mark_reviewed", "archive_alert"]),
        entityId: z.string().max(200).nullable().optional(),
        dataset: z.string().max(120).nullable().optional(),
        rows: z.number().int().nullable().optional(),
        filters: z.record(z.string(), z.unknown()).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, `payments.v5.${data.kind}`);
    await recordFinanceAction({
      actorId: userId,
      kind: data.kind,
      entityId: data.entityId ?? null,
      dataset: data.dataset ?? null,
      rows: data.rows ?? null,
      filters: data.filters ?? null,
    });
    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: `payments.v5.${data.kind}`,
      target: data.entityId ?? data.dataset ?? null,
      success: true,
    });
    return { ok: true };
  });
