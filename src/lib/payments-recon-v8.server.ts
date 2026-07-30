/**
 * Payments Center v8.0 — Financial Reconciliation & Executive Intelligence
 * (server-only, STRICTLY READ ONLY).
 *
 * Extends v7.0. Nothing here writes or mutates anything: no checkout, gateway,
 * order, refund, payout, settlement, tax, auth or schema changes. Every value is
 * derived from real rows fetched in ONE pass; anything without a source returns
 * `null` / an empty list so the UI can render an honest "No data available".
 *
 * Discrepancies are never fabricated — a finding only exists when concrete rows
 * prove it, and every finding carries the record ids that back it.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const num = (v: unknown) => Number(v ?? 0) || 0;
const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);

/** Indicative reference rates → 1 unit of currency in INR (labelled as indicative in the UI). */
const RATES: Record<string, number> = {
  INR: 1, USD: 88, EUR: 95, GBP: 112, AED: 24, CAD: 64, AUD: 58,
  SGD: 65, JPY: 0.58, CHF: 100, NZD: 53, SAR: 23.5,
};
const toINR = (amount: number, currency: string | null | undefined) => {
  const r = RATES[(currency ?? "INR").toUpperCase()];
  return r == null ? amount : amount * r;
};

const SUCCESS = new Set(["succeeded", "paid", "captured", "settled", "success"]);
const PENDING = new Set(["pending", "created", "initiated", "requires_action", "processing", "authorized"]);
const FAILED = new Set(["failed", "cancelled", "canceled", "declined", "error"]);
const payState = (s: string | null | undefined) => {
  const v = (s ?? "").toLowerCase();
  if (SUCCESS.has(v)) return "ok" as const;
  if (PENDING.has(v)) return "pending" as const;
  if (FAILED.has(v)) return "failed" as const;
  return "other" as const;
};

const COUNTRY_NAMES: Record<string, string> = {
  IN: "India", US: "United States", GB: "United Kingdom", UK: "United Kingdom", CA: "Canada",
  AU: "Australia", AE: "United Arab Emirates", DE: "Germany", FR: "France", SG: "Singapore",
  JP: "Japan", NZ: "New Zealand", CH: "Switzerland", NL: "Netherlands", SA: "Saudi Arabia",
};
const countryLabel = (c: string) => COUNTRY_NAMES[c.toUpperCase()] ?? c;

// ───────────────────────────────────────────────────────────────── public types

export type DrillRef = {
  kind: "order" | "payment" | "refund" | "vendor" | "product";
  ids: string[];               // already-known record ids backing the number
  ledger?: { status?: string; from?: string; to?: string; country?: string; currency?: string; gateway?: string };
};

export type ReconLine = {
  id: string;
  label: string;
  expected: number;
  actual: number;
  difference: number;          // actual - expected
  matched: boolean;
  detail: string;
  drill: DrillRef | null;
};

export type ReconciliationCenter = {
  has_data: boolean;
  orders_created: number;
  payments_received: number;
  successful_payments: number;
  failed_payments: number;
  refunded_payments: number;
  cancelled_orders: number;
  pending_orders: number;
  /** Only genuine mismatches — an empty list means everything reconciles. */
  mismatches: ReconLine[];
};

export type RevenueVerification = {
  has_data: boolean;
  products: number;
  shipping: number;
  tax: number;
  discounts: number;
  coupons: number;
  computed: number;
  recorded: number;
  variance: number;
  verified: boolean;
  tolerance: number;
  /** Orders whose own total does not equal their components. */
  offenders: { order_id: string; recorded: number; computed: number; variance: number }[];
};

export type VerificationIssue = {
  id: string;
  severity: "critical" | "warning";
  title: string;
  detail: string;
  evidence: string[];
  drill: DrillRef | null;
};

export type SettlementVerification = {
  available: boolean;
  message: string;
  payments_total: number | null;
  settlements_total: number | null;
  vendor_payout_total: number | null;
  platform_commission_total: number | null;
  missing_links: VerificationIssue[];
};

export type GatewayBucket = { t: string; ok: number; failed: number; rate: number | null };

export type GatewayTimeline = {
  gateway: string;
  total: number;
  success: number;
  failed: number;
  pending: number;
  success_rate: number | null;
  hourly: GatewayBucket[];
  daily: GatewayBucket[];
  weekly: GatewayBucket[];
  /** Telemetry the platform does not record — surfaced as "No telemetry available". */
  timeouts: number | null;
  retries: number | null;
  recovery_rate: number | null;
};

export type LeakageFinding = VerificationIssue & { impact: number | null };

export type CountryIntel = {
  code: string;
  label: string;
  revenue: number;
  revenue_inr: number;
  orders: number;
  customers: number;
  repeat_buyers: number;
  refunds: number;
  refund_amount: number;
  tax: number;
  currencies: { k: string; v: number; n: number }[];
  growth: number | null;
  avg_order: number | null;
  conversion: number | null;   // null — no per-country session source
  top_cities: { k: string; v: number; n: number }[];
  top_states: { k: string; v: number; n: number }[];
};

export type VendorFinance = {
  vendor_id: string;
  name: string;
  revenue: number;
  orders: number;
  refunds: number;
  refund_amount: number;
  cancelled: number;
  avg_order: number | null;
  growth: number | null;
  commission: number | null;
  payout: number | null;
  pending: number | null;
  rank: number;
  risk_score: number | null;
  risk_reason: string;
};

export type ExecutiveInsight = {
  headline: string;
  evidence: string[];
  confidence: "low" | "medium" | "high";
  impact: string;
  action_label: string;
  drill: DrillRef | null;
} | null;

