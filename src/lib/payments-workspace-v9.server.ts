/**
 * Payments Center v9.0 — Finance Workspace & Automation (server-only).
 *
 * Operations-first layer on top of the existing finance stack. It turns real
 * rows into WORK: tasks, a daily brief, a finance calendar, approval queues,
 * a vendor payout workspace, universal finance search and one automation
 * suggestion at a time.
 *
 * STRICT RULES
 * - No schema, checkout, gateway, settlement or payout logic changes.
 * - Financial rows are never mutated here. The only writes are internal notes
 *   and review decisions, appended to the existing `admin_activity_logs` trail.
 * - Never fabricate data. Anything without a source is `null` / empty so the UI
 *   can render an honest "No data available".
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const num = (v: unknown) => Number(v ?? 0) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;

const RATES: Record<string, number> = {
  INR: 1, USD: 88, EUR: 95, GBP: 112, AED: 24, CAD: 64, AUD: 58,
  SGD: 65, JPY: 0.58, CHF: 100, NZD: 53, SAR: 23.5,
};
const toINR = (amount: number, currency: string | null | undefined) => {
  const r = RATES[(currency ?? "INR").toUpperCase()];
  return r == null ? amount : amount * r;
};

const SUCCESS = new Set(["succeeded", "paid", "captured", "settled", "success"]);
const FAILED = new Set(["failed", "cancelled", "canceled", "declined", "error"]);
const PENDING_REFUND = new Set(["pending", "requested", "initiated", "processing", "review"]);
const PENDING_PAYOUT = new Set(["pending", "scheduled", "queued", "processing", "requested"]);

const mask = (id: string | null | undefined) =>
  !id ? null : id.length <= 10 ? `${id.slice(0, 3)}••••` : `${id.slice(0, 6)}••••${id.slice(-4)}`;

const dayKey = (iso: string) => iso.slice(0, 10);
const addDays = (iso: string, d: number) =>
  new Date(new Date(iso).getTime() + d * 86_400_000).toISOString();

// ─────────────────────────────────────────────────────────────── public types

export type TaskPriority = "critical" | "high" | "medium" | "low";

export type WorkspaceAction =
  | "ledger_failed"
  | "ledger_pending"
  | "ledger_refunds"
  | "ledger_today"
  | "ledger_all"
  | "approvals_refunds"
  | "approvals_payouts"
  | "approvals_reviews"
  | "approvals_exceptions"
  | "vendors"
  | "calendar"
  | "recon"
  | "none";

export type FinanceTask = {
  id: string;
  kind:
    | "refund_review"
    | "payment_mismatch"
    | "payout_pending"
    | "high_refund_rate"
    | "settlement_recon"
    | "export_requested"
    | "gateway_spike";
  priority: TaskPriority;
  title: string;
  detail: string;
  /** Estimated financial impact in INR (indicative FX). `null` when unquantifiable. */
  impact: number | null;
  count: number;
  due_at: string | null;
  /** Admin who claimed the task through the internal note trail, if any. */
  assigned_to: string | null;
  action: WorkspaceAction;
  /** Record ids backing the task — nothing here is fabricated. */
  ids: string[];
};

export type DailyBrief = {
  has_data: boolean;
  paragraph: string;
  collected: number;
  orders: number;
  refund_rate: number | null;
  issues: number;
  pending_payouts: number;
  generated_at: string;
};

export type CalendarEvent = {
  id: string;
  date: string;
  kind: "settlement" | "payout" | "refund_batch" | "tax" | "export";
  label: string;
  amount: number | null;
  count: number;
  /** Indicative entries are derived (e.g. T+2 settlement), never recorded facts. */
  indicative: boolean;
};

export type ApprovalItem = {
  id: string;
  queue: "refunds" | "payouts" | "reviews" | "exceptions";
  title: string;
  subtitle: string;
  amount: number | null;
  currency: string;
  age_hours: number;
  risk: "low" | "medium" | "high";
  reason: string;
  reviewed: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
};

export type VendorPayoutCard = {
  vendor_id: string;
  name: string;
  status: string;
  currency: string;
  revenue: number;
  refunds: number | null;
  balance: number;
  pending_payout: number;
  last_payout: { amount: number; at: string } | null;
  next_payout_date: string | null;
  payout_status: "pending" | "scheduled" | "paid" | "none";
};

