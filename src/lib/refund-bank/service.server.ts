/**
 * Returns & Refunds v2.0 — refund bank details service (SERVER ONLY).
 *
 * All authorization, encryption, masking, notification and audit logic for
 * secure customer bank detail collection lives here. Server functions in
 * `refund-bank.functions.ts` are thin wrappers over these helpers.
 *
 * Guarantees:
 *  - Sensitive fields are encrypted at rest (AES-256-GCM) and only decrypted
 *    inside `revealDetails`, which always writes an audit row.
 *  - Masked previews are the only representation stored in queryable columns.
 *  - Full account numbers are never written to audit rows or logs.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { clientIp, requireStaff, type StaffRole } from "@/lib/admin-guard.server";
import { notifyCustomer } from "@/lib/customer-notify.server";
import { decryptPayload, encryptPayload } from "./crypto.server";
import {
  maskAccount,
  maskHolder,
  maskIfsc,
  maskUpi,
  refundBankInputSchema,
  requiresBankDetails,
  type RefundBankStatus,
} from "./validation";

export const SUPPORT_EMAIL = "support@foundourmarket.com";

/** Full access: may reveal, verify, reject and mark refunds sent. */
export const REFUND_MANAGERS: StaffRole[] = ["admin", "super_admin", "manager"];
/** Workflow access: may request details, remind and ask for updates. */
export const REFUND_OPERATORS: StaffRole[] = ["admin", "super_admin", "manager", "support"];

export type RefundBankRecord = {
  id: string;
  return_id: string;
  order_id: string;
  user_id: string;
  status: RefundBankStatus;
  masked_account: string | null;
  masked_upi: string | null;
  masked_holder: string | null;
  bank_name: string | null;
  branch_name: string | null;
  account_type: string | null;
  country: string | null;
  currency: string | null;
  customer_notes: string | null;
  rejection_reason: string | null;
  refund_reference: string | null;
  requested_at: string | null;
  submitted_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  refund_sent_at: string | null;
  last_reminder_at: string | null;
  reminder_count: number;
  updated_at: string | null;
  created_at: string;
};

const SAFE_COLUMNS =
  "id,return_id,order_id,user_id,status,masked_account,masked_upi,masked_holder,bank_name,branch_name,account_type,country,currency,customer_notes,rejection_reason,refund_reference,requested_at,submitted_at,verified_at,verified_by,refund_sent_at,last_reminder_at,reminder_count,updated_at,created_at";

const db = () => supabaseAdmin as unknown as {
  from: (t: string) => any;
};

/* --------------------------------- Audit --------------------------------- */

export async function auditBank(entry: {
  bankId: string | null;
  returnId: string | null;
  actorId: string | null;
  actorRole: string | null;
  action: string;
  detail?: Record<string, unknown>;
  withIp?: boolean;
}): Promise<void> {
  try {
    await db().from("refund_bank_audit").insert({
      refund_bank_id: entry.bankId,
      return_id: entry.returnId,
      actor_id: entry.actorId,
      actor_role: entry.actorRole,
      action: entry.action,
      detail: entry.detail ?? {},
      source_ip: entry.withIp ? clientIp() : null,
    });
  } catch {
    /* audit must never break the workflow */
  }
}

/* ------------------------------ Notifications ----------------------------- */

const link = (returnId: string) => `/account/refund-details?return=${returnId}`;

async function notify(
  userId: string | null,
  returnId: string,
  title: string,
  body: string,
  priority: "normal" | "high" = "normal",
  actorId?: string | null,
) {
  await notifyCustomer({
    userId,
    category: "refund",
    type: "refund_update",
    title,
    body: `${body} Need help? Write to ${SUPPORT_EMAIL}.`,
    link: link(returnId),
    priority,
    data: { return_id: returnId },
    actorId: actorId ?? null,
  });
}

/* -------------------------------- Reads ---------------------------------- */

export async function getRecordByReturn(returnId: string): Promise<RefundBankRecord | null> {
  const { data } = await db()
    .from("refund_bank_details")
    .select(SAFE_COLUMNS)
    .eq("return_id", returnId)
    .maybeSingle();
  return (data as RefundBankRecord) ?? null;
}

/** All masked records — powers the admin dashboard counters. */
export async function listRecords(): Promise<RefundBankRecord[]> {
  const { data } = await db()
    .from("refund_bank_details")
    .select(SAFE_COLUMNS)
    .order("updated_at", { ascending: false });
  return (data ?? []) as RefundBankRecord[];
}

