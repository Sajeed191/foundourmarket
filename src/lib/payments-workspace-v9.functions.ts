/**
 * Payments Center v9.0 — Finance Workspace & Automation (staff-gated server functions).
 *
 * Read-only analytics plus audited, non-mutating workspace actions
 * (internal notes and review decisions written to the existing audit trail).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity, type StaffRole } from "./admin-guard.server";
import {
  buildFinanceWorkspace,
  workspaceSearch,
  addFinanceNote,
  recordReviewDecision,
} from "./payments-workspace-v9.server";

const PAY_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

export type {
  FinanceWorkspace,
  FinanceTask,
  TaskPriority,
  WorkspaceAction,
  DailyBrief,
  CalendarEvent,
  ApprovalItem,
  VendorPayoutCard,
  SearchHit,
  Suggestion,
  FinanceNote,
} from "./payments-workspace-v9.server";

export const getFinanceWorkspaceFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ windowDays: z.number().int().min(7).max(730).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v9.workspace");
    const result = await buildFinanceWorkspace(data.windowDays ?? 90);
    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "payments.v9.workspace",
      success: true,
    });
    return result;
  });

export const workspaceSearchFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ q: z.string().max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, PAY_STAFF, "payments.v9.search");
    return workspaceSearch(data.q);
  });

export const addFinanceNoteFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        entityId: z.string().min(1).max(200),
        body: z.string().min(1).max(2000),
        mention: z.string().max(120).nullable().optional(),
        author: z.string().max(120).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, PAY_STAFF, "payments.v9.note");
    await addFinanceNote({
      actorId: userId,
      entityId: data.entityId,
      body: data.body,
      mention: data.mention ?? null,
      author: data.author ?? null,
    });
    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "payments.v9.note",
      target: data.entityId,
      success: true,
    });
    return { ok: true };
  });

export const recordReviewDecisionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        ids: z.array(z.string().max(200)).min(1).max(200),
        queue: z.enum(["refunds", "payouts", "reviews", "exceptions"]),
        decision: z.enum(["approved", "rejected", "reviewed"]),
        by: z.string().max(120).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(
      userId,
      PAY_STAFF,
      `payments.v9.review.${data.queue}`,
    );
    const res = await recordReviewDecision({
      actorId: userId,
      ids: data.ids,
      queue: data.queue,
      decision: data.decision,
      by: data.by ?? null,
    });
    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: `payments.v9.review.${data.queue}`,
      success: true,
      detail: { decision: data.decision, count: res.recorded },
    });
    return res;
  });