export type SearchHit = {
  id: string;
  kind: "order" | "payment" | "refund" | "vendor" | "customer" | "gateway" | "country" | "currency";
  label: string;
  detail: string;
  amount: number | null;
  currency: string | null;
  at: string | null;
  /** Drives the exact drawer / filtered ledger the UI must open. */
  open: { paymentId?: string; ledger?: Record<string, string | undefined>; tab?: string };
};

export type Suggestion = {
  id: string;
  title: string;
  evidence: string;
  confidence: number;
  impact: number | null;
  action: WorkspaceAction;
} | null;

export type FinanceNote = {
  id: string;
  entity_id: string;
  body: string;
  mention: string | null;
  author: string | null;
  at: string;
  resolved_by: string | null;
  resolved_at: string | null;
};

export type FinanceWorkspace = {
  window_days: number;
  brief: DailyBrief;
  tasks: FinanceTask[];
  calendar: CalendarEvent[];
  approvals: {
    refunds: ApprovalItem[];
    payouts: ApprovalItem[];
    reviews: ApprovalItem[];
    exceptions: ApprovalItem[];
  };
  vendors: VendorPayoutCard[];
  suggestion: Suggestion;
  notes: FinanceNote[];
  generated_at: string;
};

// ──────────────────────────────────────────────────────────────── main engine