export async function listAudit(bankId: string) {
  const { data } = await db()
    .from("refund_bank_audit")
    .select("id,action,actor_id,actor_role,detail,source_ip,created_at")
    .eq("refund_bank_id", bankId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as {
    id: number;
    action: string;
    actor_id: string | null;
    actor_role: string | null;
    detail: Record<string, unknown>;
    source_ip: string | null;
    created_at: string;
  }[];
}

/* ------------------------------ Customer side ----------------------------- */

/** The customer's own view of a return + its bank-detail request. */
export async function customerView(userId: string, returnId: string) {
  const { data: ret } = await db()
    .from("returns")
    .select("id,user_id,order_id,status,refund_amount,refund_status,resolution_type,refund_method")
    .eq("id", returnId)
    .maybeSingle();
  if (!ret || ret.user_id !== userId) throw new Error("Return not found.");

  const { data: order } = await db()
    .from("orders")
    .select("currency,total")
    .eq("id", ret.order_id)
    .maybeSingle();

  const record = await getRecordByReturn(returnId);
  return {
    return: {
      id: ret.id as string,
      order_id: ret.order_id as string,
      status: ret.status as string,
      refund_amount: Number(ret.refund_amount) || 0,
      refund_status: ret.refund_status as string,
      resolution_type: ret.resolution_type as string,
      refund_method: (ret.refund_method as string) ?? "gateway",
      currency: (order?.currency as string) ?? "INR",
    },
    record,
    editable:
      requiresBankDetails(ret.refund_method) &&
      (!record || ["requested", "update_requested", "rejected"].includes(record.status)),
  };
}

/** Customer submits (or resubmits) their bank details. */
export async function submitDetails(userId: string, raw: unknown) {
  const input = refundBankInputSchema.parse(raw);

  const { data: ret } = await db()
    .from("returns")
    .select("id,user_id,order_id,refund_method")
    .eq("id", input.returnId)
    .maybeSingle();
  if (!ret || ret.user_id !== userId) throw new Error("Return not found.");
  if (!requiresBankDetails(ret.refund_method)) {
    throw new Error("This refund is processed automatically — bank details are not required.");
  }

  const existing = await getRecordByReturn(input.returnId);
  if (existing && !["requested", "update_requested", "rejected"].includes(existing.status)) {
    throw new Error("These details are already submitted and locked for review.");
  }

  const enc = encryptPayload({
    accountHolderName: input.accountHolderName,
    accountNumber: input.accountNumber,
    ifsc: input.ifsc,
    upiId: input.upiId,
  });

  const patch = {
    return_id: input.returnId,
    order_id: ret.order_id,
    user_id: userId,
    status: "submitted" as const,
    payload_ciphertext: enc.ciphertext,
    payload_iv: enc.iv,
    payload_tag: enc.tag,
    key_version: enc.keyVersion,
    masked_account: maskAccount(input.accountNumber),
    masked_upi: input.upiId ? maskUpi(input.upiId) : null,
    masked_holder: maskHolder(input.accountHolderName),
    bank_name: input.bankName,
    branch_name: input.branchName || null,
    account_type: input.accountType,
    country: input.country,
    currency: input.currency,
    customer_notes: input.notes || null,
    rejection_reason: null,
    submitted_at: new Date().toISOString(),
  };

  let bankId = existing?.id ?? null;
  if (existing) {
    const { error } = await db().from("refund_bank_details").update(patch).eq("id", existing.id);
    if (error) throw new Error(error.message);
  } else {
    const { data, error } = await db()
      .from("refund_bank_details")
      .insert(patch)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    bankId = data.id as string;
  }

  await auditBank({
    bankId,
    returnId: input.returnId,
    actorId: userId,
    actorRole: "customer",
    action: "bank_details.submitted",
    detail: { bank: input.bankName, country: input.country, masked: maskAccount(input.accountNumber) },
  });
  await notify(
    userId,
    input.returnId,
    "Bank details received",
    "Thanks — we've received your bank details and our team is verifying them.",
  );
  return { ok: true, status: "submitted" as const };
}

/* -------------------------------- Staff side ------------------------------ */

export type StaffAction =
  | "request"
  | "remind"
  | "verify"
  | "reject"
  | "request_update"
  | "mark_sent"
  | "set_reference";

export async function staffAction(
  userId: string,
  input: { returnId: string; action: StaffAction; note?: string; reference?: string; method?: string },
) {
  const privileged: StaffAction[] = ["verify", "reject", "mark_sent", "set_reference"];
  const allowed = privileged.includes(input.action) ? REFUND_MANAGERS : REFUND_OPERATORS;
  const { primaryRole } = await requireStaff(
    userId,
    allowed,
    `refund.bank.${input.action}`,
    input.returnId,
  );

  const { data: ret } = await db()
    .from("returns")
    .select("id,user_id,order_id,refund_amount,refund_method")
    .eq("id", input.returnId)
    .maybeSingle();
  if (!ret) throw new Error("Return not found.");

  let record = await getRecordByReturn(input.returnId);
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  let title = "";
  let body = "";
  let priority: "normal" | "high" = "normal";

  switch (input.action) {
    case "request": {
      // Flag the return as a manual refund so the customer form unlocks.
      const method = input.method && input.method !== "gateway" ? input.method : "manual_bank";
      await db().from("returns").update({ refund_method: method }).eq("id", input.returnId);
      patch.status = "requested";
      patch.requested_at = now;
      patch.requested_by = userId;
      title = "Bank details required for your refund";
      body =
        "Your refund has been approved. Please submit your bank account details so we can transfer your refund.";
      priority = "high";
      break;
    }
    case "remind":
      patch.last_reminder_at = now;
      patch.reminder_count = (record?.reminder_count ?? 0) + 1;
      title = "Reminder: bank details needed";
      body = "We still need your bank account details to release your approved refund.";
      priority = "high";
      break;
    case "verify":
      if (!record || record.status !== "submitted") throw new Error("No submitted details to verify.");
      patch.status = "verified";
      patch.verified_at = now;
      patch.verified_by = userId;
      patch.rejection_reason = null;
      title = "Bank details verified";
      body = "Your bank details have been verified. Your refund is being processed.";
      break;
    case "reject":
      if (!record) throw new Error("No details submitted yet.");
      patch.status = "rejected";
      patch.rejection_reason = input.note ?? "Details could not be verified.";
      title = "Bank details could not be verified";
      body = `${input.note ?? "The details you submitted could not be verified."} Please submit corrected bank details.`;
      priority = "high";
      break;
    case "request_update":
      if (!record) throw new Error("No details submitted yet.");
      patch.status = "update_requested";
      patch.rejection_reason = input.note ?? "Please review and update your bank details.";
      title = "Please update your bank details";
      body = input.note ?? "Please review and update the bank details you submitted.";
      priority = "high";
      break;
    case "mark_sent":
      if (!record || !["verified", "submitted"].includes(record.status)) {
        throw new Error("Verify the bank details before marking the refund sent.");
      }
      patch.status = "refunded";
      patch.refund_sent_at = now;
      patch.refund_sent_by = userId;
      if (input.reference) patch.refund_reference = input.reference;
      title = "Refund sent";
      body = `Your refund has been transferred${input.reference ? ` (reference ${input.reference})` : ""}. It may take 3–5 business days to appear in your account.`;
      break;
    case "set_reference":
      if (!input.reference) throw new Error("Reference is required.");
      patch.refund_reference = input.reference;
      break;
  }

  if (!record) {
    const { data, error } = await db()
      .from("refund_bank_details")
      .insert({
        return_id: input.returnId,
        order_id: ret.order_id,
        user_id: ret.user_id,
        status: (patch.status as string) ?? "requested",
        ...patch,
      })
      .select(SAFE_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    record = data as RefundBankRecord;
  } else {
    const { data, error } = await db()
      .from("refund_bank_details")
      .update(patch)
      .eq("id", record.id)
      .select(SAFE_COLUMNS)
      .single();
    if (error) throw new Error(error.message);
    record = data as RefundBankRecord;
  }

  await auditBank({
    bankId: record.id,
    returnId: input.returnId,
    actorId: userId,
    actorRole: primaryRole,
    action: `bank_details.${input.action}`,
    detail: {
      note: input.note ?? null,
      reference: input.reference ?? null,
      status: record.status,
    },
    withIp: true,
  });

  if (title) await notify(ret.user_id as string, input.returnId, title, body, priority, userId);

  return { ok: true, record };
}

/** Decrypt full details for an authorized manager. Always audited. */
export async function revealDetails(userId: string, returnId: string) {
  const { primaryRole } = await requireStaff(
    userId,
    REFUND_MANAGERS,
    "refund.bank.view",
    returnId,
  );
  const { data } = await db()
    .from("refund_bank_details")
    .select("id,payload_ciphertext,payload_iv,payload_tag")
    .eq("return_id", returnId)
    .maybeSingle();
  if (!data) throw new Error("No bank details on file.");

  const payload = decryptPayload(data.payload_ciphertext, data.payload_iv, data.payload_tag);
  if (!payload) throw new Error("No bank details on file.");

  await auditBank({
    bankId: data.id as string,
    returnId,
    actorId: userId,
    actorRole: primaryRole,
    action: "bank_details.viewed",
    detail: { masked: maskAccount(payload.accountNumber) },
    withIp: true,
  });

  return {
    accountHolderName: payload.accountHolderName,
    accountNumber: payload.accountNumber,
    ifsc: payload.ifsc,
    ifscMasked: payload.ifsc ? maskIfsc(payload.ifsc) : "",
    upiId: payload.upiId,
  };
}