export type ReconDashboard = {
  window_days: number;
  generated_at: string;
  currency: string;
  reconciliation: ReconciliationCenter;
  revenue: RevenueVerification;
  refund_issues: VerificationIssue[];
  settlement: SettlementVerification;
  gateways: GatewayTimeline[];
  leakage: LeakageFinding[];
  countries: { india: CountryIntel | null; international: CountryIntel | null; by_country: CountryIntel[] };
  vendors: VendorFinance[];
  insight: ExecutiveInsight;
};

// ─────────────────────────────────────────────────────────────────── helpers

const addr = (a: unknown, key: string): string | null => {
  if (!a || typeof a !== "object") return null;
  const v = (a as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
};

const orderCountry = (o: { shipping_address: unknown; market_region: string | null }) => {
  const raw = addr(o.shipping_address, "country") ?? addr(o.shipping_address, "country_code");
  if (raw) {
    const t = raw.trim();
    if (/^(in|ind|india)$/i.test(t)) return "IN";
    return t.length <= 3 ? t.toUpperCase() : t;
  }
  if ((o.market_region ?? "").toLowerCase() === "india") return "IN";
  return "UNKNOWN";
};

const topList = (m: Map<string, { v: number; n: number }>, limit = 8) =>
  [...m.entries()]
    .map(([k, x]) => ({ k, v: round2(x.v), n: x.n }))
    .sort((a, b) => b.v - a.v)
    .slice(0, limit);

const bump = (m: Map<string, { v: number; n: number }>, k: string, v: number) => {
  const cur = m.get(k) ?? { v: 0, n: 0 };
  cur.v += v;
  cur.n += 1;
  m.set(k, cur);
};

function buckets(rows: { at: Date; ok: boolean; failed: boolean }[], kind: "hour" | "day" | "week", count: number): GatewayBucket[] {
  const now = new Date();
  const out: GatewayBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now);
    if (kind === "hour") { start.setMinutes(0, 0, 0); start.setHours(start.getHours() - i); }
    if (kind === "day") { start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - i); }
    if (kind === "week") { start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - i * 7); }
    const end = new Date(start);
    if (kind === "hour") end.setHours(end.getHours() + 1);
    if (kind === "day") end.setDate(end.getDate() + 1);
    if (kind === "week") end.setDate(end.getDate() + 7);
    let ok = 0, failed = 0;
    for (const r of rows) if (r.at >= start && r.at < end) { if (r.ok) ok++; if (r.failed) failed++; }
    const total = ok + failed;
    out.push({
      t: kind === "hour"
        ? start.toISOString().slice(11, 13) + ":00"
        : start.toISOString().slice(0, 10),
      ok, failed,
      rate: total > 0 ? round2((ok / total) * 100) : null,
    });
  }
  return out;
}

// ────────────────────────────────────────────────────────────────── main pass