export async function buildFinanceWorkspace(windowDays: number): Promise<FinanceWorkspace> {
  const sinceIso = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const todayKey = dayKey(new Date().toISOString());

  const [ordersR, paymentsR, refundsR, payoutsR, commissionsR, vendorsR, logsR] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("id,total,currency,status,payment_status,created_at,paid_at,contact_email")
      .gte("created_at", sinceIso)
      .limit(5000),
    supabaseAdmin
      .from("payments")
      .select("id,order_id,status,method,amount,currency,fee,created_at,transaction_id,razorpay_payment_id")
      .gte("created_at", sinceIso)
      .limit(5000),
    supabaseAdmin
      .from("refunds")
      .select("id,order_id,payment_id,amount,currency,status,reason,created_at")
      .gte("created_at", sinceIso)
      .limit(3000),
    supabaseAdmin
      .from("vendor_payouts")
      .select("id,vendor_id,amount,currency,status,period_start,period_end,processed_at,created_at")
      .limit(2000),
    supabaseAdmin
      .from("vendor_commissions")
      .select("vendor_id,amount,currency,status,created_at,payout_id")
      .limit(5000),
    supabaseAdmin.from("vendors").select("id,business_name,status,country").limit(500),
    supabaseAdmin
      .from("admin_activity_logs")
      .select("id,action,actor_id,entity_id,entity_type,metadata,created_at")
      .like("action", "finance.%")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const orders = ordersR.data ?? [];
  const payments = paymentsR.data ?? [];
  const refunds = refundsR.data ?? [];
  const payouts = payoutsR.data ?? [];
  const commissions = commissionsR.data ?? [];
  const vendors = vendorsR.data ?? [];
  const logs = logsR.data ?? [];

  const okPayments = payments.filter((p) => SUCCESS.has((p.status ?? "").toLowerCase()));
  const failedPayments = payments.filter((p) => FAILED.has((p.status ?? "").toLowerCase()));
  const collectedTotal = okPayments.reduce((s, p) => s + toINR(num(p.amount), p.currency), 0);

  const todayPayments = okPayments.filter((p) => dayKey(p.created_at) === todayKey);
  const todayCollected = todayPayments.reduce((s, p) => s + toINR(num(p.amount), p.currency), 0);
  const todayOrders = new Set(todayPayments.map((p) => p.order_id)).size;

  const refundValue = refunds
    .filter((r) => !FAILED.has((r.status ?? "").toLowerCase()))
    .reduce((s, r) => s + toINR(num(r.amount), r.currency), 0);
  const refundRate = collectedTotal > 0 ? round2((refundValue / collectedTotal) * 100) : null;

  // note / decision trail (existing audit log — no new tables)
  const notes: FinanceNote[] = logs
    .filter((l) => l.action === "finance.note")
    .map((l) => {
      const m = (l.metadata ?? {}) as Record<string, unknown>;
      return {
        id: String(l.id),
        entity_id: l.entity_id ?? "",
        body: String(m.body ?? ""),
        mention: (m.mention as string) ?? null,
        author: (m.author as string) ?? (l.actor_id ? mask(l.actor_id) : null),
        at: l.created_at,
        resolved_by: (m.resolved_by as string) ?? null,
        resolved_at: (m.resolved_at as string) ?? null,
      };
    });

  const decided = new Map<string, { by: string | null; at: string }>();
  for (const l of logs) {
    if (l.action !== "finance.review" || !l.entity_id) continue;
    if (!decided.has(l.entity_id)) {
      const m = (l.metadata ?? {}) as Record<string, unknown>;
      decided.set(l.entity_id, { by: (m.by as string) ?? mask(l.actor_id), at: l.created_at });
    }
  }
  const assignedFor = (taskId: string) =>
    notes.find((n) => n.entity_id === taskId && n.mention)?.mention ?? null;

  // ── task signals (each one proven by concrete rows) ────────────────────────
  const tasks: FinanceTask[] = [];

  const pendingRefunds = refunds.filter((r) => PENDING_REFUND.has((r.status ?? "").toLowerCase()));
  if (pendingRefunds.length) {
    const impact = pendingRefunds.reduce((s, r) => s + toINR(num(r.amount), r.currency), 0);
    const oldest = pendingRefunds.reduce((a, b) => (a.created_at < b.created_at ? a : b));
    tasks.push({
      id: "task_refund_review",
      kind: "refund_review",
      priority: pendingRefunds.length > 10 || impact > 100000 ? "critical" : "high",
      title: `${pendingRefunds.length} refund${pendingRefunds.length > 1 ? "s" : ""} awaiting review`,
      detail: `Oldest opened ${new Date(oldest.created_at).toLocaleDateString("en-IN")}. Approve or reject in the refund queue.`,
      impact: round2(impact),
      count: pendingRefunds.length,
      due_at: addDays(oldest.created_at, 2),
      assigned_to: assignedFor("task_refund_review"),
      action: "approvals_refunds",
      ids: pendingRefunds.map((r) => r.id),
    });
  }

  const paymentsByOrder = new Map<string, typeof payments>();
  for (const p of payments) {
    const list = paymentsByOrder.get(p.order_id) ?? [];
    list.push(p);
    paymentsByOrder.set(p.order_id, list);
  }
  const mismatches = orders.filter((o) => {
    const ps = (o.payment_status ?? "").toLowerCase();
    const list = paymentsByOrder.get(o.id) ?? [];
    const hasOk = list.some((p) => SUCCESS.has((p.status ?? "").toLowerCase()));
    if (SUCCESS.has(ps) && !hasOk) return true;
    if (!SUCCESS.has(ps) && hasOk) return true;
    return false;
  });
  if (mismatches.length) {
    tasks.push({
      id: "task_payment_mismatch",
      kind: "payment_mismatch",
      priority: "critical",
      title: `${mismatches.length} order/payment mismatch${mismatches.length > 1 ? "es" : ""} detected`,
      detail: "Order payment status does not agree with the recorded payment rows. Reconcile before reporting.",
      impact: round2(mismatches.reduce((s, o) => s + toINR(num(o.total), o.currency), 0)),
      count: mismatches.length,
      due_at: null,
      assigned_to: assignedFor("task_payment_mismatch"),
      action: "recon",
      ids: mismatches.map((o) => o.id),
    });
  }

  const pendingPayouts = payouts.filter((p) => PENDING_PAYOUT.has((p.status ?? "").toLowerCase()));
  if (pendingPayouts.length) {
    tasks.push({
      id: "task_payout_pending",
      kind: "payout_pending",
      priority: pendingPayouts.length > 5 ? "high" : "medium",
      title: `${pendingPayouts.length} vendor payout${pendingPayouts.length > 1 ? "s" : ""} pending`,
      detail: "Review vendor balances and approve the payout batch.",
      impact: round2(pendingPayouts.reduce((s, p) => s + toINR(num(p.amount), p.currency), 0)),
      count: pendingPayouts.length,
      due_at: pendingPayouts.map((p) => p.period_end).filter(Boolean).sort()[0] ?? null,
      assigned_to: assignedFor("task_payout_pending"),
      action: "approvals_payouts",
      ids: pendingPayouts.map((p) => p.id),
    });
  }

  if (refundRate != null && refundRate > 5) {
    tasks.push({
      id: "task_high_refund_rate",
      kind: "high_refund_rate",
      priority: refundRate > 12 ? "critical" : "high",
      title: `Refund rate at ${refundRate.toFixed(1)}%`,
      detail: `${refunds.length} refunds against ${okPayments.length} successful payments in the last ${windowDays} days.`,
      impact: round2(refundValue),
      count: refunds.length,
      due_at: null,
      assigned_to: assignedFor("task_high_refund_rate"),
      action: "ledger_refunds",
      ids: refunds.map((r) => r.id).slice(0, 100),
    });
  }

  // Settlement reconciliation: successful payments older than 3 days whose order
  // still isn't marked paid — these never close the books.
  const staleIso = new Date(Date.now() - 3 * 86_400_000).toISOString();
  const unsettled = okPayments.filter((p) => {
    if (p.created_at > staleIso) return false;
    const o = orders.find((x) => x.id === p.order_id);
    return !!o && !SUCCESS.has((o.payment_status ?? "").toLowerCase());
  });
  if (unsettled.length) {
    tasks.push({
      id: "task_settlement_recon",
      kind: "settlement_recon",
      priority: "high",
      title: `${unsettled.length} payment${unsettled.length > 1 ? "s" : ""} need settlement reconciliation`,
      detail: "Captured more than 3 days ago but the order books remain open.",
      impact: round2(unsettled.reduce((s, p) => s + toINR(num(p.amount), p.currency), 0)),
      count: unsettled.length,
      due_at: null,
      assigned_to: assignedFor("task_settlement_recon"),
      action: "recon",
      ids: unsettled.map((p) => p.id),
    });
  }

  // Gateway failure spike — last 24h vs the window baseline.
  const dayIso = new Date(Date.now() - 86_400_000).toISOString();
  const last24 = payments.filter((p) => p.created_at >= dayIso);
  const failed24 = last24.filter((p) => FAILED.has((p.status ?? "").toLowerCase()));
  const rate24 = last24.length >= 5 ? (failed24.length / last24.length) * 100 : null;
  const baseRate = payments.length ? (failedPayments.length / payments.length) * 100 : 0;
  if (rate24 != null && rate24 > 20 && rate24 > baseRate * 1.5) {
    tasks.push({
      id: "task_gateway_spike",
      kind: "gateway_spike",
      priority: "critical",
      title: `Gateway failure spike — ${rate24.toFixed(0)}% in the last 24h`,
      detail: `Baseline is ${baseRate.toFixed(1)}% across the ${windowDays}-day window.`,
      impact: round2(failed24.reduce((s, p) => s + toINR(num(p.amount), p.currency), 0)),
      count: failed24.length,
      due_at: null,
      assigned_to: assignedFor("task_gateway_spike"),
      action: "ledger_failed",
      ids: failed24.map((p) => p.id),
    });
  }

  const exportsToday = logs.filter(
    (l) => l.action.startsWith("finance.export") && dayKey(l.created_at) === todayKey,
  );
  if (exportsToday.length) {
    tasks.push({
      id: "task_export_requested",
      kind: "export_requested",
      priority: "low",
      title: `${exportsToday.length} export${exportsToday.length > 1 ? "s" : ""} requested today`,
      detail: "Confirm the requested finance exports were delivered to their requesters.",
      impact: null,
      count: exportsToday.length,
      due_at: null,
      assigned_to: assignedFor("task_export_requested"),
      action: "calendar",
      ids: exportsToday.map((l) => String(l.id)),
    });
  }

  const rank: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  tasks.sort((a, b) => rank[a.priority] - rank[b.priority] || (b.impact ?? 0) - (a.impact ?? 0));

  // ── daily brief (one paragraph, real numbers only) ─────────────────────────
  const hasAny = orders.length > 0 || payments.length > 0;
  const money = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  const issueCount = tasks.filter((t) => t.priority === "critical" || t.priority === "high").length;
  const briefParts: string[] = [];
  briefParts.push(
    todayPayments.length
      ? `Today's finance summary: ${money(todayCollected)} collected across ${todayOrders} order${todayOrders === 1 ? "" : "s"}.`
      : `Today's finance summary: no payments collected yet today; ${money(collectedTotal)} collected across the last ${windowDays} days.`,
  );
  if (refundRate != null) briefParts.push(`Refund rate ${refundRate.toFixed(1)}%.`);
  briefParts.push(
    issueCount
      ? `${issueCount} issue${issueCount === 1 ? "" : "s"} require attention.`
      : "No issues require attention.",
  );
  if (pendingPayouts.length)
    briefParts.push(
      `${pendingPayouts.length} vendor payout${pendingPayouts.length === 1 ? " is" : "s are"} pending.`,
    );

  const brief: DailyBrief = {
    has_data: hasAny,
    paragraph: hasAny
      ? briefParts.join(" ")
      : "No finance activity recorded yet. Your daily brief appears as soon as the marketplace records its first order or payment.",
    collected: round2(todayCollected),
    orders: todayOrders,
    refund_rate: refundRate,
    issues: issueCount,
    pending_payouts: pendingPayouts.length,
    generated_at: new Date().toISOString(),
  };

  // ── calendar ───────────────────────────────────────────────────────────────
  const calendar: CalendarEvent[] = [];
  const settleMap = new Map<string, { amount: number; count: number }>();
  for (const p of okPayments) {
    const d = dayKey(addDays(p.created_at, 2)); // indicative T+2 settlement
    const cur = settleMap.get(d) ?? { amount: 0, count: 0 };
    cur.amount += toINR(num(p.amount), p.currency);
    cur.count += 1;
    settleMap.set(d, cur);
  }
  for (const [date, v] of settleMap) {
    calendar.push({
      id: `settle_${date}`,
      date,
      kind: "settlement",
      label: `Settlement (T+2) · ${v.count} payment${v.count === 1 ? "" : "s"}`,
      amount: round2(v.amount),
      count: v.count,
      indicative: true,
    });
  }
  for (const p of payouts) {
    const date = dayKey(p.processed_at ?? p.period_end ?? p.created_at);
    calendar.push({
      id: `payout_${p.id}`,
      date,
      kind: "payout",
      label: `Vendor payout · ${(p.status ?? "pending").toLowerCase()}`,
      amount: round2(toINR(num(p.amount), p.currency)),
      count: 1,
      indicative: false,
    });
  }
  const refundBatch = new Map<string, { amount: number; count: number }>();
  for (const r of refunds) {
    const d = dayKey(r.created_at);
    const cur = refundBatch.get(d) ?? { amount: 0, count: 0 };
    cur.amount += toINR(num(r.amount), r.currency);
    cur.count += 1;
    refundBatch.set(d, cur);
  }
  for (const [date, v] of refundBatch) {
    calendar.push({
      id: `refunds_${date}`,
      date,
      kind: "refund_batch",
      label: `Refund batch · ${v.count} refund${v.count === 1 ? "" : "s"}`,
      amount: round2(v.amount),
      count: v.count,
      indicative: false,
    });
  }
  for (const l of logs.filter((x) => x.action.startsWith("finance.export"))) {
    calendar.push({
      id: `export_${l.id}`,
      date: dayKey(l.created_at),
      kind: "export",
      label: `Export · ${String((l.metadata as Record<string, unknown> | null)?.dataset ?? l.entity_type ?? "finance")}`,
      amount: null,
      count: 1,
      indicative: false,
    });
  }
  // Indicative statutory dates only for months that actually contain activity.
  const activeMonths = new Set(
    [...okPayments.map((p) => p.created_at), ...refunds.map((r) => r.created_at)].map((d) => d.slice(0, 7)),
  );
  for (const m of activeMonths) {
    calendar.push({
      id: `tax_${m}`,
      date: `${m}-20`,
      kind: "tax",
      label: "GST filing deadline (indicative)",
      amount: null,
      count: 1,
      indicative: true,
    });
  }
  calendar.sort((a, b) => a.date.localeCompare(b.date));

  // ── approval queues ────────────────────────────────────────────────────────
  const hours = (iso: string) => Math.max(0, (Date.now() - new Date(iso).getTime()) / 3_600_000);
  const decision = (id: string) => decided.get(id) ?? null;

  const refundQueue: ApprovalItem[] = pendingRefunds.map((r) => {
    const inr = toINR(num(r.amount), r.currency);
    const d = decision(r.id);
    return {
      id: r.id,
      queue: "refunds",
      title: `Refund ${mask(r.id)}`,
      subtitle: `Order ${mask(r.order_id)}${r.reason ? ` · ${r.reason}` : ""}`,
      amount: round2(num(r.amount)),
      currency: r.currency ?? "INR",
      age_hours: round2(hours(r.created_at)),
      risk: inr > 25000 ? "high" : inr > 5000 ? "medium" : "low",
      reason: r.reason ?? "No reason recorded",
      reviewed: !!d,
      reviewed_by: d?.by ?? null,
      reviewed_at: d?.at ?? null,
    };
  });

  const vendorName = new Map(vendors.map((v) => [v.id, v.business_name]));
  const payoutQueue: ApprovalItem[] = pendingPayouts.map((p) => {
    const d = decision(p.id);
    return {
      id: p.id,
      queue: "payouts",
      title: vendorName.get(p.vendor_id) ?? `Vendor ${mask(p.vendor_id)}`,
      subtitle: `${p.period_start ? dayKey(p.period_start) : "—"} → ${p.period_end ? dayKey(p.period_end) : "—"}`,
      amount: round2(num(p.amount)),
      currency: p.currency ?? "INR",
      age_hours: round2(hours(p.created_at)),
      risk: toINR(num(p.amount), p.currency) > 100000 ? "high" : "medium",
      reason: `Payout status ${(p.status ?? "pending").toLowerCase()}`,
      reviewed: !!d,
      reviewed_by: d?.by ?? null,
      reviewed_at: d?.at ?? null,
    };
  });

  const reviewQueue: ApprovalItem[] = payments
    .filter((p) => {
      const s = (p.status ?? "").toLowerCase();
      return s === "pending" || s === "processing" || s === "authorized";
    })
    .filter((p) => hours(p.created_at) > 6)
    .slice(0, 100)
    .map((p) => {
      const d = decision(p.id);
      return {
        id: p.id,
        queue: "reviews" as const,
        title: `Manual review · ${mask(p.razorpay_payment_id ?? p.transaction_id ?? p.id)}`,
        subtitle: `${p.method ?? "unknown"} · order ${mask(p.order_id)}`,
        amount: round2(num(p.amount)),
        currency: p.currency ?? "INR",
        age_hours: round2(hours(p.created_at)),
        risk: hours(p.created_at) > 48 ? "high" : "medium",
        reason: `Stuck in ${(p.status ?? "pending").toLowerCase()} for ${Math.round(hours(p.created_at))}h`,
        reviewed: !!d,
        reviewed_by: d?.by ?? null,
        reviewed_at: d?.at ?? null,
      };
    });

  const exceptionQueue: ApprovalItem[] = mismatches.slice(0, 100).map((o) => {
    const d = decision(o.id);
    const list = paymentsByOrder.get(o.id) ?? [];
    return {
      id: o.id,
      queue: "exceptions",
      title: `Order ${mask(o.id)}`,
      subtitle: `Order says ${(o.payment_status ?? "—").toLowerCase()} · ${list.length} payment row${list.length === 1 ? "" : "s"}`,
      amount: round2(num(o.total)),
      currency: o.currency ?? "INR",
      age_hours: round2(hours(o.created_at)),
      risk: "high",
      reason: "Order status and payment records disagree",
      reviewed: !!d,
      reviewed_by: d?.by ?? null,
      reviewed_at: d?.at ?? null,
    };
  });

  // ── vendor payout workspace ────────────────────────────────────────────────
  const vendorCards: VendorPayoutCard[] = vendors.map((v) => {
    const comms = commissions.filter((c) => c.vendor_id === v.id);
    const revenue = comms.reduce((s, c) => s + toINR(num(c.amount), c.currency), 0);
    const unpaid = comms
      .filter((c) => !c.payout_id && (c.status ?? "").toLowerCase() !== "paid")
      .reduce((s, c) => s + toINR(num(c.amount), c.currency), 0);
    const vp = payouts.filter((p) => p.vendor_id === v.id);
    const pending = vp
      .filter((p) => PENDING_PAYOUT.has((p.status ?? "").toLowerCase()))
      .reduce((s, p) => s + toINR(num(p.amount), p.currency), 0);
    const paid = vp
      .filter((p) => (p.status ?? "").toLowerCase() === "paid" || !!p.processed_at)
      .sort((a, b) => (b.processed_at ?? b.created_at).localeCompare(a.processed_at ?? a.created_at))[0];
    const next = vp
      .filter((p) => PENDING_PAYOUT.has((p.status ?? "").toLowerCase()) && p.period_end)
      .map((p) => p.period_end as string)
      .sort()[0];
    return {
      vendor_id: v.id,
      name: v.business_name,
      status: v.status,
      currency: "INR",
      revenue: round2(revenue),
      refunds: null, // vendor-level refund attribution has no source table — never fabricated
      balance: round2(unpaid),
      pending_payout: round2(pending),
      last_payout: paid
        ? { amount: round2(toINR(num(paid.amount), paid.currency)), at: paid.processed_at ?? paid.created_at }
        : null,
      next_payout_date: next ? dayKey(next) : null,
      payout_status: pending > 0 ? "pending" : paid ? "paid" : "none",
    };
  });
  vendorCards.sort((a, b) => b.pending_payout - a.pending_payout || b.revenue - a.revenue);

  // ── one automation suggestion at a time ────────────────────────────────────
  let suggestion: Suggestion = null;
  const lowRisk = refundQueue.filter((r) => r.risk === "low" && !r.reviewed);
  const bigVendor = vendorCards.find((v) => v.pending_payout > 100000);
  if (mismatches.length > 0) {
    suggestion = {
      id: "sug_mismatch",
      title: `Reconcile ${mismatches.length} order/payment mismatch${mismatches.length > 1 ? "es" : ""} first.`,
      evidence: `${mismatches.length} orders disagree with their payment rows across the last ${windowDays} days.`,
      confidence: 0.95,
      impact: round2(mismatches.reduce((s, o) => s + toINR(num(o.total), o.currency), 0)),
      action: "recon",
    };
  } else if (lowRisk.length >= 3) {
    suggestion = {
      id: "sug_low_risk_refunds",
      title: `Approve ${lowRisk.length} low-risk refunds to reduce workload.`,
      evidence: `Each is under ₹5,000 and already has a recorded reason.`,
      confidence: 0.82,
      impact: round2(lowRisk.reduce((s, r) => s + toINR(r.amount ?? 0, r.currency), 0)),
      action: "approvals_refunds",
    };
  } else if (bigVendor) {
    suggestion = {
      id: "sug_vendor_payout",
      title: `Review ${bigVendor.name} payout before settlement.`,
      evidence: `${money(bigVendor.pending_payout)} pending against ${money(bigVendor.revenue)} lifetime commission revenue.`,
      confidence: 0.78,
      impact: bigVendor.pending_payout,
      action: "approvals_payouts",
    };
  } else if (reviewQueue.length >= 3) {
    suggestion = {
      id: "sug_stuck_payments",
      title: `Clear ${reviewQueue.length} payments stuck in review.`,
      evidence: `All have been pending for more than 6 hours.`,
      confidence: 0.7,
      impact: round2(reviewQueue.reduce((s, r) => s + toINR(r.amount ?? 0, r.currency), 0)),
      action: "approvals_reviews",
    };
  }

  return {
    window_days: windowDays,
    brief,
    tasks,
    calendar,
    approvals: {
      refunds: refundQueue,
      payouts: payoutQueue,
      reviews: reviewQueue,
      exceptions: exceptionQueue,
    },
    vendors: vendorCards,
    suggestion,
    notes,
    generated_at: new Date().toISOString(),
  };
}

