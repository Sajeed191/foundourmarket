/**
 * Returns & Refunds v2.0 — refund bank details server functions.
 *
 * Thin wrapper file: imports + createServerFn declarations only, so the
 * server-only service module never leaks into client bundles.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { refundBankInputSchema } from "@/lib/refund-bank/validation";
import {
  customerView,
  listAudit,
  listRecords,
  revealDetails,
  staffAction,
  submitDetails,
  type RefundBankRecord,
} from "@/lib/refund-bank/service.server";
import { requireStaff } from "@/lib/admin-guard.server";
import { REFUND_MANAGERS, REFUND_OPERATORS, getRecordByReturn } from "@/lib/refund-bank/service.server";

export type { RefundBankRecord };

/* ------------------------------- Customer -------------------------------- */

export const getMyRefundBankFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ returnId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    return customerView(userId, data.returnId);
  });

export const submitRefundBankFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => refundBankInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    return submitDetails(userId, data);
  });

/* --------------------------------- Staff --------------------------------- */

export const refundBankActionFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        returnId: z.string().uuid(),
        action: z.enum([
          "request",
          "remind",
          "verify",
          "reject",
          "request_update",
          "mark_sent",
          "set_reference",
        ]),
        note: z.string().max(500).optional(),
        reference: z.string().max(80).optional(),
        method: z.enum(["manual_bank", "cod", "gateway_failed"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    return staffAction(userId, data);
  });

export const revealRefundBankFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ returnId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    return revealDetails(userId, data.returnId);
  });

export const getRefundBankFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ returnId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, REFUND_OPERATORS, "refund.bank.read", data.returnId);
    return getRecordByReturn(data.returnId);
  });

export const listRefundBankFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, REFUND_OPERATORS, "refund.bank.list");
    return listRecords();
  });

export const refundBankAuditFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ bankId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, REFUND_MANAGERS, "refund.bank.audit", data.bankId);
    return listAudit(data.bankId);
  });
