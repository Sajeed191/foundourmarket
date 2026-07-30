/**
 * Payments Center v4 — Financial Intelligence (server-only, READ ONLY).
 *
 * Extends v3.5 without touching payment processing, checkout, gateways or schema.
 * Every metric is derived from rows that already exist. Anything without a data
 * source in the platform is returned as `null` / `available: false` so the UI can
 * hide the section or render an honest empty state. Nothing is estimated.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { classify, regionOf, type Bucket, type DayPoint, type Region } from "./payments-center-v3.server";

const num = (v: unknown) => Number(v ?? 0) || 0;
const day = (iso: string) => iso.slice(0, 10);
const pct = (curr: number, prev: number): number | null => (prev ? ((curr - prev) / prev) * 100 : null);

/* ------------------------------------------------------------------ types */

export type ExecutiveSummary = {
  today_revenue: number;
  yesterday_revenue: number;
  vs_yesterday: number | null;
  trend_7d: number | null;
  trend_30d: number | null;
  revenue_7d: number;
  revenue_30d: number;
  mtd_revenue: number;
  ytd_revenue: number;
  gross_revenue: number;
  total_refunds: number;
  net_revenue: number;
  /** No settlement feed exists in the platform yet. */
  outstanding_settlements: number | null;
  aov: number;
  success_rate: number | null;
  currency: string;
};

export type RevenueBreakdown = {
  available: boolean;
  products: number;
  shipping: number;
  taxes: number;
  discounts: number;
  coupons: number;
  gross: number;
  refunds: number;
  net: number;
  commission: number | null;
  vendor_earnings: number | null;
  platform_earnings: number | null;
};

export type RankingBlock = {
  categories: Bucket[];
  brands: Bucket[];
  vendors: Bucket[];
  products: Bucket[];
  weakest_categories: Bucket[];
};

export type FailureCenter = {
  available: boolean;
  failed_count: number;
  failed_value: number;
  reasons: Bucket[];
  gateway_errors: number;
  bank_errors: number;
  user_cancelled: number;
  timeouts: number;
  unknown: number;
  /** Share of orders that failed once and later succeeded. */
  retry_success_rate: number | null;
  most_common: string | null;
};

export type RefundCenter = {
  available: boolean;
  pending_count: number;
  pending_value: number;
  completed_count: number;
  completed_value: number;
  avg_hours: number | null;
  refund_rate: number | null;
  reasons: Bucket[];
  trend: { date: string; value: number; count: number }[];
};

export type SettlementIntel = {
  available: boolean;
  reason: string;
  upcoming: never[];
  completed: never[];
  delayed: never[];
  pending: never[];
  by_gateway: never[];
};

export type CommissionBlock = {
  available: boolean;
  collected: number;
  vendor_earnings: number;
  platform_earnings: number;
  rate: number | null;
  trend: { date: string; value: number }[];
};

export type CustomerInsights = {
  available: boolean;
  top: { id: string; label: string; v: number; n: number }[];
  avg_spend: number | null;
  repeat_revenue: number;
  first_time_revenue: number;
  repeat_share: number | null;
};

export type RiskCard = {
  id: string;
  severity: "warn" | "bad";
  title: string;
  detail: string;
};

export type Recommendation = {
  id: string;
  priority: number;
  title: string;
  detail: string;
  action_label: string;
  action: "ledger_failed" | "ledger_refunds" | "region_india" | "region_intl" | "gateways" | "overview";
};

export type AuditEntry = {
  id: string;
  at: string;
  actor: string | null;
  action: string;
  entity: string | null;
  source: "admin" | "security";
};

export type FinancialIntelligence = {
  executive: ExecutiveSummary;
  breakdown: RevenueBreakdown;
  rankings: RankingBlock;
  failures: FailureCenter;
  refunds: RefundCenter;
  settlements: SettlementIntel;
  commission: CommissionBlock;
  customers: CustomerInsights;
  risks: RiskCard[];
  recommendations: Recommendation[];
  audit: AuditEntry[];
  regions: Record<Region, { revenue: number; orders: number }>;
  daily: DayPoint[];
  window_days: number;
  generated_at: string;
  has_any_data: boolean;
};

/* -------------------------------------------------------------- internals */