export async function buildReconDashboard(windowDays = 90): Promise<ReconDashboard> {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const prevSince = new Date(Date.now() - windowDays * 2 * 86400_000).toISOString();

  const [ordersRes, paymentsRes, refundsRes, commissionsRes, payoutsRes, vendorsRes] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select("id,user_id,status,payment_status,currency,subtotal,shipping,tax,discount,total,promo_code,payment_method,payment_provider,market_region,shipping_address,created_at,cancelled_at,paid_at")
      .gte("created_at", prevSince)
      .order("created_at", { ascending: false })
      .limit(6000),
    supabaseAdmin
      .from("payments")
      .select("id,order_id,status,amount,currency,method,fee,gateway_tax,transaction_id,created_at")
      .gte("created_at", prevSince)
      .limit(6000),
    supabaseAdmin
      .from("refunds")
      .select("id,order_id,payment_id,amount,currency,status,reason,created_at")
      .gte("created_at", prevSince)
      .limit(3000),
    supabaseAdmin.from("vendor_commissions").select("id,vendor_id,order_id,amount,rate,currency,status,payout_id,created_at").limit(5000),
    supabaseAdmin.from("vendor_payouts").select("id,vendor_id,amount,currency,status,processed_at,created_at").limit(2000),
    supabaseAdmin.from("vendors").select("id,business_name,slug,country,commission_rate,status").limit(1000),
  ]);

  const allOrders = ordersRes.data ?? [];
  const allPayments = paymentsRes.data ?? [];
  const allRefunds = refundsRes.data ?? [];
  const commissions = commissionsRes.data ?? [];
  const payouts = payoutsRes.data ?? [];
  const vendors = vendorsRes.data ?? [];

  const inWindow = (createdAt: string) => createdAt >= since;
  const orders = allOrders.filter((o) => inWindow(o.created_at));
  const prevOrders = allOrders.filter((o) => !inWindow(o.created_at));
  const payments = allPayments.filter((p) => inWindow(p.created_at));
  const refunds = allRefunds.filter((r) => inWindow(r.created_at));

  const orderIds = new Set(orders.map((o) => o.id));
  const paymentById = new Map(allPayments.map((p) => [p.id, p]));

  // Order items joined to categories only when there are orders — no wasted read.
  let items: { order_id: string; product_slug: string | null; name: string; line_total: number | null; quantity: number | null }[] = [];
  let categoryBySlug = new Map<string, string>();
  if (orders.length) {
    const ids = [...orderIds].slice(0, 1000);
    const { data: itemRows } = await supabaseAdmin
      .from("order_items")
      .select("order_id,product_slug,name,line_total,quantity")
      .in("order_id", ids)
      .limit(8000);
    items = (itemRows ?? []) as typeof items;
    const slugs = [...new Set(items.map((i) => i.product_slug).filter(Boolean))] as string[];
    if (slugs.length) {
      const { data: prodRows } = await supabaseAdmin
        .from("products")
        .select("slug,category")
        .in("slug", slugs.slice(0, 1000));
      categoryBySlug = new Map((prodRows ?? []).map((p) => [p.slug as string, (p.category as string) ?? "Uncategorised"]));
    }
  }

  // ───────────────────────────────── 2. Reconciliation Center
  const paymentsForWindowOrders = payments.filter((p) => p.order_id && orderIds.has(p.order_id));
  const paidOrderIds = new Set(paymentsForWindowOrders.filter((p) => payState(p.status) === "ok").map((p) => p.order_id!));
  const ordersWithAnyPayment = new Set(paymentsForWindowOrders.map((p) => p.order_id!));

  const successful = payments.filter((p) => payState(p.status) === "ok");
  const failedPayments = payments.filter((p) => payState(p.status) === "failed");
  const refundedPayments = payments.filter((p) => (p.status ?? "").toLowerCase() === "refunded");
  const cancelledOrders = orders.filter((o) => (o.status ?? "").toLowerCase() === "cancelled");
  const pendingOrders = orders.filter((o) => ["pending", "processing", "created"].includes((o.status ?? "").toLowerCase()));

  const mismatches: ReconLine[] = [];

  const paidNoPayment = orders.filter(
    (o) => ["paid", "succeeded", "captured"].includes((o.payment_status ?? "").toLowerCase()) && !paidOrderIds.has(o.id),
  );
  if (paidNoPayment.length) {
    mismatches.push({
      id: "orders_without_payment",
      label: "Orders marked paid without a successful payment record",
      expected: paidNoPayment.length + paidOrderIds.size,
      actual: paidOrderIds.size,
      difference: -paidNoPayment.length,
      matched: false,
      detail: `${paidNoPayment.length} order(s) carry a paid payment status but no successful payment row exists.`,
      drill: { kind: "order", ids: paidNoPayment.map((o) => o.id), ledger: { status: "succeeded" } },
    });
  }

  const orphanPayments = payments.filter((p) => !p.order_id || (!orderIds.has(p.order_id) && !allOrders.some((o) => o.id === p.order_id)));
  if (orphanPayments.length) {
    mismatches.push({
      id: "payments_without_order",
      label: "Payments with no matching order",
      expected: 0,
      actual: orphanPayments.length,
      difference: orphanPayments.length,
      matched: false,
      detail: `${orphanPayments.length} payment record(s) do not resolve to an order.`,
      drill: { kind: "payment", ids: orphanPayments.map((p) => p.id) },
    });
  }

  const cancelledButPaid = cancelledOrders.filter((o) => paidOrderIds.has(o.id) && !allRefunds.some((r) => r.order_id === o.id));
  if (cancelledButPaid.length) {
    mismatches.push({
      id: "cancelled_paid_no_refund",
      label: "Cancelled orders paid but not refunded",
      expected: cancelledButPaid.length,
      actual: 0,
      difference: -cancelledButPaid.length,
      matched: false,
      detail: `${cancelledButPaid.length} cancelled order(s) hold a successful payment with no refund record.`,
      drill: { kind: "order", ids: cancelledButPaid.map((o) => o.id), ledger: { status: "refunded" } },
    });
  }

  const stalePending = pendingOrders.filter((o) => !ordersWithAnyPayment.has(o.id));
  if (stalePending.length) {
    mismatches.push({
      id: "pending_no_attempt",
      label: "Pending orders with no payment attempt",
      expected: pendingOrders.length,
      actual: pendingOrders.length - stalePending.length,
      difference: -stalePending.length,
      matched: false,
      detail: `${stalePending.length} pending order(s) have no payment record of any status.`,
      drill: { kind: "order", ids: stalePending.map((o) => o.id), ledger: { status: "pending" } },
    });
  }

  const reconciliation: ReconciliationCenter = {
    has_data: orders.length > 0 || payments.length > 0,
    orders_created: orders.length,
    payments_received: payments.length,
    successful_payments: successful.length,
    failed_payments: failedPayments.length,
    refunded_payments: refundedPayments.length,
    cancelled_orders: cancelledOrders.length,
    pending_orders: pendingOrders.length,
    mismatches,
  };

  // ───────────────────────────────── 3. Revenue verification
  const paidOrders = orders.filter((o) => paidOrderIds.has(o.id) || ["paid", "succeeded", "captured"].includes((o.payment_status ?? "").toLowerCase()));
  let products = 0, shipping = 0, tax = 0, discounts = 0, coupons = 0, recorded = 0;
  const offenders: RevenueVerification["offenders"] = [];
  for (const o of paidOrders) {
    const sub = num(o.subtotal), shp = num(o.shipping), tx = num(o.tax), dsc = num(o.discount), tot = num(o.total);
    products += toINR(sub, o.currency);
    shipping += toINR(shp, o.currency);
    tax += toINR(tx, o.currency);
    const inrDsc = toINR(dsc, o.currency);
    discounts += inrDsc;
    if (o.promo_code) coupons += inrDsc;
    recorded += toINR(tot, o.currency);
    const computedOne = sub + shp + tx - dsc;
    if (Math.abs(computedOne - tot) > 0.5) {
      offenders.push({ order_id: o.id, recorded: round2(tot), computed: round2(computedOne), variance: round2(tot - computedOne) });
    }
  }
  const computed = products + shipping + tax - discounts;
  const tolerance = Math.max(1, recorded * 0.001);
  const revenue: RevenueVerification = {
    has_data: paidOrders.length > 0,
    products: round2(products),
    shipping: round2(shipping),
    tax: round2(tax),
    discounts: round2(discounts),
    coupons: round2(coupons),
    computed: round2(computed),
    recorded: round2(recorded),
    variance: round2(recorded - computed),
    verified: paidOrders.length > 0 && Math.abs(recorded - computed) <= tolerance && offenders.length === 0,
    tolerance: round2(tolerance),
    offenders: offenders.slice(0, 50),
  };

  // ───────────────────────────────── 4. Refund verification
  const refundIssues: VerificationIssue[] = [];
  const refundsByPayment = new Map<string, typeof allRefunds>();
  for (const r of allRefunds) {
    if (!r.payment_id) continue;
    const list = refundsByPayment.get(r.payment_id) ?? [];
    list.push(r);
    refundsByPayment.set(r.payment_id, list);
  }

  const refundNoPayment = refunds.filter((r) => !r.payment_id || !paymentById.has(r.payment_id));
  if (refundNoPayment.length) {
    refundIssues.push({
      id: "refund_without_payment",
      severity: "critical",
      title: "Refund without a matching payment",
      detail: `${refundNoPayment.length} refund(s) reference no payment record.`,
      evidence: refundNoPayment.slice(0, 10).map((r) => r.id),
      drill: { kind: "refund", ids: refundNoPayment.map((r) => r.id), ledger: { status: "refunded" } },
    });
  }

  const doubled = [...refundsByPayment.entries()].filter(([, list]) => list.length > 1);
  if (doubled.length) {
    refundIssues.push({
      id: "payment_refunded_twice",
      severity: "critical",
      title: "Payment refunded more than once",
      detail: `${doubled.length} payment(s) carry multiple refund records.`,
      evidence: doubled.slice(0, 10).map(([pid, list]) => `${pid} · ${list.length} refunds`),
      drill: { kind: "refund", ids: doubled.flatMap(([, l]) => l.map((r) => r.id)), ledger: { status: "refunded" } },
    });
  }

  const excess = [...refundsByPayment.entries()].filter(([pid, list]) => {
    const p = paymentById.get(pid);
    if (!p) return false;
    return list.reduce((s, r) => s + num(r.amount), 0) - num(p.amount) > 0.5;
  });
  if (excess.length) {
    refundIssues.push({
      id: "refund_exceeds_payment",
      severity: "critical",
      title: "Refund exceeds the original payment",
      detail: `${excess.length} payment(s) have refunds greater than the amount captured.`,
      evidence: excess.slice(0, 10).map(([pid]) => pid),
      drill: { kind: "refund", ids: excess.flatMap(([, l]) => l.map((r) => r.id)), ledger: { status: "refunded" } },
    });
  }

  const refundNoOrder = refunds.filter((r) => !r.order_id || !allOrders.some((o) => o.id === r.order_id));
  if (refundNoOrder.length) {
    refundIssues.push({
      id: "refund_without_order",
      severity: "warning",
      title: "Refund without an order",
      detail: `${refundNoOrder.length} refund(s) do not resolve to an order.`,
      evidence: refundNoOrder.slice(0, 10).map((r) => r.id),
      drill: { kind: "refund", ids: refundNoOrder.map((r) => r.id) },
    });
  }

  if (cancelledButPaid.length) {
    refundIssues.push({
      id: "cancelled_missing_refund",
      severity: "warning",
      title: "Cancelled order without a refund",
      detail: `${cancelledButPaid.length} cancelled order(s) were paid but no refund exists.`,
      evidence: cancelledButPaid.slice(0, 10).map((o) => o.id),
      drill: { kind: "order", ids: cancelledButPaid.map((o) => o.id) },
    });
  }

  // ───────────────────────────────── 5. Settlement verification
  const hasSettlementSource = payouts.length > 0 || commissions.length > 0;
  const settlementIssues: VerificationIssue[] = [];
  if (hasSettlementSource) {
    const commissionOrders = new Set(commissions.map((c) => c.order_id).filter(Boolean) as string[]);
    const paidWithoutCommission = paidOrders.filter((o) => !commissionOrders.has(o.id));
    if (paidWithoutCommission.length) {
      settlementIssues.push({
        id: "paid_without_commission",
        severity: "warning",
        title: "Paid order with no commission record",
        detail: `${paidWithoutCommission.length} paid order(s) have no vendor commission entry.`,
        evidence: paidWithoutCommission.slice(0, 10).map((o) => o.id),
        drill: { kind: "order", ids: paidWithoutCommission.map((o) => o.id) },
      });
    }
    const unlinkedCommissions = commissions.filter((c) => !c.payout_id);
    if (unlinkedCommissions.length) {
      settlementIssues.push({
        id: "commission_without_payout",
        severity: "warning",
        title: "Commission not linked to a payout",
        detail: `${unlinkedCommissions.length} commission record(s) are not attached to any payout.`,
        evidence: unlinkedCommissions.slice(0, 10).map((c) => c.id),
        drill: { kind: "vendor", ids: unlinkedCommissions.map((c) => c.vendor_id).filter(Boolean) as string[] },
      });
    }
  }

  const settlement: SettlementVerification = hasSettlementSource
    ? {
        available: true,
        message: "Settlement chain reconstructed from commission and payout records.",
        payments_total: round2(successful.reduce((s, p) => s + toINR(num(p.amount), p.currency), 0)),
        settlements_total: null, // no settlement provider integration records exist
        vendor_payout_total: round2(payouts.reduce((s, p) => s + toINR(num(p.amount), p.currency), 0)),
        platform_commission_total: round2(commissions.reduce((s, c) => s + toINR(num(c.amount), c.currency), 0)),
        missing_links: settlementIssues,
      }
    : {
        available: false,
        message: "No settlement integration available.",
        payments_total: null,
        settlements_total: null,
        vendor_payout_total: null,
        platform_commission_total: null,
        missing_links: [],
      };

  // ───────────────────────────────── 6. Gateway health timelines
  const byGateway = new Map<string, typeof payments>();
  for (const p of payments) {
    const key = (p.method ?? "unknown").toLowerCase();
    const list = byGateway.get(key) ?? [];
    list.push(p);
    byGateway.set(key, list);
  }
  const gateways: GatewayTimeline[] = [...byGateway.entries()].map(([gateway, list]) => {
    const rows = list.map((p) => ({
      at: new Date(p.created_at),
      ok: payState(p.status) === "ok",
      failed: payState(p.status) === "failed",
    }));
    const ok = rows.filter((r) => r.ok).length;
    const failed = rows.filter((r) => r.failed).length;
    return {
      gateway,
      total: list.length,
      success: ok,
      failed,
      pending: list.length - ok - failed,
      success_rate: pct(ok, ok + failed) == null ? null : round2(pct(ok, ok + failed)!),
      hourly: buckets(rows, "hour", 24),
      daily: buckets(rows, "day", 30),
      weekly: buckets(rows, "week", 12),
      timeouts: null,
      retries: null,
      recovery_rate: null,
    };
  }).sort((a, b) => b.total - a.total);

  // ───────────────────────────────── 7. Revenue leakage detector
  const leakage: LeakageFinding[] = [];

  const heavyDiscount = paidOrders.filter((o) => num(o.subtotal) > 0 && num(o.discount) / num(o.subtotal) > 0.4);
  if (heavyDiscount.length) {
    const impact = round2(heavyDiscount.reduce((s, o) => s + toINR(num(o.discount), o.currency), 0));
    leakage.push({
      id: "large_discounts",
      severity: heavyDiscount.length > 5 ? "critical" : "warning",
      title: "Large discount usage",
      detail: `${heavyDiscount.length} paid order(s) discounted over 40% of subtotal.`,
      evidence: heavyDiscount.slice(0, 10).map((o) => `${o.id} · ${Math.round((num(o.discount) / num(o.subtotal)) * 100)}%`),
      impact,
      drill: { kind: "order", ids: heavyDiscount.map((o) => o.id) },
    });
  }

  const couponUse = new Map<string, string[]>();
  for (const o of paidOrders) if (o.promo_code) couponUse.set(o.promo_code, [...(couponUse.get(o.promo_code) ?? []), o.id]);
  const abusedCoupons = [...couponUse.entries()].filter(([, ids]) => ids.length >= 10);
  if (abusedCoupons.length) {
    leakage.push({
      id: "coupon_abuse",
      severity: "warning",
      title: "Concentrated coupon usage",
      detail: `${abusedCoupons.length} coupon code(s) used on 10+ orders in this window.`,
      evidence: abusedCoupons.slice(0, 10).map(([c, ids]) => `${c} · ${ids.length} orders`),
      impact: null,
      drill: { kind: "order", ids: abusedCoupons.flatMap(([, ids]) => ids) },
    });
  }

  const failRate = pct(failedPayments.length, payments.length);
  if (failRate != null && failRate > 20 && payments.length >= 10) {
    leakage.push({
      id: "abnormal_failures",
      severity: "critical",
      title: "Abnormal failed payment rate",
      detail: `${failedPayments.length} of ${payments.length} payments failed (${failRate.toFixed(1)}%).`,
      evidence: failedPayments.slice(0, 10).map((p) => p.id),
      impact: round2(failedPayments.reduce((s, p) => s + toINR(num(p.amount), p.currency), 0)),
      drill: { kind: "payment", ids: failedPayments.map((p) => p.id), ledger: { status: "failed" } },
    });
  }

  const codOrders = paidOrders.filter((o) => (o.payment_method ?? "").toLowerCase().includes("cod"));
  const codCancelled = cancelledOrders.filter((o) => (o.payment_method ?? "").toLowerCase().includes("cod"));
  if (codOrders.length + codCancelled.length >= 10) {
    const rate = pct(codCancelled.length, codOrders.length + codCancelled.length);
    if (rate != null && rate > 25) {
      leakage.push({
        id: "cod_abuse",
        severity: "warning",
        title: "High cash-on-delivery cancellation rate",
        detail: `${codCancelled.length} of ${codOrders.length + codCancelled.length} COD orders were cancelled (${rate.toFixed(1)}%).`,
        evidence: codCancelled.slice(0, 10).map((o) => o.id),
        impact: round2(codCancelled.reduce((s, o) => s + toINR(num(o.total), o.currency), 0)),
        drill: { kind: "order", ids: codCancelled.map((o) => o.id) },
      });
    }
  }

  if (doubled.length) {
    leakage.push({
      id: "multiple_refunds",
      severity: "critical",
      title: "Multiple refunds on one payment",
      detail: `${doubled.length} payment(s) refunded more than once.`,
      evidence: doubled.slice(0, 10).map(([pid, l]) => `${pid} · ${l.length}`),
      impact: round2(doubled.reduce((s, [, l]) => s + l.reduce((x, r) => x + toINR(num(r.amount), r.currency), 0), 0)),
      drill: { kind: "refund", ids: doubled.flatMap(([, l]) => l.map((r) => r.id)), ledger: { status: "refunded" } },
    });
  }

  const dupPayments = new Map<string, string[]>();
  for (const p of successful) {
    if (!p.order_id) continue;
    dupPayments.set(p.order_id, [...(dupPayments.get(p.order_id) ?? []), p.id]);
  }
  const duplicates = [...dupPayments.entries()].filter(([, ids]) => ids.length > 1);
  if (duplicates.length) {
    leakage.push({
      id: "duplicate_payments",
      severity: "critical",
      title: "Duplicate successful payments on one order",
      detail: `${duplicates.length} order(s) captured more than one successful payment.`,
      evidence: duplicates.slice(0, 10).map(([oid, ids]) => `${oid} · ${ids.length} payments`),
      impact: null,
      drill: { kind: "payment", ids: duplicates.flatMap(([, ids]) => ids), ledger: { status: "succeeded" } },
    });
  }

  // high refund products (needs items + refunds on those orders)
  const refundedOrderIds = new Set(refunds.map((r) => r.order_id).filter(Boolean) as string[]);
  const productRefunds = new Map<string, { v: number; n: number }>();
  for (const it of items) {
    if (refundedOrderIds.has(it.order_id)) bump(productRefunds, it.name || it.product_slug || "Unknown", num(it.line_total));
  }
  const topRefundProducts = topList(productRefunds, 5).filter((p) => p.n >= 3);
  if (topRefundProducts.length) {
    leakage.push({
      id: "high_refund_products",
      severity: "warning",
      title: "Products concentrated in refunded orders",
      detail: `${topRefundProducts.length} product(s) appear in 3+ refunded orders.`,
      evidence: topRefundProducts.map((p) => `${p.k} · ${p.n} refunded orders`),
      impact: round2(topRefundProducts.reduce((s, p) => s + p.v, 0)),
      drill: { kind: "product", ids: topRefundProducts.map((p) => p.k), ledger: { status: "refunded" } },
    });
  }

  // ───────────────────────────────── 8. Country intelligence
  const byCountry = new Map<string, typeof orders>();
  for (const o of orders) {
    const c = orderCountry(o);
    byCountry.set(c, [...(byCountry.get(c) ?? []), o]);
  }
  const prevByCountry = new Map<string, number>();
  for (const o of prevOrders) {
    const c = orderCountry(o);
    prevByCountry.set(c, (prevByCountry.get(c) ?? 0) + toINR(num(o.total), o.currency));
  }
  const refundsByOrder = new Map<string, number>();
  for (const r of refunds) if (r.order_id) refundsByOrder.set(r.order_id, (refundsByOrder.get(r.order_id) ?? 0) + toINR(num(r.amount), r.currency));

  const buildCountry = (code: string, list: typeof orders): CountryIntel => {
    const paid = list.filter((o) => paidOrderIds.has(o.id) || ["paid", "succeeded", "captured"].includes((o.payment_status ?? "").toLowerCase()));
    const rev = paid.reduce((s, o) => s + num(o.total), 0);
    const revInr = paid.reduce((s, o) => s + toINR(num(o.total), o.currency), 0);
    const buyers = new Map<string, number>();
    for (const o of list) if (o.user_id) buyers.set(o.user_id, (buyers.get(o.user_id) ?? 0) + 1);
    const cur = new Map<string, { v: number; n: number }>();
    const cities = new Map<string, { v: number; n: number }>();
    const states = new Map<string, { v: number; n: number }>();
    for (const o of paid) {
      bump(cur, (o.currency ?? "INR").toUpperCase(), num(o.total));
      const city = addr(o.shipping_address, "city");
      const st = addr(o.shipping_address, "state") ?? addr(o.shipping_address, "region");
      if (city) bump(cities, city, toINR(num(o.total), o.currency));
      if (st) bump(states, st, toINR(num(o.total), o.currency));
    }
    const prev = prevByCountry.get(code) ?? 0;
    const refundCount = list.filter((o) => refundsByOrder.has(o.id)).length;
    return {
      code,
      label: countryLabel(code),
      revenue: round2(rev),
      revenue_inr: round2(revInr),
      orders: list.length,
      customers: buyers.size,
      repeat_buyers: [...buyers.values()].filter((n) => n > 1).length,
      refunds: refundCount,
      refund_amount: round2(list.reduce((s, o) => s + (refundsByOrder.get(o.id) ?? 0), 0)),
      tax: round2(paid.reduce((s, o) => s + toINR(num(o.tax), o.currency), 0)),
      currencies: topList(cur, 6),
      growth: prev > 0 ? round2(((revInr - prev) / prev) * 100) : null,
      avg_order: paid.length ? round2(revInr / paid.length) : null,
      conversion: null,
      top_cities: topList(cities, 6),
      top_states: topList(states, 6),
    };
  };

  const indiaOrders = byCountry.get("IN") ?? [];
  const intlOrders = orders.filter((o) => orderCountry(o) !== "IN" && orderCountry(o) !== "UNKNOWN");
  const countries = {
    india: indiaOrders.length ? buildCountry("IN", indiaOrders) : null,
    international: intlOrders.length ? { ...buildCountry("INTL", intlOrders), label: "International" } : null,
    by_country: [...byCountry.entries()]
      .filter(([c]) => c !== "UNKNOWN")
      .map(([c, list]) => buildCountry(c, list))
      .sort((a, b) => b.revenue_inr - a.revenue_inr)
      .slice(0, 20),
  };

  // ───────────────────────────────── 9. Vendor finance intelligence
  const vendorRows: VendorFinance[] = vendors.map((v) => {
    const vc = commissions.filter((c) => c.vendor_id === v.id);
    const vOrderIds = new Set(vc.map((c) => c.order_id).filter(Boolean) as string[]);
    const vOrders = orders.filter((o) => vOrderIds.has(o.id));
    const vPrev = prevOrders.filter((o) => vOrderIds.has(o.id));
    const rev = vOrders.reduce((s, o) => s + toINR(num(o.total), o.currency), 0);
    const prevRev = vPrev.reduce((s, o) => s + toINR(num(o.total), o.currency), 0);
    const refundedCount = vOrders.filter((o) => refundsByOrder.has(o.id)).length;
    const refundAmt = vOrders.reduce((s, o) => s + (refundsByOrder.get(o.id) ?? 0), 0);
    const cancelled = vOrders.filter((o) => (o.status ?? "").toLowerCase() === "cancelled").length;
    const commission = vc.reduce((s, c) => s + toINR(num(c.amount), c.currency), 0);
    const paidOut = payouts.filter((p) => p.vendor_id === v.id && (p.status ?? "").toLowerCase() === "paid")
      .reduce((s, p) => s + toINR(num(p.amount), p.currency), 0);
    const pendingOut = payouts.filter((p) => p.vendor_id === v.id && (p.status ?? "").toLowerCase() !== "paid")
      .reduce((s, p) => s + toINR(num(p.amount), p.currency), 0);
    const refundRate = pct(refundedCount, vOrders.length);
    const cancelRate = pct(cancelled, vOrders.length);
    const hasSignal = vOrders.length > 0;
    const risk = hasSignal
      ? Math.min(100, Math.round((refundRate ?? 0) * 1.5 + (cancelRate ?? 0) * 1.2))
      : null;
    return {
      vendor_id: v.id,
      name: (v.business_name as string) ?? "Vendor",
      revenue: round2(rev),
      orders: vOrders.length,
      refunds: refundedCount,
      refund_amount: round2(refundAmt),
      cancelled,
      avg_order: vOrders.length ? round2(rev / vOrders.length) : null,
      growth: prevRev > 0 ? round2(((rev - prevRev) / prevRev) * 100) : null,
      commission: vc.length ? round2(commission) : null,
      payout: payouts.some((p) => p.vendor_id === v.id) ? round2(paidOut) : null,
      pending: payouts.some((p) => p.vendor_id === v.id) ? round2(pendingOut) : null,
      rank: 0,
      risk_score: risk,
      risk_reason: hasSignal
        ? `Refund rate ${refundRate?.toFixed(1) ?? "0.0"}% · cancellation rate ${cancelRate?.toFixed(1) ?? "0.0"}%`
        : "No orders attributed in this window",
    };
  }).sort((a, b) => b.revenue - a.revenue).map((v, i) => ({ ...v, rank: i + 1 }));

  // ───────────────────────────────── 11. Executive insight (exactly one, evidence-backed)
  let insight: ExecutiveInsight = null;
  const candidates: { score: number; value: ExecutiveInsight }[] = [];

  const criticalRefund = refundIssues.find((i) => i.severity === "critical");
  if (criticalRefund) {
    candidates.push({
      score: 100,
      value: {
        headline: criticalRefund.title,
        evidence: [criticalRefund.detail, ...criticalRefund.evidence.slice(0, 3)],
        confidence: "high",
        impact: "Direct cash loss — refunds not backed by a matching payment.",
        action_label: "Open refund records",
        drill: criticalRefund.drill,
      },
    });
  }
  const criticalLeak = leakage.find((l) => l.severity === "critical");
  if (criticalLeak) {
    candidates.push({
      score: 90,
      value: {
        headline: criticalLeak.title,
        evidence: [criticalLeak.detail, ...criticalLeak.evidence.slice(0, 3)],
        confidence: "high",
        impact: criticalLeak.impact != null ? `Approximately ₹${criticalLeak.impact.toLocaleString("en-IN")} exposed.` : "Revenue exposure detected.",
        action_label: "Open affected records",
        drill: criticalLeak.drill,
      },
    });
  }
  if (mismatches.length) {
    const m = mismatches[0]!;
    candidates.push({
      score: 80,
      value: {
        headline: m.label,
        evidence: [m.detail, `Difference: ${m.difference}`],
        confidence: "high",
        impact: "Reconciliation gap between orders and payments.",
        action_label: "Open mismatched records",
        drill: m.drill,
      },
    });
  }
  if (!revenue.verified && revenue.has_data) {
    candidates.push({
      score: 70,
      value: {
        headline: "Recorded revenue does not match its components",
        evidence: [
          `Computed ₹${revenue.computed.toLocaleString("en-IN")} vs recorded ₹${revenue.recorded.toLocaleString("en-IN")}`,
          `${revenue.offenders.length} order(s) with a per-order variance`,
        ],
        confidence: revenue.offenders.length ? "high" : "medium",
        impact: `Variance of ₹${Math.abs(revenue.variance).toLocaleString("en-IN")} across the window.`,
        action_label: "Open revenue verification",
        drill: revenue.offenders.length ? { kind: "order", ids: revenue.offenders.map((o) => o.order_id) } : null,
      },
    });
  }
  candidates.sort((a, b) => b.score - a.score);
  insight = candidates[0]?.value ?? null;

  return {
    window_days: windowDays,
    generated_at: new Date().toISOString(),
    currency: "INR",
    reconciliation,
    revenue,
    refund_issues: refundIssues,
    settlement,
    gateways,
    leakage,
    countries,
    vendors: vendorRows,
    insight,
  };
}

