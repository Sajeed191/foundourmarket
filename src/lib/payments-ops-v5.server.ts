/**
 * Payments Center v5 — Finance Operations Hub (server-only, read-only aggregation).
 *
 * Turns the existing payments/orders/refunds/log tables into an operational
 * workspace: an ops board, a smart action queue, a finance timeline, a
 * settlement calendar, alerts, gateway comparison, country performance, a
 * daily digest, export history and unified finance search.
 *
 * STRICT RULES
 * - Read-only. No schema, checkout, gateway or business-logic changes.
 * - Never fabricate data. Modules with no source report `available: false`.
 * - Sensitive identifiers are masked before they leave the server.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const num = (v: unknown) => Number(v ?? 0) || 0;
const dayKey = (iso: string) => iso.slice(0, 10);
const hoursSince = (iso: string) => (Date.now() - new Date(iso).getTime()) / 3_600_000;

const SUCCESS = new Set(["succeeded", "paid", "captured", "settled", "success"]);
const PENDING = new Set(["pending", "created", "initiated", "requires_action"]);
const PROCESSING = new Set(["processing", "authorized", "in_progress"]);
const FAILED = new Set(["failed", "cancelled", "canceled", "declined", "error"]);
const REFUNDED = new Set(["refunded", "partially_refunded", "reversed"]);

type Klass = "success" | "pending" | "processing" | "failed" | "refunded" | "other";
const classify = (s: string | null | undefined): Klass => {
  const v = (s ?? "").toLowerCase();
  if (SUCCESS.has(v)) return "success";
  if (PENDING.has(v)) return "pending";
  if (PROCESSING.has(v)) return "processing";
  if (FAILED.has(v)) return "failed";
  if (REFUNDED.has(v)) return "refunded";
  return "other";
};

/** Mask gateway / transaction identifiers server-side. */
const mask = (id: string | null | undefined) => {
  if (!id) return null;
  return id.length <= 10 ? `${id.slice(0, 3)}••••` : `${id.slice(0, 6)}••••${id.slice(-4)}`;
};