type OrderRow = {
  id: string; user_id: string | null; contact_email: string | null; currency: string | null;
  total: number | null; subtotal: number | null; discount: number | null; shipping: number | null;
  tax: number | null; promo_code: string | null; status: string | null; payment_status: string | null;
  market_region: string | null; shipping_address: Record<string, unknown> | null; created_at: string;
  paid_at: string | null; payment_method: string | null; payment_provider: string | null;
};

type PayRow = {
  id: string; order_id: string | null; status: string | null; amount: number | null;
  currency: string | null; method: string | null; meta: Record<string, unknown> | null; created_at: string;
};

const PAID = new Set(["paid", "succeeded", "captured", "settled", "completed"]);

function bump(map: Map<string, Bucket>, key: string | null | undefined, v: number) {
  const k = (key ?? "").trim() || "unknown";
  const cur = map.get(k) ?? { k, v: 0, n: 0 };
  cur.v += v;
  cur.n += 1;
  map.set(k, cur);
}
const top = (m: Map<string, Bucket>, limit = 8) => [...m.values()].sort((a, b) => b.v - a.v).slice(0, limit);
const bottom = (m: Map<string, Bucket>, limit = 5) => [...m.values()].sort((a, b) => a.v - b.v).slice(0, limit);

/** Extract a normalised failure reason from whatever the gateway stored in `meta`. */
function failureReason(meta: Record<string, unknown> | null): string {
  if (!meta) return "unknown";
  const candidates = ["error_reason", "error_description", "failure_reason", "reason", "error_code", "description"];
  for (const key of candidates) {
    const v = meta[key];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 60).toLowerCase();
  }
  const err = meta.error;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    for (const key of ["description", "reason", "code"]) {
      const v = e[key];
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, 60).toLowerCase();
    }
  }
  return "unknown";
}

function classifyFailure(reason: string): "gateway" | "bank" | "cancelled" | "timeout" | "unknown" {
  const r = reason.toLowerCase();
  if (r === "unknown") return "unknown";
  if (/(cancel|abandon|user_?closed|dismiss)/.test(r)) return "cancelled";
  if (/(timeout|timed out|expired|no response)/.test(r)) return "timeout";
  if (/(bank|issuer|insufficient|card_declined|do not honou?r|invalid card|cvv|otp)/.test(r)) return "bank";
  if (/(gateway|network|server|internal|api|upstream|razorpay|stripe|paypal)/.test(r)) return "gateway";
  return "gateway";
}

/* ----------------------------------------------------------------- build */