// ───────────────────────────────────────────────── 10. Financial audit explorer

export type AuditRecord = {
  kind: "order" | "payment" | "refund";
  id: string;
  created_at: string;
  updated_at: string | null;
  amount: number;
  currency: string;
  status: string;
  country: string | null;
  gateway: string | null;
  /** Masked in the UI — never a raw customer identity dump. */
  customer_ref: string | null;
  timeline: { at: string; kind: string; label: string; detail?: string | null }[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Search orders / payments / refunds and rebuild each record's full timeline. */
export async function searchFinancialAudit(input: {
  query?: string; from?: string; to?: string; gateway?: string; currency?: string; country?: string; limit?: number;
}): Promise<{ records: AuditRecord[]; truncated: boolean }> {
  const q = (input.query ?? "").trim();
  const limit = Math.min(input.limit ?? 25, 50);

  let orderQ = supabaseAdmin
    .from("orders")
    .select("id,user_id,status,payment_status,currency,total,contact_email,shipping_address,market_region,payment_method,created_at,updated_at,paid_at,cancelled_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (input.from) orderQ = orderQ.gte("created_at", input.from);
  if (input.to) orderQ = orderQ.lte("created_at", `${input.to}T23:59:59.999Z`);
  if (input.currency) orderQ = orderQ.eq("currency", input.currency);
  if (q) {
    if (UUID.test(q)) orderQ = orderQ.eq("id", q);
    else if (q.includes("@")) orderQ = orderQ.eq("contact_email", q);
    else orderQ = orderQ.or(`razorpay_order_id.eq.${q},razorpay_payment_id.eq.${q}`);
  }

  const { data: orderRows } = await orderQ;
  let orders = orderRows ?? [];

  // Payment / refund id search resolves back to its order.
  if (q && UUID.test(q) && orders.length === 0) {
    const [{ data: p }, { data: r }] = await Promise.all([
      supabaseAdmin.from("payments").select("order_id").eq("id", q).maybeSingle(),
      supabaseAdmin.from("refunds").select("order_id").eq("id", q).maybeSingle(),
    ]);
    const oid = p?.order_id ?? r?.order_id;
    if (oid) {
      const { data } = await supabaseAdmin
        .from("orders")
        .select("id,user_id,status,payment_status,currency,total,contact_email,shipping_address,market_region,payment_method,created_at,updated_at,paid_at,cancelled_at")
        .eq("id", oid);
      orders = data ?? [];
    }
  }

  if (!orders.length) return { records: [], truncated: false };

  const ids = orders.map((o) => o.id);
  const [{ data: pays }, { data: refs }, { data: logs }, { data: sec }] = await Promise.all([
    supabaseAdmin.from("payments").select("id,order_id,status,amount,currency,method,transaction_id,created_at").in("order_id", ids),
    supabaseAdmin.from("refunds").select("id,order_id,payment_id,amount,currency,status,reason,created_at,updated_at").in("order_id", ids),
    supabaseAdmin.from("admin_activity_logs").select("action,entity_id,created_at,entity_type").in("entity_id", ids).limit(200),
    supabaseAdmin.from("security_audit_log").select("action,target,created_at,success").in("target", ids).limit(200),
  ]);

  const records: AuditRecord[] = orders.map((o) => {
    const op = (pays ?? []).filter((p) => p.order_id === o.id);
    const or = (refs ?? []).filter((r) => r.order_id === o.id);
    const timeline: AuditRecord["timeline"] = [
      { at: o.created_at, kind: "order", label: "Order created", detail: o.status },
    ];
    if (o.paid_at) timeline.push({ at: o.paid_at, kind: "payment", label: "Order marked paid" });
    if (o.cancelled_at) timeline.push({ at: o.cancelled_at, kind: "order", label: "Order cancelled" });
    if (o.updated_at && o.updated_at !== o.created_at) timeline.push({ at: o.updated_at, kind: "order", label: "Order updated" });
    for (const p of op) timeline.push({ at: p.created_at, kind: "payment", label: `Payment ${p.status}`, detail: p.method });
    for (const r of or) timeline.push({ at: r.created_at, kind: "refund", label: `Refund ${r.status}`, detail: r.reason });
    for (const l of (logs ?? []).filter((l) => l.entity_id === o.id)) {
      timeline.push({ at: l.created_at, kind: "admin", label: `Admin: ${l.action}`, detail: l.entity_type });
    }
    for (const s of (sec ?? []).filter((s) => s.target === o.id)) {
      timeline.push({ at: s.created_at, kind: "security", label: `Security: ${s.action}`, detail: s.success ? "allowed" : "denied" });
    }
    timeline.sort((a, b) => a.at.localeCompare(b.at));

    const country = addr(o.shipping_address, "country") ?? ((o.market_region ?? "").toLowerCase() === "india" ? "IN" : null);
    return {
      kind: "order" as const,
      id: o.id,
      created_at: o.created_at,
      updated_at: o.updated_at ?? null,
      amount: num(o.total),
      currency: (o.currency ?? "INR").toUpperCase(),
      status: o.status ?? "unknown",
      country,
      gateway: op[0]?.method ?? o.payment_method ?? null,
      customer_ref: o.user_id ?? null,
      timeline,
    };
  }).filter((rec) => {
    if (input.country && (rec.country ?? "").toUpperCase() !== input.country.toUpperCase()) return false;
    if (input.gateway && (rec.gateway ?? "").toLowerCase() !== input.gateway.toLowerCase()) return false;
    return true;
  });

  return { records, truncated: orders.length >= limit };
}