const addrField = (addr: Record<string, unknown> | null, keys: string[]): string | null => {
  if (!addr) return null;
  for (const k of keys) {
    const v = addr[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};

const isIndia = (c: string | null) => {
  const v = (c ?? "").trim().toLowerCase();
  return v === "in" || v === "india" || v === "ind";
};

/* ------------------------------------------------------------------ types */

export type OpsCard = {
  id: string;
  title: string;
  count: number;
  value: number | null;
  hint: string;
  action: OpsAction;
  tone: "bad" | "warn" | "info" | "good";
};

export type OpsAction =
  | "ledger_failed"
  | "ledger_pending"
  | "ledger_refunds"
  | "ledger_today"
  | "ledger_all"
  | "timeline"
  | "calendar"
  | "gateways"
  | "exports"
  | "none";

export type OpsBoard = {
  needs_attention: OpsCard[];
  in_progress: OpsCard[];
  completed_today: OpsCard[];
  upcoming: OpsCard[];
};

export type QueueItem = {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  title: string;
  reason: string;
  orders: number;
  impact: number;
  currency: string;
  recommendation: string;
  confidence: number;
  action: OpsAction;
  /** Opens an exact record when the item is about a single entity. */
  target_payment_id?: string | null;
};

export type TimelineEvent = {
  id: string;
  at: string;
  kind: "payment" | "refund" | "settlement" | "export" | "gateway" | "admin";
  title: string;
  detail: string | null;
  amount: number | null;
  currency: string;
  tone: "good" | "info" | "warn" | "bad";
  payment_id: string | null;
};

export type CalendarDay = {
  date: string;
  completed: number;
  completed_value: number;
  delayed: number;
  upcoming: number;
};

export type SettlementCalendar = {
  available: boolean;
  reason: string;
  days: CalendarDay[];
};

export type AlertCard = {
  id: string;
  severity: "bad" | "warn";
  title: string;
  detail: string;
  action: OpsAction;
};

export type GatewayRow = {
  provider: string;
  revenue: number;
  orders: number;
  success_rate: number | null;
  failure_rate: number | null;
  refund_rate: number | null;
  latency_ms: number | null;
  avg_processing_minutes: number | null;
  availability: number | null;
  last_seen: string | null;
};

export type CountryRow = {
  country: string;
  revenue: number;
  orders: number;
  aov: number;
  refund_rate: number | null;
  failure_rate: number | null;
  growth: number | null;
};

export type Digest = {
  available: boolean;
  date: string;
  revenue: number;
  orders: number;
  currency: string;
  largest_order: { id: string; label: string; value: number } | null;
  highest_refund: { id: string; label: string; value: number } | null;
  fastest_gateway: { provider: string; minutes: number } | null;
  top_method: { method: string; share: number } | null;
  best_country: { country: string; revenue: number } | null;
  worst_issue: string | null;
};

export type ExportRecord = {
  id: string;
  at: string;
  actor: string | null;
  dataset: string;
  rows: number | null;
  filters: string | null;
};

export type FinanceOps = {
  digest: Digest;
  board: OpsBoard;
  queue: QueueItem[];
  timeline: TimelineEvent[];
  calendar: SettlementCalendar;
  alerts: AlertCard[];
  gateways: GatewayRow[];
  countries: CountryRow[];
  exports: ExportRecord[];
  currency: string;
  window_days: number;
  generated_at: string;
  has_any_data: boolean;
};

export type FinanceSearchHit = {
  id: string;
  kind: "order" | "payment" | "refund" | "customer";
  label: string;
  sub: string | null;
  amount: number | null;
  currency: string;
  at: string;
  payment_id: string | null;
};

/* ----------------------------------------------------------------- build */

type OrderRow = {
  id: string; contact_email: string | null; user_id: string | null; currency: string | null;
  total: number | null; status: string | null; payment_status: string | null;
  market_region: string | null; shipping_address: Record<string, unknown> | null;
  created_at: string; paid_at: string | null; payment_method: string | null; payment_provider: string | null;
};

type PaymentRow = {
  id: string; order_id: string | null; status: string | null; amount: number | null;
  currency: string | null; method: string | null; provider?: string | null;
  meta: Record<string, unknown> | null; created_at: string;
};

type RefundRow = {
  id: string; order_id: string | null; amount: number | null; currency: string | null;
  status: string | null; reason: string | null; created_at: string; processed_at?: string | null;
};

export async function buildFinanceOps(windowDays: number): Promise<FinanceOps> {
  const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
  const prevSince = new Date(Date.now() - windowDays * 2 * 86_400_000).toISOString();
  const today = dayKey(new Date().toISOString());

  const [ordersRes, paymentsRes, refundsRes, adminRes] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("id,contact_email,user_id,currency,total,status,payment_status,market_region,shipping_address,created_at,paid_at,payment_method,payment_provider")
      .gte("created_at", prevSince)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from("payments")
      .select("*")
      .gte("created_at", prevSince)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from("refunds")
      .select("*")
      .gte("created_at", prevSince)
      .order("created_at", { ascending: false })
      .limit(2000),
    supabaseAdmin
      .from("admin_activity_logs")
      .select("id,actor_id,action,entity_type,entity_id,metadata,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const allOrders = (ordersRes.data ?? []) as unknown as OrderRow[];
  const allPayments = (paymentsRes.data ?? []) as unknown as PaymentRow[];
  const allRefunds = (refundsRes.data ?? []) as unknown as RefundRow[];
  const adminLogs = (adminRes.data ?? []) as {
    id: string; actor_id: string | null; action: string; entity_type: string | null;
    entity_id: string | null; metadata: Record<string, unknown> | null; created_at: string;
  }[];

  const orders = allOrders.filter((o) => o.created_at >= since);
  const payments = allPayments.filter((p) => p.created_at >= since);
  const refunds = allRefunds.filter((r) => r.created_at >= since);

  const currency = orders.find((o) => o.currency)?.currency ?? "INR";
  const orderById = new Map(allOrders.map((o) => [o.id, o] as const));

  const has_any_data = orders.length > 0 || payments.length > 0 || refunds.length > 0;

  /* ---------------------------------------------------------- ops board */

  const failed = payments.filter((p) => classify(p.status) === "failed");
  const pending = payments.filter((p) => classify(p.status) === "pending");
  const processing = payments.filter((p) => classify(p.status) === "processing");
  const succeeded = payments.filter((p) => classify(p.status) === "success");
  const pendingRefunds = refunds.filter((r) => classify(r.status) !== "success" && (r.status ?? "").toLowerCase() !== "completed");
  const doneRefunds = refunds.filter((r) => classify(r.status) === "success" || (r.status ?? "").toLowerCase() === "completed");

  const sum = <T,>(rows: T[], pick: (r: T) => number) => rows.reduce((a, r) => a + pick(r), 0);
  const paidToday = succeeded.filter((p) => dayKey(p.created_at) === today);
  const refundsToday = doneRefunds.filter((r) => dayKey(r.created_at) === today);
  const failedToday = failed.filter((p) => dayKey(p.created_at) === today);
  const stalePending = pending.filter((p) => hoursSince(p.created_at) > 24);
  const unpaidOrders = orders.filter((o) => classify(o.payment_status) === "pending");

  const card = (c: OpsCard) => c;
  const needs_attention: OpsCard[] = [];
  if (pendingRefunds.length) needs_attention.push(card({
    id: "refund-queue", title: "Refunds awaiting processing", count: pendingRefunds.length,
    value: sum(pendingRefunds, (r) => num(r.amount)), hint: "Open the refund queue in the ledger.",
    action: "ledger_refunds", tone: "bad",
  }));
  if (failedToday.length) needs_attention.push(card({
    id: "failed-today", title: "Failed payments today", count: failedToday.length,
    value: sum(failedToday, (p) => num(p.amount)), hint: "Review gateway and bank decline reasons.",
    action: "ledger_failed", tone: "bad",
  }));
  if (stalePending.length) needs_attention.push(card({
    id: "stale-pending", title: "Payments pending over 24h", count: stalePending.length,
    value: sum(stalePending, (p) => num(p.amount)), hint: "These may need manual reconciliation.",
    action: "ledger_pending", tone: "warn",
  }));

  const in_progress: OpsCard[] = [];
  if (processing.length) in_progress.push(card({
    id: "processing", title: "Payments processing", count: processing.length,
    value: sum(processing, (p) => num(p.amount)), hint: "Authorised or in-flight with the gateway.",
    action: "ledger_pending", tone: "info",
  }));
  if (pending.length) in_progress.push(card({
    id: "pending", title: "Pending payments", count: pending.length,
    value: sum(pending, (p) => num(p.amount)), hint: "Awaiting customer or gateway confirmation.",
    action: "ledger_pending", tone: "info",
  }));

  const completed_today: OpsCard[] = [];
  if (paidToday.length) completed_today.push(card({
    id: "paid-today", title: "Payments captured today", count: paidToday.length,
    value: sum(paidToday, (p) => num(p.amount)), hint: "Successful captures since midnight.",
    action: "ledger_today", tone: "good",
  }));
  if (refundsToday.length) completed_today.push(card({
    id: "refunded-today", title: "Refunds completed today", count: refundsToday.length,
    value: sum(refundsToday, (r) => num(r.amount)), hint: "Money returned to customers today.",
    action: "ledger_refunds", tone: "info",
  }));

  const upcoming: OpsCard[] = [];
  if (unpaidOrders.length) upcoming.push(card({
    id: "awaiting-payment", title: "Orders awaiting payment", count: unpaidOrders.length,
    value: sum(unpaidOrders, (o) => num(o.total)), hint: "Expected revenue not yet captured.",
    action: "ledger_pending", tone: "info",
  }));

  /* -------------------------------------------------------- action queue */

  const queue: QueueItem[] = [];
  const failRate = payments.length ? (failed.length / payments.length) * 100 : 0;
  const refundRate = succeeded.length ? (refunds.length / succeeded.length) * 100 : 0;

  if (pendingRefunds.length) {
    const oldest = Math.max(...pendingRefunds.map((r) => hoursSince(r.created_at)));
    queue.push({
      id: "q-refunds", priority: oldest > 72 ? "critical" : "high",
      title: `${pendingRefunds.length} refund${pendingRefunds.length > 1 ? "s" : ""} waiting`,
      reason: `Oldest has been open for ${Math.round(oldest)}h.`,
      orders: new Set(pendingRefunds.map((r) => r.order_id).filter(Boolean)).size,
      impact: sum(pendingRefunds, (r) => num(r.amount)), currency,
      recommendation: "Process the refund queue so customers are not left waiting.",
      confidence: 0.95, action: "ledger_refunds",
    });
  }
  if (failRate >= 10 && failed.length >= 3) {
    queue.push({
      id: "q-failures", priority: failRate >= 25 ? "critical" : "high",
      title: `Payment failure rate at ${failRate.toFixed(1)}%`,
      reason: `${failed.length} of ${payments.length} attempts failed in the last ${windowDays} days.`,
      orders: new Set(failed.map((p) => p.order_id).filter(Boolean)).size,
      impact: sum(failed, (p) => num(p.amount)), currency,
      recommendation: "Review decline reasons by gateway and retry recoverable attempts.",
      confidence: 0.9, action: "ledger_failed",
    });
  }
  if (stalePending.length) {
    queue.push({
      id: "q-stale", priority: "medium",
      title: `${stalePending.length} payment${stalePending.length > 1 ? "s" : ""} stuck in pending`,
      reason: "No status change from the gateway for more than 24 hours.",
      orders: new Set(stalePending.map((p) => p.order_id).filter(Boolean)).size,
      impact: sum(stalePending, (p) => num(p.amount)), currency,
      recommendation: "Reconcile against the gateway dashboard before releasing stock.",
      confidence: 0.75, action: "ledger_pending",
      target_payment_id: stalePending[0]?.id ?? null,
    });
  }
  if (refundRate >= 15 && refunds.length >= 3) {
    queue.push({
      id: "q-refund-rate", priority: "medium",
      title: `Refund rate at ${refundRate.toFixed(1)}%`,
      reason: `${refunds.length} refunds against ${succeeded.length} successful payments.`,
      orders: new Set(refunds.map((r) => r.order_id).filter(Boolean)).size,
      impact: sum(refunds, (r) => num(r.amount)), currency,
      recommendation: "Check the top refund reasons for a product or fulfilment problem.",
      confidence: 0.7, action: "ledger_refunds",
    });
  }
  const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  queue.sort((a, b) => rank[a.priority] - rank[b.priority] || b.impact - a.impact);

  /* ----------------------------------------------------------- timeline */

  const timeline: TimelineEvent[] = [];
  for (const p of payments.slice(0, 150)) {
    const k = classify(p.status);
    timeline.push({
      id: `p-${p.id}`, at: p.created_at, kind: "payment",
      title: k === "success" ? "Payment received" : k === "failed" ? "Payment failed" : `Payment ${p.status ?? "recorded"}`,
      detail: [p.method, mask(p.id)].filter(Boolean).join(" · ") || null,
      amount: num(p.amount), currency: p.currency ?? currency,
      tone: k === "success" ? "good" : k === "failed" ? "bad" : "info",
      payment_id: p.id,
    });
  }
  for (const r of refunds.slice(0, 80)) {
    timeline.push({
      id: `r-${r.id}`, at: r.created_at, kind: "refund",
      title: classify(r.status) === "success" ? "Refund completed" : "Refund issued",
      detail: r.reason ?? null, amount: num(r.amount), currency: r.currency ?? currency,
      tone: "warn", payment_id: null,
    });
  }
  for (const l of adminLogs.slice(0, 120)) {
    const isExport = l.action.includes("export");
    timeline.push({
      id: `a-${l.id}`, at: l.created_at, kind: isExport ? "export" : "admin",
      title: isExport ? "Export generated" : l.action.replace(/[._]/g, " "),
      detail: l.entity_type ? `${l.entity_type}${l.entity_id ? ` · ${mask(l.entity_id)}` : ""}` : null,
      amount: null, currency, tone: "info", payment_id: null,
    });
  }
  timeline.sort((a, b) => (a.at < b.at ? 1 : -1));

  /* -------------------------------------------------- settlement calendar */

  const settlementRows = payments.filter((p) => (p.status ?? "").toLowerCase() === "settled");
  const calendar: SettlementCalendar = settlementRows.length
    ? {
        available: true, reason: "",
        days: (() => {
          const m = new Map<string, CalendarDay>();
          for (const p of settlementRows) {
            const d = dayKey(p.created_at);
            const row = m.get(d) ?? { date: d, completed: 0, completed_value: 0, delayed: 0, upcoming: 0 };
            row.completed += 1;
            row.completed_value += num(p.amount);
            m.set(d, row);
          }
          return [...m.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 42);
        })(),
      }
    : {
        available: false,
        reason: "No gateway settlement feed is connected, so settlement dates cannot be shown without inventing them.",
        days: [],
      };

  /* ------------------------------------------------------------- alerts */

  const alerts: AlertCard[] = [];
  const archived = new Set(
    adminLogs.filter((l) => l.action === "payments.alert.archived").map((l) => l.entity_id ?? ""),
  );
  const pushAlert = (a: AlertCard) => { if (!archived.has(a.id)) alerts.push(a); };

  if (failRate >= 10 && failed.length >= 3) pushAlert({
    id: "alert-failures", severity: failRate >= 25 ? "bad" : "warn",
    title: "High payment failure rate",
    detail: `${failRate.toFixed(1)}% of attempts failed in the last ${windowDays} days.`,
    action: "ledger_failed",
  });
  const prevRefunds = allRefunds.filter((r) => r.created_at < since).length;
  if (refunds.length >= 3 && prevRefunds > 0 && refunds.length > prevRefunds * 1.5) pushAlert({
    id: "alert-refund-spike", severity: "warn",
    title: "Refund spike detected",
    detail: `${refunds.length} refunds this period vs ${prevRefunds} in the previous one.`,
    action: "ledger_refunds",
  });
  if (stalePending.length >= 3) pushAlert({
    id: "alert-settlement-delay", severity: "warn",
    title: "Payments delayed in pending",
    detail: `${stalePending.length} payments have been pending for more than 24 hours.`,
    action: "ledger_pending",
  });

  /* -------------------------------------------------- gateway comparison */

  const gwMap = new Map<string, {
    revenue: number; orders: number; ok: number; fail: number; refunded: number;
    total: number; procMin: number[]; last: string | null;
  }>();
  const providerOf = (p: PaymentRow) => {
    const meta = p.meta ?? {};
    const cand = (meta["provider"] ?? meta["gateway"] ?? p.provider ?? p.method) as unknown;
    return typeof cand === "string" && cand.trim() ? cand.trim().toLowerCase() : "unknown";
  };
  for (const p of payments) {
    const key = providerOf(p);
    const g = gwMap.get(key) ?? { revenue: 0, orders: 0, ok: 0, fail: 0, refunded: 0, total: 0, procMin: [], last: null };
    const k = classify(p.status);
    g.total += 1;
    if (k === "success") { g.ok += 1; g.revenue += num(p.amount); g.orders += 1; }
    if (k === "failed") g.fail += 1;
    if (k === "refunded") g.refunded += 1;
    const o = p.order_id ? orderById.get(p.order_id) : undefined;
    if (o?.paid_at) {
      const mins = (new Date(o.paid_at).getTime() - new Date(o.created_at).getTime()) / 60_000;
      if (mins >= 0 && mins < 60 * 24) g.procMin.push(mins);
    }
    if (!g.last || p.created_at > g.last) g.last = p.created_at;
    gwMap.set(key, g);
  }
  const gateways: GatewayRow[] = [...gwMap.entries()]
    .map(([provider, g]) => ({
      provider,
      revenue: g.revenue,
      orders: g.orders,
      success_rate: g.total ? (g.ok / g.total) * 100 : null,
      failure_rate: g.total ? (g.fail / g.total) * 100 : null,
      refund_rate: g.ok ? (g.refunded / g.ok) * 100 : null,
      latency_ms: null, // no gateway latency telemetry is collected
      avg_processing_minutes: g.procMin.length ? g.procMin.reduce((a, b) => a + b, 0) / g.procMin.length : null,
      availability: g.total ? (1 - g.fail / g.total) * 100 : null,
      last_seen: g.last,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  /* ------------------------------------------------- country performance */

  const countryOf = (o: OrderRow) => {
    const c = addrField(o.shipping_address, ["country", "country_code", "countryName"]);
    if (c) return isIndia(c) ? "India" : c;
    if ((o.market_region ?? "").toLowerCase() === "india") return "India";
    return "Unknown";
  };
  const cMap = new Map<string, { revenue: number; orders: number; refunds: number; failed: number; attempts: number; prev: number }>();
  const paymentsByOrder = new Map<string, PaymentRow[]>();
  for (const p of allPayments) {
    if (!p.order_id) continue;
    const arr = paymentsByOrder.get(p.order_id) ?? [];
    arr.push(p);
    paymentsByOrder.set(p.order_id, arr);
  }
  const refundedOrders = new Set(refunds.map((r) => r.order_id).filter(Boolean) as string[]);
  for (const o of allOrders) {
    const key = countryOf(o);
    const row = cMap.get(key) ?? { revenue: 0, orders: 0, refunds: 0, failed: 0, attempts: 0, prev: 0 };
    const paid = classify(o.payment_status) === "success" || !!o.paid_at;
    if (o.created_at >= since) {
      if (paid) { row.revenue += num(o.total); row.orders += 1; }
      if (refundedOrders.has(o.id)) row.refunds += 1;
      for (const p of paymentsByOrder.get(o.id) ?? []) {
        row.attempts += 1;
        if (classify(p.status) === "failed") row.failed += 1;
      }
    } else if (paid) {
      row.prev += num(o.total);
    }
    cMap.set(key, row);
  }
  const countries: CountryRow[] = [...cMap.entries()]
    .filter(([, r]) => r.revenue > 0 || r.orders > 0)
    .map(([country, r]) => ({
      country,
      revenue: r.revenue,
      orders: r.orders,
      aov: r.orders ? r.revenue / r.orders : 0,
      refund_rate: r.orders ? (r.refunds / r.orders) * 100 : null,
      failure_rate: r.attempts ? (r.failed / r.attempts) * 100 : null,
      growth: r.prev ? ((r.revenue - r.prev) / r.prev) * 100 : null,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 20);

  /* -------------------------------------------------------------- digest */

  const todayOrders = orders.filter((o) => dayKey(o.created_at) === today && (classify(o.payment_status) === "success" || !!o.paid_at));
  const largest = todayOrders.slice().sort((a, b) => num(b.total) - num(a.total))[0] ?? null;
  const biggestRefund = refundsToday.slice().sort((a, b) => num(b.amount) - num(a.amount))[0] ?? null;
  const fastest = gateways
    .filter((g) => g.avg_processing_minutes != null)
    .sort((a, b) => (a.avg_processing_minutes ?? 0) - (b.avg_processing_minutes ?? 0))[0] ?? null;
  const methodMap = new Map<string, number>();
  for (const p of succeeded) {
    const m = (p.method ?? "unknown").toLowerCase();
    methodMap.set(m, (methodMap.get(m) ?? 0) + 1);
  }
  const topMethod = [...methodMap.entries()].sort((a, b) => b[1] - a[1])[0];
  const digest: Digest = {
    available: has_any_data,
    date: today,
    revenue: sum(paidToday, (p) => num(p.amount)),
    orders: todayOrders.length,
    currency,
    largest_order: largest ? { id: largest.id, label: mask(largest.id) ?? largest.id, value: num(largest.total) } : null,
    highest_refund: biggestRefund
      ? { id: biggestRefund.id, label: mask(biggestRefund.id) ?? biggestRefund.id, value: num(biggestRefund.amount) }
      : null,
    fastest_gateway: fastest ? { provider: fastest.provider, minutes: fastest.avg_processing_minutes ?? 0 } : null,
    top_method: topMethod && succeeded.length
      ? { method: topMethod[0], share: (topMethod[1] / succeeded.length) * 100 }
      : null,
    best_country: countries[0] ? { country: countries[0].country, revenue: countries[0].revenue } : null,
    worst_issue: queue[0]?.title ?? null,
  };

  /* ------------------------------------------------------ export history */

  const actorIds = [...new Set(adminLogs.map((l) => l.actor_id).filter(Boolean) as string[])];
  const actorNames = new Map<string, string>();
  if (actorIds.length) {
    const { data: profs } = await supabaseAdmin.from("profiles").select("id,full_name").in("id", actorIds);
    for (const p of profs ?? []) actorNames.set(p.id as string, (p.full_name as string) ?? "Staff");
  }
  const exports: ExportRecord[] = adminLogs
    .filter((l) => l.action.includes("export"))
    .slice(0, 50)
    .map((l) => {
      const meta = l.metadata ?? {};
      return {
        id: l.id,
        at: l.created_at,
        actor: l.actor_id ? (actorNames.get(l.actor_id) ?? "Staff") : null,
        dataset: String(meta["dataset"] ?? l.entity_type ?? l.action.replace(/[._]/g, " ")),
        rows: meta["rows"] != null ? num(meta["rows"]) : null,
        filters: meta["filters"] ? JSON.stringify(meta["filters"]).slice(0, 160) : null,
      };
    });

  return {
    digest,
    board: { needs_attention, in_progress, completed_today, upcoming },
    queue,
    timeline: timeline.slice(0, 200),
    calendar,
    alerts,
    gateways,
    countries,
    exports,
    currency,
    window_days: windowDays,
    generated_at: new Date().toISOString(),
    has_any_data,
  };
}

/* ------------------------------------------------------- finance search */

export async function searchFinance(q: string): Promise<FinanceSearchHit[]> {
  const term = q.trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const hits: FinanceSearchHit[] = [];

  const [ordersRes, paymentsRes, refundsRes] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("id,contact_email,total,currency,status,payment_status,created_at")
      .or(`id.ilike.${like},contact_email.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(15),
    supabaseAdmin
      .from("payments")
      .select("id,order_id,amount,currency,status,method,created_at")
      .ilike("id", like)
      .order("created_at", { ascending: false })
      .limit(15),
    supabaseAdmin
      .from("refunds")
      .select("id,order_id,amount,currency,status,created_at")
      .or(`id.ilike.${like},order_id.ilike.${like}`)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  for (const o of ordersRes.data ?? []) {
    hits.push({
      id: o.id as string, kind: "order", label: `Order ${mask(o.id as string)}`,
      sub: (o.contact_email as string | null) ?? (o.payment_status as string | null),
      amount: num(o.total), currency: (o.currency as string) ?? "INR",
      at: o.created_at as string, payment_id: null,
    });
  }
  for (const p of paymentsRes.data ?? []) {
    hits.push({
      id: p.id as string, kind: "payment", label: `Payment ${mask(p.id as string)}`,
      sub: [(p.method as string | null), (p.status as string | null)].filter(Boolean).join(" · ") || null,
      amount: num(p.amount), currency: (p.currency as string) ?? "INR",
      at: p.created_at as string, payment_id: p.id as string,
    });
  }
  for (const r of refundsRes.data ?? []) {
    hits.push({
      id: r.id as string, kind: "refund", label: `Refund ${mask(r.id as string)}`,
      sub: (r.status as string | null) ?? null, amount: num(r.amount),
      currency: (r.currency as string) ?? "INR", at: r.created_at as string, payment_id: null,
    });
  }
  return hits.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, 30);
}

/* ------------------------------------------- audited, non-mutating actions */

export type FinanceActionKind = "export" | "mark_reviewed" | "archive_alert";

/**
 * Records a finance workspace action in the existing admin activity log.
 * These actions never touch payments, orders or refunds — they are audit and
 * workspace-state records only.
 */
export async function recordFinanceAction(input: {
  actorId: string;
  kind: FinanceActionKind;
  entityId?: string | null;
  dataset?: string | null;
  rows?: number | null;
  filters?: Record<string, unknown> | null;
}): Promise<void> {
  const action =
    input.kind === "export" ? "payments.export.generated"
    : input.kind === "archive_alert" ? "payments.alert.archived"
    : "payments.queue.reviewed";
  await supabaseAdmin.from("admin_activity_logs").insert({
    actor_id: input.actorId,
    action,
    entity_type: "payments",
    entity_id: input.entityId ?? null,
    metadata: {
      dataset: input.dataset ?? null,
      rows: input.rows ?? null,
      filters: input.filters ?? null,
    },
  });
}