export async function buildFinancialIntelligence(windowDays: number): Promise<FinancialIntelligence> {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).toISOString();
  const historySince = yearStart < since ? yearStart : since;

  const [ordRes, payRes, refRes, itemRes, vcRes, adminRes, secRes] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select(
        "id,user_id,contact_email,currency,total,subtotal,discount,shipping,tax,promo_code,status,payment_status,market_region,shipping_address,created_at,paid_at,payment_method,payment_provider",
      )
      .gte("created_at", historySince)
      .order("created_at", { ascending: false })
      .limit(20000),
    supabaseAdmin
      .from("payments")
      .select("id,order_id,status,amount,currency,method,meta,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000),
    supabaseAdmin
      .from("refunds")
      .select("id,order_id,amount,currency,reason,status,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from("order_items")
      .select("order_id,product_slug,name,line_total,quantity")
      .gte("created_at", since)
      .limit(20000),
    supabaseAdmin
      .from("vendor_commissions")
      .select("id,vendor_id,order_id,amount,rate,currency,status,created_at")
      .gte("created_at", since)
      .limit(5000),
    supabaseAdmin
      .from("admin_activity_logs")
      .select("id,actor_id,action,entity_type,entity_id,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    supabaseAdmin
      .from("security_audit_log")
      .select("id,actor_id,action,success,created_at")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  const orders = (ordRes.data ?? []) as unknown as OrderRow[];
  const payments = (payRes.data ?? []) as unknown as PayRow[];
  const refunds = (refRes.data ?? []) as unknown as {
    id: string; order_id: string | null; amount: number | null; currency: string | null;
    reason: string | null; status: string | null; created_at: string; updated_at: string | null;
  }[];
  const items = (itemRes.data ?? []) as unknown as {
    order_id: string | null; product_slug: string | null; name: string | null; line_total: number | null; quantity: number | null;
  }[];
  const commissions = (vcRes.data ?? []) as unknown as {
    id: string; vendor_id: string | null; order_id: string | null; amount: number | null;
    rate: number | null; currency: string | null; status: string | null; created_at: string;
  }[];

  const paidOrders = orders.filter((o) => PAID.has((o.payment_status ?? "").toLowerCase()) || !!o.paid_at);
  const currency = (paidOrders[0]?.currency ?? orders[0]?.currency ?? "INR").toUpperCase();
  const hasAny = orders.length > 0 || payments.length > 0;

  /* ---------------------------------------------------------- executive */
  const nowMs = Date.now();
  const todayKey = new Date().toISOString().slice(0, 10);
  const yKey = new Date(nowMs - 86400_000).toISOString().slice(0, 10);
  const monthPrefix = todayKey.slice(0, 7);
  const yearPrefix = todayKey.slice(0, 4);

  let today = 0, yesterday = 0, mtd = 0, ytd = 0, gross = 0, windowRevenue = 0;
  let r7 = 0, p7 = 0, r30 = 0, p30 = 0;
  const dailyMap = new Map<string, DayPoint>();
  const regionAgg: Record<Region, { revenue: number; orders: number }> = {
    india: { revenue: 0, orders: 0 },
    international: { revenue: 0, orders: 0 },
  };

  for (const o of paidOrders) {
    const stamp = o.paid_at ?? o.created_at;
    const k = day(stamp);
    const t = new Date(stamp).getTime();
    const v = num(o.total);
    const ageDays = (nowMs - t) / 86400_000;

    if (k === todayKey) today += v;
    if (k === yKey) yesterday += v;
    if (k.startsWith(monthPrefix)) mtd += v;
    if (k.startsWith(yearPrefix)) ytd += v;
    if (ageDays <= 7) r7 += v; else if (ageDays <= 14) p7 += v;
    if (ageDays <= 30) r30 += v; else if (ageDays <= 60) p30 += v;

    if (t >= new Date(since).getTime()) {
      gross += v;
      windowRevenue += v;
      const dp = dailyMap.get(k) ?? { date: k, revenue: 0, orders: 0, refunds: 0 };
      dp.revenue += v;
      dp.orders += 1;
      dailyMap.set(k, dp);
      const region = regionOf(o as never);
      regionAgg[region].revenue += v;
      regionAgg[region].orders += 1;
    }
  }

  const refundTotal = refunds.reduce((s, r) => s + num(r.amount), 0);
  for (const r of refunds) {
    const k = day(r.created_at);
    const dp = dailyMap.get(k);
    if (dp) dp.refunds += num(r.amount);
  }
  const daily = [...dailyMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  let okN = 0, attemptedN = 0;
  for (const p of payments) {
    const c = classify(p.status);
    if (c !== "other") attemptedN += 1;
    if (c === "succeeded") okN += 1;
  }

  const paidWindowCount = paidOrders.filter((o) => new Date(o.paid_at ?? o.created_at).getTime() >= new Date(since).getTime()).length;

  const executive: ExecutiveSummary = {
    today_revenue: today,
    yesterday_revenue: yesterday,
    vs_yesterday: pct(today, yesterday),
    trend_7d: pct(r7, p7),
    trend_30d: pct(r30, p30),
    revenue_7d: r7,
    revenue_30d: r30,
    mtd_revenue: mtd,
    ytd_revenue: ytd,
    gross_revenue: gross,
    total_refunds: refundTotal,
    net_revenue: gross - refundTotal,
    outstanding_settlements: null,
    aov: paidWindowCount ? windowRevenue / paidWindowCount : 0,
    success_rate: attemptedN ? (okN / attemptedN) * 100 : null,
    currency,
  };

  /* -------------------------------------------------------- breakdown */
  let products = 0, shipping = 0, taxes = 0, discounts = 0, coupons = 0;
  for (const o of paidOrders) {
    if (new Date(o.paid_at ?? o.created_at).getTime() < new Date(since).getTime()) continue;
    products += num(o.subtotal);
    shipping += num(o.shipping);
    taxes += num(o.tax);
    discounts += num(o.discount);
    if (o.promo_code) coupons += num(o.discount);
  }

  const commissionTotal = commissions.reduce((s, c) => s + num(c.amount), 0);
  const commissionAvailable = commissions.length > 0;

  const breakdown: RevenueBreakdown = {
    available: paidWindowCount > 0,
    products,
    shipping,
    taxes,
    discounts,
    coupons,
    gross,
    refunds: refundTotal,
    net: gross - refundTotal,
    commission: commissionAvailable ? commissionTotal : null,
    vendor_earnings: commissionAvailable ? gross - commissionTotal : null,
    platform_earnings: commissionAvailable ? commissionTotal : null,
  };

  /* --------------------------------------------------------- rankings */
  const paidIds = new Set(paidOrders.map((o) => o.id));
  const bySlug = new Map<string, number>();
  const productMap = new Map<string, Bucket>();
  for (const it of items) {
    if (!it.order_id || !paidIds.has(it.order_id)) continue;
    const v = num(it.line_total);
    const label = it.name ?? it.product_slug ?? "unknown";
    bump(productMap, label, v);
    if (it.product_slug) bySlug.set(it.product_slug, (bySlug.get(it.product_slug) ?? 0) + v);
  }

  const catMap = new Map<string, Bucket>();
  const brandMap = new Map<string, Bucket>();
  if (bySlug.size) {
    const slugs = [...bySlug.keys()].slice(0, 1000);
    const { data: prodRows } = await supabaseAdmin
      .from("products")
      .select("slug,category,brand")
      .in("slug", slugs);
    for (const row of (prodRows ?? []) as unknown as { slug: string; category: string | null; brand: string | null }[]) {
      const v = bySlug.get(row.slug) ?? 0;
      bump(catMap, row.category, v);
      if (row.brand) bump(brandMap, row.brand, v);
    }
  }

  const vendorMap = new Map<string, Bucket>();
  if (commissions.length) {
    const ids = [...new Set(commissions.map((c) => c.vendor_id).filter(Boolean))] as string[];
    const { data: vendorRows } = await supabaseAdmin.from("vendors").select("id,business_name").in("id", ids);
    const names = new Map(((vendorRows ?? []) as unknown as { id: string; business_name: string | null }[])
      .map((v) => [v.id, v.business_name ?? v.id.slice(0, 8)]));
    for (const c of commissions) {
      if (!c.vendor_id) continue;
      bump(vendorMap, names.get(c.vendor_id) ?? c.vendor_id.slice(0, 8), num(c.amount));
    }
  }

  const rankings: RankingBlock = {
    categories: top(catMap),
    brands: top(brandMap),
    vendors: top(vendorMap),
    products: top(productMap),
    weakest_categories: catMap.size > 3 ? bottom(catMap) : [],
  };

  /* --------------------------------------------------------- failures */
  const failedPayments = payments.filter((p) => classify(p.status) === "failed");
  const reasonMap = new Map<string, Bucket>();
  let gatewayErr = 0, bankErr = 0, cancelled = 0, timeouts = 0, unknownErr = 0;
  for (const p of failedPayments) {
    const reason = failureReason(p.meta);
    bump(reasonMap, reason, num(p.amount));
    switch (classifyFailure(reason)) {
      case "gateway": gatewayErr += 1; break;
      case "bank": bankErr += 1; break;
      case "cancelled": cancelled += 1; break;
      case "timeout": timeouts += 1; break;
      default: unknownErr += 1;
    }
  }
  const failedOrderIds = new Set(failedPayments.map((p) => p.order_id).filter(Boolean) as string[]);
  const recoveredOrders = payments.filter(
    (p) => classify(p.status) === "succeeded" && p.order_id && failedOrderIds.has(p.order_id),
  );
  const recoveredIds = new Set(recoveredOrders.map((p) => p.order_id as string));
  const reasonsSorted = top(reasonMap, 10);

  const failures: FailureCenter = {
    available: failedPayments.length > 0,
    failed_count: failedPayments.length,
    failed_value: failedPayments.reduce((s, p) => s + num(p.amount), 0),
    reasons: reasonsSorted,
    gateway_errors: gatewayErr,
    bank_errors: bankErr,
    user_cancelled: cancelled,
    timeouts,
    unknown: unknownErr,
    retry_success_rate: failedOrderIds.size ? (recoveredIds.size / failedOrderIds.size) * 100 : null,
    most_common: reasonsSorted[0]?.k ?? null,
  };

  /* ---------------------------------------------------------- refunds */
  const refundReasons = new Map<string, Bucket>();
  const refundTrend = new Map<string, { date: string; value: number; count: number }>();
  let pendingCount = 0, pendingValue = 0, completedCount = 0, completedValue = 0;
  let hoursSum = 0, hoursN = 0;
  for (const r of refunds) {
    const st = classify(r.status);
    const amt = num(r.amount);
    bump(refundReasons, r.reason, amt);
    const k = day(r.created_at);
    const cur = refundTrend.get(k) ?? { date: k, value: 0, count: 0 };
    cur.value += amt; cur.count += 1;
    refundTrend.set(k, cur);
    if (st === "succeeded" || st === "refunded") {
      completedCount += 1; completedValue += amt;
      if (r.updated_at) {
        const h = (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 3600_000;
        if (h >= 0) { hoursSum += h; hoursN += 1; }
      }
    } else if (st === "pending" || st === "processing") {
      pendingCount += 1; pendingValue += amt;
    }
  }

  const refundCenter: RefundCenter = {
    available: refunds.length > 0,
    pending_count: pendingCount,
    pending_value: pendingValue,
    completed_count: completedCount,
    completed_value: completedValue,
    avg_hours: hoursN ? hoursSum / hoursN : null,
    refund_rate: gross ? (refundTotal / gross) * 100 : null,
    reasons: top(refundReasons, 8),
    trend: [...refundTrend.values()].sort((a, b) => a.date.localeCompare(b.date)),
  };

  /* ------------------------------------------------------ settlements */
  const settlements: SettlementIntel = {
    available: false,
    reason:
      "No gateway settlement feed is connected, so upcoming, delayed and completed settlements cannot be shown without inventing data.",
    upcoming: [], completed: [], delayed: [], pending: [], by_gateway: [],
  };

  /* ------------------------------------------------------- commission */
  const commissionTrend = new Map<string, number>();
  for (const c of commissions) {
    const k = day(c.created_at);
    commissionTrend.set(k, (commissionTrend.get(k) ?? 0) + num(c.amount));
  }
  const rates = commissions.map((c) => num(c.rate)).filter((r) => r > 0);
  const commission: CommissionBlock = {
    available: commissionAvailable,
    collected: commissionTotal,
    vendor_earnings: gross - commissionTotal,
    platform_earnings: commissionTotal,
    rate: rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null,
    trend: [...commissionTrend.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date)),
  };

  /* -------------------------------------------------------- customers */
  const custMap = new Map<string, { id: string; label: string; v: number; n: number }>();
  for (const o of paidOrders) {
    const id = o.user_id ?? o.contact_email ?? null;
    if (!id) continue;
    const cur = custMap.get(id) ?? { id, label: o.contact_email ?? id.slice(0, 8), v: 0, n: 0 };
    cur.v += num(o.total);
    cur.n += 1;
    custMap.set(id, cur);
  }
  let repeatRevenue = 0, firstRevenue = 0;
  for (const c of custMap.values()) { if (c.n > 1) repeatRevenue += c.v; else firstRevenue += c.v; }
  const totalCustRevenue = repeatRevenue + firstRevenue;

  const customers: CustomerInsights = {
    available: custMap.size > 0,
    top: [...custMap.values()].sort((a, b) => b.v - a.v).slice(0, 8),
    avg_spend: custMap.size ? totalCustRevenue / custMap.size : null,
    repeat_revenue: repeatRevenue,
    first_time_revenue: firstRevenue,
    repeat_share: totalCustRevenue ? (repeatRevenue / totalCustRevenue) * 100 : null,
  };

  /* ------------------------------------------------------------ risks */
  const risks: RiskCard[] = [];
  if (refundCenter.refund_rate != null && refundCenter.refund_rate > 8) {
    risks.push({
      id: "refund-rate",
      severity: refundCenter.refund_rate > 15 ? "bad" : "warn",
      title: "High refund rate",
      detail: `${refundCenter.refund_rate.toFixed(1)}% of collected revenue was refunded in this window.`,
    });
  }
  if (failures.available && attemptedN >= 20 && failures.failed_count / attemptedN > 0.15) {
    risks.push({
      id: "failure-rate",
      severity: "bad",
      title: "Failed payments increasing",
      detail: `${failures.failed_count} of ${attemptedN} attempts failed (${((failures.failed_count / attemptedN) * 100).toFixed(1)}%).`,
    });
  }
  if (refundCenter.avg_hours != null && refundCenter.avg_hours > 72) {
    risks.push({
      id: "refund-delay",
      severity: "warn",
      title: "Refund processing delayed",
      detail: `Refunds are taking ${refundCenter.avg_hours.toFixed(0)}h on average to complete.`,
    });
  }
  const largeRefunds = refunds.filter((r) => executive.aov > 0 && num(r.amount) > executive.aov * 5);
  if (largeRefunds.length) {
    risks.push({
      id: "large-refunds",
      severity: "warn",
      title: "Large refunds recorded",
      detail: `${largeRefunds.length} refund(s) exceed 5× the average order value.`,
    });
  }

  /* -------------------------------------------------- recommendations */
  const recommendations: Recommendation[] = [];
  if (failures.available && failures.most_common) {
    recommendations.push({
      id: "rec-failures",
      priority: risks.some((r) => r.id === "failure-rate") ? 1 : 3,
      title: "Investigate failed payments",
      detail: `Most common failure: “${failures.most_common}”. Review these attempts before customers retry elsewhere.`,
      action_label: "Open failed payments",
      action: "ledger_failed",
    });
  }
  if (refundCenter.avg_hours != null && refundCenter.avg_hours > 48) {
    recommendations.push({
      id: "rec-refunds",
      priority: 2,
      title: "Refund processing is slow",
      detail: `Average refund completion is ${refundCenter.avg_hours.toFixed(0)}h. Clearing the queue protects trust scores.`,
      action_label: "Open refund queue",
      action: "ledger_refunds",
    });
  }
  const intlShare = gross ? (regionAgg.international.revenue / gross) * 100 : 0;
  if (regionAgg.international.orders > 0 && intlShare > 25) {
    recommendations.push({
      id: "rec-intl",
      priority: 4,
      title: "International sales are growing",
      detail: `${intlShare.toFixed(0)}% of revenue is cross-border. Review currency and gateway coverage for those markets.`,
      action_label: "Open international analytics",
      action: "region_intl",
    });
  }
  const upiRevenue = paidOrders
    .filter((o) => (o.payment_method ?? "").toLowerCase().includes("upi"))
    .reduce((s, o) => s + num(o.total), 0);
  if (regionAgg.india.revenue > 0 && upiRevenue / regionAgg.india.revenue > 0.5) {
    recommendations.push({
      id: "rec-upi",
      priority: 5,
      title: "UPI dominates domestic checkout",
      detail: `${((upiRevenue / regionAgg.india.revenue) * 100).toFixed(0)}% of India revenue is paid via UPI — keep it first in the payment list.`,
      action_label: "Open India analytics",
      action: "region_india",
    });
  }
  recommendations.sort((a, b) => a.priority - b.priority);

  /* ------------------------------------------------------------ audit */
  const FIN = /(payment|refund|settle|payout|order|gateway|commission)/i;
  const adminLogs = ((adminRes.data ?? []) as unknown as {
    id: number; actor_id: string | null; action: string; entity_type: string | null; entity_id: string | null; created_at: string;
  }[])
    .filter((l) => FIN.test(l.action) || FIN.test(l.entity_type ?? ""))
    .map<AuditEntry>((l) => ({
      id: `a-${l.id}`,
      at: l.created_at,
      actor: l.actor_id ? l.actor_id.slice(0, 8) : null,
      action: l.action,
      entity: l.entity_type ? `${l.entity_type}${l.entity_id ? ` · ${l.entity_id.slice(0, 8)}` : ""}` : null,
      source: "admin",
    }));

  const secLogs = ((secRes.data ?? []) as unknown as {
    id: string; actor_id: string | null; action: string; success: boolean | null; created_at: string;
  }[])
    .filter((l) => FIN.test(l.action))
    .map<AuditEntry>((l) => ({
      id: `s-${l.id}`,
      at: l.created_at,
      actor: l.actor_id ? l.actor_id.slice(0, 8) : null,
      action: l.action + (l.success === false ? " (denied)" : ""),
      entity: null,
      source: "security",
    }));

  const audit = [...adminLogs, ...secLogs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);

  return {
    executive,
    breakdown,
    rankings,
    failures,
    refunds: refundCenter,
    settlements,
    commission,
    customers,
    risks,
    recommendations,
    audit,
    regions: regionAgg,
    daily,
    window_days: windowDays,
    generated_at: new Date().toISOString(),
    has_any_data: hasAny,
  };
}