// ───────────────────────────────────────────────────────── universal search

/** Strip PostgREST filter metacharacters so a search term cannot alter query structure. */
const sanitizeFilterTerm = (v: string) => v.replace(/[,()"\\]/g, " ").replace(/[\u0000-\u001f]/g, "").trim();

export async function workspaceSearch(q: string): Promise<SearchHit[]> {
  const term = sanitizeFilterTerm(q);
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const hits: SearchHit[] = [];

  const [pay, ord, ref, ven] = await Promise.all([
    supabaseAdmin
      .from("payments")
      .select("id,order_id,status,method,amount,currency,created_at,transaction_id,razorpay_payment_id")
      .or(
        `id.eq.${isUuid(term) ? term : "00000000-0000-0000-0000-000000000000"},transaction_id.ilike.${like},razorpay_payment_id.ilike.${like},method.ilike.${like},currency.ilike.${like}`,
      )
      .limit(20),
    supabaseAdmin
      .from("orders")
      .select("id,total,currency,status,payment_status,created_at,contact_email")
      .or(
        `id.eq.${isUuid(term) ? term : "00000000-0000-0000-0000-000000000000"},contact_email.ilike.${like},currency.ilike.${like}`,
      )
      .limit(20),
    supabaseAdmin
      .from("refunds")
      .select("id,order_id,payment_id,amount,currency,status,created_at")
      .or(
        `id.eq.${isUuid(term) ? term : "00000000-0000-0000-0000-000000000000"},razorpay_refund_id.ilike.${like}`,
      )
      .limit(20),
    supabaseAdmin.from("vendors").select("id,business_name,country,status").ilike("business_name", like).limit(10),
  ]);

  for (const p of pay.data ?? []) {
    hits.push({
      id: p.id,
      kind: "payment",
      label: `Payment ${mask(p.razorpay_payment_id ?? p.transaction_id ?? p.id)}`,
      detail: `${(p.status ?? "").toLowerCase()} · ${p.method ?? "—"}`,
      amount: num(p.amount),
      currency: p.currency,
      at: p.created_at,
      open: { paymentId: p.id },
    });
  }
  for (const o of ord.data ?? []) {
    hits.push({
      id: o.id,
      kind: o.contact_email && o.contact_email.toLowerCase().includes(term.toLowerCase()) ? "customer" : "order",
      label: `Order ${mask(o.id)}`,
      detail: `${(o.status ?? "").toLowerCase()} · payment ${(o.payment_status ?? "").toLowerCase()}`,
      amount: num(o.total),
      currency: o.currency,
      at: o.created_at,
      open: { ledger: { from: dayKey(o.created_at), to: dayKey(o.created_at) } },
    });
  }
  for (const r of ref.data ?? []) {
    hits.push({
      id: r.id,
      kind: "refund",
      label: `Refund ${mask(r.id)}`,
      detail: `${(r.status ?? "").toLowerCase()} · order ${mask(r.order_id)}`,
      amount: num(r.amount),
      currency: r.currency,
      at: r.created_at,
      open: r.payment_id ? { paymentId: r.payment_id } : { ledger: { status: "refunded" } },
    });
  }
  for (const v of ven.data ?? []) {
    hits.push({
      id: v.id,
      kind: "vendor",
      label: v.business_name,
      detail: `${v.status}${v.country ? ` · ${v.country}` : ""}`,
      amount: null,
      currency: null,
      at: null,
      open: { tab: "vendors" },
    });
  }

  const upper = term.toUpperCase();
  if (RATES[upper]) {
    hits.push({
      id: `cur_${upper}`,
      kind: "currency",
      label: `${upper} payments`,
      detail: "Open the ledger filtered by this currency",
      amount: null,
      currency: upper,
      at: null,
      open: { ledger: { currency: upper } },
    });
  }
  if (/^[a-z]{2}$/i.test(term)) {
    hits.push({
      id: `cty_${upper}`,
      kind: "country",
      label: `${upper} payments`,
      detail: "Open the ledger filtered by this country",
      amount: null,
      currency: null,
      at: null,
      open: { ledger: { country: upper } },
    });
  }
  if (["razorpay", "stripe", "paypal", "upi", "card", "cod"].includes(term.toLowerCase())) {
    hits.push({
      id: `gw_${term.toLowerCase()}`,
      kind: "gateway",
      label: `${term} transactions`,
      detail: "Open the ledger filtered by this gateway",
      amount: null,
      currency: null,
      at: null,
      open: { ledger: { gateway: term.toLowerCase() } },
    });
  }

  return hits.slice(0, 40);
}

const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

// ─────────────────────────────────────────── internal notes & review decisions

/** Append an internal finance note to the existing admin activity trail. */
export async function addFinanceNote(input: {
  actorId: string;
  entityId: string;
  body: string;
  mention: string | null;
  author: string | null;
}) {
  await supabaseAdmin.from("admin_activity_logs").insert({
    action: "finance.note",
    actor_id: input.actorId,
    entity_id: input.entityId,
    entity_type: "finance_task",
    metadata: { body: input.body, mention: input.mention, author: input.author },
  });
}

/**
 * Record a review decision. This does NOT approve money movement — it marks the
 * item reviewed in the audit trail so the existing refund/payout engines stay
 * the single source of truth for actual settlement.
 */
export async function recordReviewDecision(input: {
  actorId: string;
  ids: string[];
  queue: string;
  decision: "approved" | "rejected" | "reviewed";
  by: string | null;
}) {
  if (!input.ids.length) return { recorded: 0 };
  const rows = input.ids.slice(0, 200).map((id) => ({
    action: "finance.review",
    actor_id: input.actorId,
    entity_id: id,
    entity_type: `finance_${input.queue}`,
    metadata: { decision: input.decision, by: input.by, queue: input.queue },
  }));
  await supabaseAdmin.from("admin_activity_logs").insert(rows);
  return { recorded: rows.length };
}
