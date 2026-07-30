/**
 * Payments Center v7.0 — CFO Dashboard & Financial Control Center (server-only, READ ONLY).
 *
 * Extends v6.5. Nothing here writes, mutates or touches checkout, gateways,
 * refunds, orders, payouts, taxes or exports. Every metric is derived from real
 * rows; anything without a source is returned as `null` so the UI renders an
 * honest "No data available" state. Forecasts are explicitly labelled estimates.
 *
 * One database pass feeds every section (no duplicate reads).
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const num = (v: unknown) => Number(v ?? 0) || 0;
const pct = (a: number, b: number) => (b > 0 ? (a / b) * 100 : null);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Indicative reference rates → 1 unit of currency in INR (labelled in the UI). */
const RATES: Record<string, number> = {
  INR: 1, USD: 88, EUR: 95, GBP: 112, AED: 24, CAD: 64, AUD: 58,
  SGD: 65, JPY: 0.58, CHF: 100, NZD: 53, SAR: 23.5,
};
const toINR = (amount: number, currency: string | null | undefined) => {
  const c = (currency ?? "INR").toUpperCase();
  const r = RATES[c];
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

// ─────────────────────────────────────────────────────────────── public types

export type Rank = { key: string; label: string; value: number; count: number; extra?: string | null };

export type HealthFactor = {
  id: string;
  label: string;
  score: number | null;      // 0-100, null when the source does not exist
  weight: number;
  detail: string;            // human explanation, or "No data available"
};

export type HealthScore = {
  score: number | null;
  band: "excellent" | "good" | "attention" | "critical" | null;
  factors: HealthFactor[];
  covered: number;           // number of factors with real data
};

export type Profitability = {
  gross_revenue: number | null;
  shipping_revenue: number | null;
  tax_collected: number | null;
  discounts: number | null;
  coupons: number | null;
  gateway_fees: number | null;        // null when no fee data recorded
  platform_commission: number | null; // null when no commission rows
  vendor_share: number | null;
  estimated_net: number | null;
  net_is_estimate: boolean;
};

export type CashFlow = {
  received_today: number | null;
  money_pending: number | null;
  refunds_pending: number | null;
  settlements_pending: number | null;
  vendor_payments_pending: number | null;
  money_released: number | null;
  money_on_hold: number | null;
};

export type LiveRevenue = { today: number; week: number; month: number; ytd: number; orders_today: number };

export type Forecast = {
  available: boolean;
  basis_days: number;
  tomorrow: number | null;
  next7: number | null;
  next_month: number | null;
  confidence: "low" | "medium" | "high" | null;
  trend: "up" | "flat" | "down" | null;
  method: string;
};

export type CustomerIntel = {
  has_data: boolean;
  top_lifetime: Rank | null;
  top_today: Rank | null;
  top_month: Rank | null;
  repeat_customers: number;
  first_time_buyers: number;
  returning_pct: number | null;
  avg_customer_value: number | null;
  lifetime_value: number | null;
};

export type VendorRow = {
  vendor_id: string;
  name: string;
  revenue: number;
  orders: number;
  refunds: number;
  refund_rate: number | null;
  success_rate: number | null;
  growth: number | null;
  aov: number | null;
  platform_earnings: number | null;
  settlement_status: string;
};

export type GatewayRow = {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  success_rate: number | null;
  failure_rate: number | null;
  refund_rate: number | null;
  avg_processing_ms: number | null;
  aov: number | null;
  availability: string | null;
};

export type RefundIntel = {
  total_amount: number;
  count: number;
  reasons: Rank[];
  categories: Rank[];
  trend: { day: string; value: number; count: number }[];
  top_products: Rank[];
  top_vendors: Rank[];
  top_countries: Rank[];
  top_states: Rank[];
};

export type SettlementCenter = {
  available: boolean;
  buckets: { key: string; label: string; count: number; amount: number }[];
};

export type TaxDashboard = {
  india: { collected: number; pending: number; returned: number; by_state: Rank[]; by_month: Rank[] };
  international: { collected: number; pending: number; returned: number; by_country: Rank[]; by_month: Rank[] };
  has_data: boolean;
};

export type CurrencyIntel = {
  has_data: boolean;
  rows: { code: string; revenue_native: number; orders: number; aov_native: number; share: number | null; growth: number | null }[];
  largest: string | null;
  conversion_note: string;
};

export type TimelineEvent = {
  id: string;
  at: string;
  kind: "payment" | "refund" | "export" | "admin" | "finance" | "security";
  title: string;
  detail: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
};

export type FinanceAlert = {
  id: string;
  severity: "critical" | "warn" | "info";
  title: string;
  detail: string;
  action?: { label: string; target: string; status?: string } | null;
};

export type SmartRecommendation = {
  headline: string;
  reason: string;
  confidence: "low" | "medium" | "high";
  impact: string;
  action: { label: string; target: string; status?: string } | null;
} | null;

export type RegionPerf = {
  region: "india" | "international";
  revenue: number;
  profit: number | null;
  refunds: number;
  tax: number;
  shipping: number;
  growth: number | null;
  aov: number | null;
  orders: number;
  customers: number;
  repeat_buyers: number;
  new_buyers: number;
};

export type CFODashboard = {
  window_days: number;
  generated_at: string;
  reporting_currency: string;
  has_any_data: boolean;
  health: HealthScore;
  profitability: Profitability;
  cash_flow: CashFlow;
  live: LiveRevenue;
  forecast: Forecast;
  customers: CustomerIntel;
  vendors: VendorRow[];
  gateways: GatewayRow[];
  refunds: RefundIntel;
  settlements: SettlementCenter;
  tax: TaxDashboard;
  currencies: CurrencyIntel;
  timeline: TimelineEvent[];
  alerts: FinanceAlert[];
  recommendation: SmartRecommendation;
  regions: RegionPerf[];
  daily: { day: string; revenue: number; orders: number; refunds: number }[];
};

// ───────────────────────────────────────────────────────────────── internals

type OrderRow = {
  id: string;
  user_id: string | null;
  currency: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  shipping: number | null;
  discount: number | null;
  promo_code: string | null;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  payment_provider: string | null;
  market_region: string | null;
  shipping_address: Record<string, unknown> | null;
  created_at: string;
  paid_at: string | null;
  cancelled_at: string | null;
};

function addrField(addr: Record<string, unknown> | null, keys: string[]): string | null {
  if (!addr) return null;
  for (const k of keys) {
    const v = addr[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function countryOf(o: OrderRow): { code: string; name: string } | null {
  const raw = addrField(o.shipping_address, ["country_code", "country", "countryCode"]);
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (upper.length <= 3) {
    const code = upper.slice(0, 2);
    return { code, name: COUNTRY_NAMES[code] ?? upper };
  }
  const hit = Object.entries(COUNTRY_NAMES).find(([, n]) => n.toLowerCase() === raw.toLowerCase());
  return hit ? { code: hit[0], name: hit[1] } : { code: upper.slice(0, 2), name: raw };
}

function regionOf(o: OrderRow): "india" | "international" {
  const mr = (o.market_region ?? "").toLowerCase();
  if (mr === "india" || mr === "in") return "india";
  if (mr === "international" || mr === "intl") return "international";
  const c = countryOf(o);
  if (c) return c.code === "IN" ? "india" : "international";
  return (o.currency ?? "INR").toUpperCase() === "INR" ? "india" : "international";
}

const topRanks = (m: Map<string, { label: string; v: number; n: number }>, limit = 8): Rank[] =>
  [...m.entries()]
    .map(([key, x]) => ({ key, label: x.label, value: x.v, count: x.n }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

const addTo = (m: Map<string, { label: string; v: number; n: number }>, key: string, label: string, v: number) => {
  const row = m.get(key) ?? { label, v: 0, n: 0 };
  row.v += v; row.n += 1;
  m.set(key, row);
};

const REFUND_CATEGORIES: { key: string; label: string; match: RegExp }[] = [
  { key: "damaged", label: "Damaged / defective", match: /damag|defect|broken|faulty/i },
  { key: "not_as_described", label: "Not as described", match: /describ|wrong item|mismatch|different/i },
  { key: "late", label: "Late or lost delivery", match: /late|delay|lost|not deliver|undeliver/i },
  { key: "cancelled", label: "Order cancelled", match: /cancel/i },
  { key: "duplicate", label: "Duplicate / failed payment", match: /duplicate|double|failed payment|payment/i },
  { key: "customer", label: "Customer changed mind", match: /changed mind|no longer|unwanted|size|fit/i },
];
const categorise = (reason: string | null) => {
  if (!reason || !reason.trim()) return { key: "unspecified", label: "Unspecified" };
  const hit = REFUND_CATEGORIES.find((c) => c.match.test(reason));
  return hit ? { key: hit.key, label: hit.label } : { key: "other", label: "Other" };
};

// ────────────────────────────────────────────────────────────────── builder

/** Build the whole CFO dashboard in a single database pass. */
export async function buildCFODashboard(windowDays: number): Promise<CFODashboard> {
  const now = Date.now();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const sinceMs = Math.min(now - windowDays * 86400_000, yearStart);
  const since = new Date(sinceMs).toISOString();
  const todayKey = new Date().toISOString().slice(0, 10);
  const monthKey = todayKey.slice(0, 7);
  const yearKey = todayKey.slice(0, 4);
  const weekStartMs = now - 7 * 86400_000;
  const halfMs = sinceMs + (now - sinceMs) / 2;

  const [ordRes, payRes, refRes, payoutRes, commRes, gwRes, itemRes, logRes] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select(
        "id,user_id,currency,total,subtotal,tax,shipping,discount,promo_code,status,payment_status,payment_method,payment_provider,market_region,shipping_address,created_at,paid_at,cancelled_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000),
    supabaseAdmin
      .from("payments")
      .select("id,order_id,user_id,status,amount,currency,method,fee,gateway_tax,transaction_id,created_at,updated_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000),
    supabaseAdmin
      .from("refunds")
      .select("id,order_id,amount,currency,reason,status,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000),
    supabaseAdmin
      .from("vendor_payouts")
      .select("id,vendor_id,amount,currency,status,processed_at,period_start,period_end,created_at")
      .limit(2000),
    supabaseAdmin
      .from("vendor_commissions")
      .select("id,vendor_id,order_id,amount,rate,currency,status,created_at")
      .gte("created_at", since)
      .limit(20000),
    supabaseAdmin.from("payment_gateways").select("provider,display_name,enabled,mode,configured,last_checked_at").limit(50),
    supabaseAdmin
      .from("order_items")
      .select("order_id,product_slug,product_name,line_total,quantity")
      .gte("created_at", since)
      .limit(20000),
    supabaseAdmin
      .from("admin_activity_logs")
      .select("id,action,entity_type,entity_id,metadata,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  const orders = (ordRes.data ?? []) as unknown as OrderRow[];
  const payments = (payRes.data ?? []) as unknown as {
    id: string; order_id: string | null; user_id: string | null; status: string | null; amount: number | null;
    currency: string | null; method: string | null; fee: number | null; gateway_tax: number | null;
    transaction_id: string | null; created_at: string; updated_at: string | null;
  }[];
  const refunds = (refRes.data ?? []) as unknown as {
    id: string; order_id: string | null; amount: number | null; currency: string | null;
    reason: string | null; status: string | null; created_at: string;
  }[];
  const payouts = (payoutRes.data ?? []) as unknown as {
    id: string; vendor_id: string; amount: number | null; currency: string | null; status: string | null;
    processed_at: string | null; period_start: string | null; period_end: string | null; created_at: string;
  }[];
  const commissions = (commRes.data ?? []) as unknown as {
    id: string; vendor_id: string; order_id: string | null; amount: number | null; rate: number | null;
    currency: string | null; status: string | null; created_at: string;
  }[];
  const gatewayConfig = (gwRes.data ?? []) as unknown as {
    provider: string; display_name: string | null; enabled: boolean | null; mode: string | null;
    configured: boolean | null; last_checked_at: string | null;
  }[];
  const items = (itemRes.data ?? []) as unknown as {
    order_id: string; product_slug: string | null; product_name: string | null;
    line_total: number | null; quantity: number | null;
  }[];
  const adminLogs = (logRes.data ?? []) as unknown as {
    id: number | string; action: string; entity_type: string | null; entity_id: string | null;
    metadata: Record<string, unknown> | null; created_at: string;
  }[];

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const regionById = new Map<string, "india" | "international">();
  for (const o of orders) regionById.set(o.id, regionOf(o));

  // ── Order aggregation (paid orders only for revenue)
  let gross = 0, shipping = 0, tax = 0, discount = 0, coupon = 0, totalRev = 0;
  let ordersPaid = 0, cancelled = 0, pendingMoney = 0;
  let revToday = 0, ordersToday = 0, revWeek = 0, revMonth = 0, revYtd = 0;
  let firstHalf = 0, secondHalf = 0;
  const daily = new Map<string, { day: string; revenue: number; orders: number; refunds: number }>();
  const perCustomer = new Map<string, { v: number; n: number; today: number; month: number }>();
  const currencyAgg = new Map<string, { v: number; n: number; first: number; second: number }>();
  const gwAgg = new Map<string, { label: string; v: number; n: number }>();
  const taxIndia = { collected: 0, pending: 0, returned: 0 };
  const taxIntl = { collected: 0, pending: 0, returned: 0 };
  const taxByState = new Map<string, { label: string; v: number; n: number }>();
  const taxByCountry = new Map<string, { label: string; v: number; n: number }>();
  const taxIndiaMonth = new Map<string, { label: string; v: number; n: number }>();
  const taxIntlMonth = new Map<string, { label: string; v: number; n: number }>();
  const regionAgg: Record<"india" | "international", {
    revenue: number; refunds: number; tax: number; shipping: number; orders: number;
    customers: Map<string, number>; first: number; second: number;
  }> = {
    india: { revenue: 0, refunds: 0, tax: 0, shipping: 0, orders: 0, customers: new Map(), first: 0, second: 0 },
    international: { revenue: 0, refunds: 0, tax: 0, shipping: 0, orders: 0, customers: new Map(), first: 0, second: 0 },
  };

  for (const o of orders) {
    const cur = (o.currency ?? "INR").toUpperCase();
    const isPaid = payState(o.payment_status) === "ok" || !!o.paid_at;
    const isCancelled = (o.status ?? "").toLowerCase() === "cancelled" || !!o.cancelled_at;
    const total = toINR(num(o.total), cur);
    const region = regionById.get(o.id)!;
    const day = (o.paid_at ?? o.created_at).slice(0, 10);
    const ts = new Date(o.paid_at ?? o.created_at).getTime();

    if (isCancelled) cancelled += 1;
    if (!isPaid) {
      if (!isCancelled) pendingMoney += total;
      const t = toINR(num(o.tax), cur);
      if (region === "india") taxIndia.pending += t; else taxIntl.pending += t;
      continue;
    }

    ordersPaid += 1;
    totalRev += total;
    gross += toINR(num(o.subtotal), cur) || total;
    shipping += toINR(num(o.shipping), cur);
    const t = toINR(num(o.tax), cur);
    tax += t;
    discount += toINR(num(o.discount), cur);
    if (o.promo_code) coupon += toINR(num(o.discount), cur);

    if (day === todayKey) { revToday += total; ordersToday += 1; }
    if (ts >= weekStartMs) revWeek += total;
    if (day.slice(0, 7) === monthKey) revMonth += total;
    if (day.slice(0, 4) === yearKey) revYtd += total;
    if (ts < halfMs) firstHalf += total; else secondHalf += total;

    const d = daily.get(day) ?? { day, revenue: 0, orders: 0, refunds: 0 };
    d.revenue += total; d.orders += 1;
    daily.set(day, d);

    if (o.user_id) {
      const c = perCustomer.get(o.user_id) ?? { v: 0, n: 0, today: 0, month: 0 };
      c.v += total; c.n += 1;
      if (day === todayKey) c.today += total;
      if (day.slice(0, 7) === monthKey) c.month += total;
      perCustomer.set(o.user_id, c);
    }

    const cAgg = currencyAgg.get(cur) ?? { v: 0, n: 0, first: 0, second: 0 };
    cAgg.v += num(o.total); cAgg.n += 1;
    if (ts < halfMs) cAgg.first += num(o.total); else cAgg.second += num(o.total);
    currencyAgg.set(cur, cAgg);

    const gwKey = (o.payment_provider ?? o.payment_method ?? "unknown").toLowerCase();
    addTo(gwAgg, gwKey, gwKey, total);

    const r = regionAgg[region];
    r.revenue += total; r.tax += t; r.shipping += toINR(num(o.shipping), cur); r.orders += 1;
    if (ts < halfMs) r.first += total; else r.second += total;
    if (o.user_id) r.customers.set(o.user_id, (r.customers.get(o.user_id) ?? 0) + 1);

    const month = day.slice(0, 7);
    if (region === "india") {
      taxIndia.collected += t;
      const st = addrField(o.shipping_address, ["state", "region", "province"]);
      if (st && t > 0) addTo(taxByState, st, st, t);
      if (t > 0) addTo(taxIndiaMonth, month, month, t);
    } else {
      taxIntl.collected += t;
      const c = countryOf(o);
      if (c && t > 0) addTo(taxByCountry, c.code, c.name, t);
      if (t > 0) addTo(taxIntlMonth, month, month, t);
    }
  }

  // ── Payments (attempts, gateway fees, processing time)
  let attempts = 0, okPay = 0, failedPay = 0, pendingPay = 0;
  let feeTotal = 0, feeRows = 0;
  const gwPay = new Map<string, { ok: number; failed: number; pending: number; ms: number; msN: number }>();
  for (const p of payments) {
    const st = payState(p.status);
    const key = (p.method ?? "unknown").toLowerCase();
    const g = gwPay.get(key) ?? { ok: 0, failed: 0, pending: 0, ms: 0, msN: 0 };
    if (st !== "other") {
      attempts += 1;
      if (st === "ok") { okPay += 1; g.ok += 1; }
      else if (st === "failed") { failedPay += 1; g.failed += 1; }
      else { pendingPay += 1; g.pending += 1; }
    }
    if (st === "ok" && p.updated_at) {
      const delta = new Date(p.updated_at).getTime() - new Date(p.created_at).getTime();
      if (delta > 0 && delta < 3600_000) { g.ms += delta; g.msN += 1; }
    }
    gwPay.set(key, g);
    const fee = num(p.fee) + num(p.gateway_tax);
    if (fee > 0) { feeTotal += toINR(fee, p.currency); feeRows += 1; }
  }

  // ── Refund intelligence
  let refundTotal = 0, refundPending = 0;
  const refReasons = new Map<string, { label: string; v: number; n: number }>();
  const refCats = new Map<string, { label: string; v: number; n: number }>();
  const refCountries = new Map<string, { label: string; v: number; n: number }>();
  const refStates = new Map<string, { label: string; v: number; n: number }>();
  const refTrend = new Map<string, { day: string; value: number; count: number }>();
  const refundedOrderIds = new Map<string, number>();
  const gwRefund = new Map<string, number>();

  for (const r of refunds) {
    const o = r.order_id ? orderById.get(r.order_id) : undefined;
    const amt = toINR(num(r.amount), r.currency ?? o?.currency);
    const st = (r.status ?? "").toLowerCase();
    if (st === "pending" || st === "processing" || st === "initiated") refundPending += amt;
    refundTotal += amt;
    const day = r.created_at.slice(0, 10);
    const t = refTrend.get(day) ?? { day, value: 0, count: 0 };
    t.value += amt; t.count += 1;
    refTrend.set(day, t);
    const dd = daily.get(day);
    if (dd) dd.refunds += amt;
    const reason = (r.reason ?? "").trim();
    addTo(refReasons, reason ? reason.toLowerCase() : "unspecified", reason || "Unspecified", amt);
    const cat = categorise(r.reason);
    addTo(refCats, cat.key, cat.label, amt);
    if (o) {
      refundedOrderIds.set(o.id, (refundedOrderIds.get(o.id) ?? 0) + amt);
      const region = regionById.get(o.id)!;
      regionAgg[region].refunds += amt;
      const c = countryOf(o);
      if (c) addTo(refCountries, c.code, c.name, amt);
      const stName = addrField(o.shipping_address, ["state", "region", "province"]);
      if (stName) addTo(refStates, stName, stName, amt);
      const gwKey = (o.payment_provider ?? o.payment_method ?? "unknown").toLowerCase();
      gwRefund.set(gwKey, (gwRefund.get(gwKey) ?? 0) + amt);
    }
  }

  // ── Catalog / vendor attribution
  const itemsByOrder = new Map<string, typeof items>();
  for (const it of items) {
    const list = itemsByOrder.get(it.order_id);
    if (list) list.push(it); else itemsByOrder.set(it.order_id, [it]);
  }
  const slugs = [...new Set(items.map((i) => i.product_slug).filter(Boolean) as string[])].slice(0, 2000);
  const [vpRes] = await Promise.all([
    slugs.length
      ? supabaseAdmin.from("vendor_products").select("product_slug,vendor_id").in("product_slug", slugs).limit(5000)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);
  const vendorBySlug = new Map(
    ((vpRes.data ?? []) as unknown as { product_slug: string; vendor_id: string }[]).map((v) => [v.product_slug, v.vendor_id]),
  );
  const vendorIds = [...new Set([...vendorBySlug.values(), ...commissions.map((c) => c.vendor_id), ...payouts.map((p) => p.vendor_id)])].slice(0, 500);
  const vendorNames = new Map<string, string>();
  if (vendorIds.length) {
    const { data: vRows } = await supabaseAdmin.from("vendors").select("id,business_name").in("id", vendorIds).limit(500);
    for (const v of (vRows ?? []) as unknown as { id: string; business_name: string | null }[]) {
      vendorNames.set(v.id, v.business_name ?? "Vendor");
    }
  }

  const refProducts = new Map<string, { label: string; v: number; n: number }>();
  const refVendors = new Map<string, { label: string; v: number; n: number }>();
  for (const [orderId, amt] of refundedOrderIds) {
    const list = itemsByOrder.get(orderId) ?? [];
    const lineSum = list.reduce((s, i) => s + num(i.line_total), 0);
    for (const it of list) {
      const share = lineSum > 0 ? (num(it.line_total) / lineSum) * amt : amt / Math.max(list.length, 1);
      const label = it.product_name ?? it.product_slug ?? "Product";
      addTo(refProducts, it.product_slug ?? label, label, share);
      const vid = it.product_slug ? vendorBySlug.get(it.product_slug) : undefined;
      if (vid) addTo(refVendors, vid, vendorNames.get(vid) ?? "Vendor", share);
    }
  }

  // ── Vendor performance
  const vendorAgg = new Map<string, {
    revenue: number; orders: Set<string>; refunds: number; first: number; second: number; commission: number;
  }>();
  const vendorOf = (slug: string | null) => (slug ? vendorBySlug.get(slug) : undefined);
  for (const [orderId, list] of itemsByOrder) {
    const o = orderById.get(orderId);
    if (!o) continue;
    const isPaid = payState(o.payment_status) === "ok" || !!o.paid_at;
    if (!isPaid) continue;
    const ts = new Date(o.paid_at ?? o.created_at).getTime();
    for (const it of list) {
      const vid = vendorOf(it.product_slug);
      if (!vid) continue;
      const value = toINR(num(it.line_total), o.currency);
      const row = vendorAgg.get(vid) ?? { revenue: 0, orders: new Set<string>(), refunds: 0, first: 0, second: 0, commission: 0 };
      row.revenue += value;
      row.orders.add(orderId);
      if (ts < halfMs) row.first += value; else row.second += value;
      vendorAgg.set(vid, row);
    }
  }
  for (const [vid, amt] of refVendors) {
    const row = vendorAgg.get(vid) ?? { revenue: 0, orders: new Set<string>(), refunds: 0, first: 0, second: 0, commission: 0 };
    row.refunds += amt;
    vendorAgg.set(vid, row);
  }
  let commissionTotal = 0;
  for (const c of commissions) {
    const amt = toINR(num(c.amount), c.currency);
    commissionTotal += amt;
    const row = vendorAgg.get(c.vendor_id) ?? { revenue: 0, orders: new Set<string>(), refunds: 0, first: 0, second: 0, commission: 0 };
    row.commission += amt;
    vendorAgg.set(c.vendor_id, row);
  }
  const payoutByVendor = new Map<string, { pending: number; paid: number; last: string | null }>();
  let payoutPending = 0, payoutReleased = 0;
  for (const p of payouts) {
    const amt = toINR(num(p.amount), p.currency);
    const st = (p.status ?? "").toLowerCase();
    const row = payoutByVendor.get(p.vendor_id) ?? { pending: 0, paid: 0, last: null };
    if (st === "paid" || st === "completed" || st === "processed") { row.paid += amt; payoutReleased += amt; }
    else { row.pending += amt; payoutPending += amt; }
    row.last = p.processed_at ?? p.created_at;
    payoutByVendor.set(p.vendor_id, row);
  }

  const vendorRows: VendorRow[] = [...vendorAgg.entries()]
    .map(([vid, v]) => {
      const po = payoutByVendor.get(vid);
      const orderCount = v.orders.size;
      return {
        vendor_id: vid,
        name: vendorNames.get(vid) ?? "Vendor",
        revenue: round2(v.revenue),
        orders: orderCount,
        refunds: round2(v.refunds),
        refund_rate: v.revenue > 0 ? round2((v.refunds / v.revenue) * 100) : null,
        success_rate: null as number | null,
        growth: v.first > 0 ? round2(((v.second - v.first) / v.first) * 100) : null,
        aov: orderCount > 0 ? round2(v.revenue / orderCount) : null,
        platform_earnings: v.commission > 0 ? round2(v.commission) : null,
        settlement_status: po
          ? po.pending > 0 ? "Payout pending" : "Settled"
          : "No payout record",
      };
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 50);

  // ── Gateway intelligence
  const gatewayKeys = new Set<string>([
    ...gwAgg.keys(), ...gwPay.keys(),
    ...gatewayConfig.filter((g) => g.enabled).map((g) => g.provider.toLowerCase()),
  ]);
  const gatewayRows: GatewayRow[] = [...gatewayKeys].map((key) => {
    const money = gwAgg.get(key);
    const pay = gwPay.get(key);
    const cfg = gatewayConfig.find((g) => g.provider.toLowerCase() === key);
    const attemptsG = pay ? pay.ok + pay.failed + pay.pending : 0;
    const revenue = money?.v ?? 0;
    const ordersG = money?.n ?? 0;
    return {
      key,
      label: cfg?.display_name ?? key.replace(/_/g, " "),
      revenue: round2(revenue),
      orders: ordersG,
      success_rate: attemptsG ? round2((pay!.ok / attemptsG) * 100) : null,
      failure_rate: attemptsG ? round2((pay!.failed / attemptsG) * 100) : null,
      refund_rate: revenue > 0 ? round2(((gwRefund.get(key) ?? 0) / revenue) * 100) : null,
      avg_processing_ms: pay && pay.msN > 0 ? Math.round(pay.ms / pay.msN) : null,
      aov: ordersG ? round2(revenue / ordersG) : null,
      availability: cfg ? (cfg.enabled ? (cfg.configured ? `Enabled · ${cfg.mode ?? "live"}` : "Enabled · not configured") : "Disabled") : null,
    };
  }).sort((a, b) => b.revenue - a.revenue);

  // ── Health score (only factors with a real source contribute)
  const successRate = pct(okPay, attempts);
  const refundRate = pct(refundTotal, totalRev);
  const growth = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : null;
  const failureRate = pct(failedPay, attempts);
  const pendingSettleRatio = pct(pendingMoney, totalRev + pendingMoney);
  const enabledGateways = gatewayConfig.filter((g) => g.enabled);
  const gatewayHealth = enabledGateways.length
    ? (enabledGateways.filter((g) => g.configured).length / enabledGateways.length) * 100
    : null;
  const payoutHealth = payouts.length ? (payoutPending > 0 ? Math.max(0, 100 - pct(payoutPending, payoutPending + payoutReleased)!) : 100) : null;
  const custFailure = attempts ? pct(failedPay, attempts) : null;

  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const factors: HealthFactor[] = [
    { id: "success", label: "Payment success rate", weight: 20, score: successRate == null ? null : clamp(successRate),
      detail: successRate == null ? "No data available" : `${successRate.toFixed(1)}% of ${attempts} payment attempt(s) succeeded` },
    { id: "refund", label: "Refund rate", weight: 15, score: refundRate == null ? null : clamp(100 - refundRate * 4),
      detail: refundRate == null ? "No data available" : `${refundRate.toFixed(1)}% of captured revenue refunded` },
    { id: "growth", label: "Revenue growth", weight: 15, score: growth == null ? null : clamp(50 + growth),
      detail: growth == null ? "No data available" : `${growth >= 0 ? "+" : ""}${growth.toFixed(1)}% vs first half of window` },
    { id: "failed", label: "Failed payments", weight: 10, score: failureRate == null ? null : clamp(100 - failureRate * 3),
      detail: failureRate == null ? "No data available" : `${failedPay} failed of ${attempts} attempt(s)` },
    { id: "settle", label: "Pending settlements", weight: 10, score: pendingSettleRatio == null ? null : clamp(100 - pendingSettleRatio * 2),
      detail: pendingSettleRatio == null ? "No data available" : `${pendingSettleRatio.toFixed(1)}% of value still awaiting capture` },
    { id: "gateway", label: "Gateway health", weight: 15, score: gatewayHealth == null ? null : clamp(gatewayHealth),
      detail: gatewayHealth == null ? "No data available" : `${enabledGateways.filter((g) => g.configured).length}/${enabledGateways.length} enabled gateway(s) fully configured` },
    { id: "payout", label: "Vendor payout status", weight: 10, score: payoutHealth == null ? null : clamp(payoutHealth),
      detail: payoutHealth == null ? "No data available" : `${payouts.filter((p) => (p.status ?? "").toLowerCase() !== "paid").length} payout(s) outstanding` },
    { id: "cust", label: "Customer payment failures", weight: 5, score: custFailure == null ? null : clamp(100 - custFailure * 3),
      detail: custFailure == null ? "No data available" : `${custFailure.toFixed(1)}% of customer attempts failed` },
  ];
  const scored = factors.filter((f) => f.score != null);
  const weightSum = scored.reduce((s, f) => s + f.weight, 0);
  const healthScore = weightSum > 0 ? Math.round(scored.reduce((s, f) => s + f.score! * f.weight, 0) / weightSum) : null;
  const band = healthScore == null ? null
    : healthScore >= 85 ? "excellent" as const
    : healthScore >= 70 ? "good" as const
    : healthScore >= 50 ? "attention" as const
    : "critical" as const;

  // ── Profitability
  const vendorShare = vendorRows.length ? vendorRows.reduce((s, v) => s + v.revenue, 0) : null;
  const commissionValue = commissionTotal > 0 ? commissionTotal : null;
  const feeValue = feeRows > 0 ? feeTotal : null;
  const netAvailable = totalRev > 0;
  const estimatedNet = netAvailable
    ? totalRev - refundTotal - (feeValue ?? 0) - (vendorShare != null && commissionValue != null ? Math.max(vendorShare - commissionValue, 0) : 0) - tax
    : null;

  // ── Forecast (simple trailing-average trend, clearly labelled as an estimate)
  const dailySorted = [...daily.values()].sort((a, b) => a.day.localeCompare(b.day));
  const last14 = dailySorted.slice(-14);
  const basisDays = last14.length;
  const avgDay = basisDays ? last14.reduce((s, d) => s + d.revenue, 0) / basisDays : 0;
  const firstWin = last14.slice(0, Math.floor(basisDays / 2));
  const lastWin = last14.slice(Math.floor(basisDays / 2));
  const avgFirst = firstWin.length ? firstWin.reduce((s, d) => s + d.revenue, 0) / firstWin.length : 0;
  const avgLast = lastWin.length ? lastWin.reduce((s, d) => s + d.revenue, 0) / lastWin.length : 0;
  const slope = avgFirst > 0 ? (avgLast - avgFirst) / avgFirst : 0;
  const forecast: Forecast = basisDays >= 3 && avgDay > 0
    ? {
        available: true,
        basis_days: basisDays,
        tomorrow: round2(avgDay * (1 + slope * 0.1)),
        next7: round2(avgDay * 7 * (1 + slope * 0.25)),
        next_month: round2(avgDay * 30 * (1 + slope * 0.4)),
        confidence: basisDays >= 14 ? "high" : basisDays >= 7 ? "medium" : "low",
        trend: slope > 0.05 ? "up" : slope < -0.05 ? "down" : "flat",
        method: `Trailing ${basisDays}-day average with trend adjustment — estimate only, not a commitment.`,
      }
    : {
        available: false, basis_days: basisDays, tomorrow: null, next7: null, next_month: null,
        confidence: null, trend: null,
        method: "Not enough historical paid-order days to produce an estimate.",
      };

  // ── Customer intelligence
  const custEntries = [...perCustomer.entries()];
  const repeat = custEntries.filter(([, c]) => c.n > 1).length;
  const firstTime = custEntries.filter(([, c]) => c.n === 1).length;
  const rankCust = (pick: (c: { v: number; n: number; today: number; month: number }) => number): Rank | null => {
    const best = custEntries.map(([id, c]) => ({ id, v: pick(c), n: c.n })).sort((a, b) => b.v - a.v)[0];
    if (!best || best.v <= 0) return null;
    return { key: best.id, label: `Customer ${best.id.slice(0, 8)}••••`, value: round2(best.v), count: best.n };
  };
  const customers: CustomerIntel = {
    has_data: custEntries.length > 0,
    top_lifetime: rankCust((c) => c.v),
    top_today: rankCust((c) => c.today),
    top_month: rankCust((c) => c.month),
    repeat_customers: repeat,
    first_time_buyers: firstTime,
    returning_pct: custEntries.length ? round2((repeat / custEntries.length) * 100) : null,
    avg_customer_value: custEntries.length ? round2(totalRev / custEntries.length) : null,
    lifetime_value: custEntries.length ? round2(custEntries.reduce((s, [, c]) => s + c.v, 0) / custEntries.length) : null,
  };

  // ── Settlement center (payout feed is the only settlement source that exists)
  const settlementBuckets = [
    { key: "upcoming", label: "Upcoming", match: ["scheduled", "upcoming", "queued"] },
    { key: "processing", label: "Processing", match: ["processing", "pending", "initiated"] },
    { key: "completed", label: "Completed", match: ["paid", "completed", "processed", "settled"] },
    { key: "delayed", label: "Delayed", match: ["delayed", "on_hold", "hold"] },
    { key: "rejected", label: "Rejected", match: ["rejected", "failed", "cancelled"] },
  ].map((b) => {
    const rows = payouts.filter((p) => b.match.includes((p.status ?? "").toLowerCase()));
    return { key: b.key, label: b.label, count: rows.length, amount: round2(rows.reduce((s, p) => s + toINR(num(p.amount), p.currency), 0)) };
  });

  // ── Currency intelligence
  const currencyTotalINR = [...currencyAgg.entries()].reduce((s, [code, c]) => s + toINR(c.v, code), 0);
  const currencyRows = [...currencyAgg.entries()]
    .map(([code, c]) => ({
      code,
      revenue_native: round2(c.v),
      orders: c.n,
      aov_native: c.n ? round2(c.v / c.n) : 0,
      share: currencyTotalINR > 0 ? round2((toINR(c.v, code) / currencyTotalINR) * 100) : null,
      growth: c.first > 0 ? round2(((c.second - c.first) / c.first) * 100) : null,
    }))
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0));

  // ── Financial timeline (payments, refunds, exports, admin/finance/security actions)
  const timeline: TimelineEvent[] = [
    ...payments.slice(0, 150).map((p) => ({
      id: `pay-${p.id}`,
      at: p.created_at,
      kind: "payment" as const,
      title: `Payment ${(p.status ?? "unknown").toLowerCase()}`,
      detail: `${(p.method ?? "unknown").toUpperCase()} · order ${p.order_id ? p.order_id.slice(0, 8) : "—"}`,
      amount: num(p.amount),
      currency: p.currency ?? "INR",
      status: p.status,
    })),
    ...refunds.slice(0, 100).map((r) => ({
      id: `ref-${r.id}`,
      at: r.created_at,
      kind: "refund" as const,
      title: `Refund ${(r.status ?? "recorded").toLowerCase()}`,
      detail: r.reason?.trim() || "No reason recorded",
      amount: num(r.amount),
      currency: r.currency ?? "INR",
      status: r.status,
    })),
    ...adminLogs.map((l) => {
      const action = l.action ?? "action";
      const kind: TimelineEvent["kind"] = /export/i.test(action)
        ? "export"
        : /payment|refund|payout|settle|finance|tax/i.test(action)
          ? "finance"
          : /security|role|login|access/i.test(action)
            ? "security"
            : "admin";
      return {
        id: `log-${l.id}`,
        at: l.created_at,
        kind,
        title: action.replace(/[._]/g, " "),
        detail: [l.entity_type, l.entity_id ? `${String(l.entity_id).slice(0, 8)}••••` : null].filter(Boolean).join(" · ") || "Admin activity",
        amount: null,
        currency: null,
        status: null,
      };
    }),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 400);

  // ── Alerts (evidence-backed only)
  const alerts: FinanceAlert[] = [];
  if (refundRate != null && refundRate >= 10) {
    alerts.push({
      id: "high-refund", severity: refundRate >= 20 ? "critical" : "warn",
      title: "High refund rate",
      detail: `${refundRate.toFixed(1)}% of captured revenue was refunded in this window.`,
      action: { label: "Open refunds", target: "ledger", status: "refunded" },
    });
  }
  if (failureRate != null && failureRate >= 15) {
    alerts.push({
      id: "failures", severity: failureRate >= 30 ? "critical" : "warn",
      title: "Payment failures elevated",
      detail: `${failedPay} of ${attempts} attempts failed (${failureRate.toFixed(1)}%).`,
      action: { label: "Open failed payments", target: "ledger", status: "failed" },
    });
  }
  for (const g of gatewayConfig) {
    if (g.enabled && !g.configured) {
      alerts.push({
        id: `gw-${g.provider}`, severity: "critical",
        title: `${g.display_name ?? g.provider} not fully configured`,
        detail: "Gateway is enabled but keys or webhooks are missing.",
        action: null,
      });
    }
  }
  if (payoutPending > 0) {
    alerts.push({
      id: "payout-delay", severity: "warn",
      title: "Vendor settlements pending",
      detail: `${payoutByVendor.size} vendor(s) with outstanding payouts.`,
      action: null,
    });
  }
  if (growth != null && growth <= -20) {
    alerts.push({
      id: "revenue-drop", severity: "warn",
      title: "Revenue declining",
      detail: `Revenue fell ${Math.abs(growth).toFixed(1)}% against the first half of this window.`,
      action: null,
    });
  }
  const bigRefund = refunds.map((r) => toINR(num(r.amount), r.currency)).sort((a, b) => b - a)[0] ?? 0;
  const avgOrder = ordersPaid ? totalRev / ordersPaid : 0;
  if (bigRefund > 0 && avgOrder > 0 && bigRefund > avgOrder * 5) {
    alerts.push({
      id: "large-refund", severity: "warn",
      title: "Large refund recorded",
      detail: `A single refund exceeded 5x the average order value.`,
      action: { label: "Open refunds", target: "ledger", status: "refunded" },
    });
  }
  if (tax > 0 && taxIndia.collected > 0 && taxIntl.collected > 0 && taxByCountry.size === 0) {
    alerts.push({
      id: "tax-attr", severity: "info",
      title: "International tax missing country attribution",
      detail: "Some international orders have tax but no country on the shipping address.",
      action: null,
    });
  }

  // ── One smart recommendation (highest-impact, evidence-backed)
  let recommendation: SmartRecommendation = null;
  const worstVendor = vendorRows.filter((v) => (v.refund_rate ?? 0) >= 15 && v.revenue > 0)[0];
  if (worstVendor) {
    recommendation = {
      headline: `Refund rate at ${worstVendor.name} is ${worstVendor.refund_rate!.toFixed(1)}%.`,
      reason: `${worstVendor.name} generated ${Math.round(worstVendor.revenue)} in revenue with ${Math.round(worstVendor.refunds)} refunded across ${worstVendor.orders} order(s).`,
      confidence: worstVendor.orders >= 10 ? "high" : worstVendor.orders >= 4 ? "medium" : "low",
      impact: `Reducing this to the marketplace average could recover roughly ${Math.round(worstVendor.refunds * 0.5)} per window.`,
      action: { label: "Open refunds", target: "ledger", status: "refunded" },
    };
  } else if (failureRate != null && failureRate >= 10) {
    const worstGw = gatewayRows.filter((g) => (g.failure_rate ?? 0) > 0).sort((a, b) => (b.failure_rate ?? 0) - (a.failure_rate ?? 0))[0];
    recommendation = {
      headline: `Payment failures are at ${failureRate.toFixed(1)}%.`,
      reason: worstGw
        ? `${worstGw.label} is failing ${worstGw.failure_rate!.toFixed(1)}% of attempts.`
        : `${failedPay} of ${attempts} attempts failed in this window.`,
      confidence: attempts >= 50 ? "high" : attempts >= 15 ? "medium" : "low",
      impact: "Each recovered attempt converts directly into captured revenue.",
      action: { label: "Open failed payments", target: "ledger", status: "failed" },
    };
  } else if (forecast.available && forecast.trend === "down") {
    recommendation = {
      headline: "Revenue trend is softening.",
      reason: `The trailing ${forecast.basis_days}-day average is below the earlier period.`,
      confidence: forecast.confidence ?? "low",
      impact: "Forecast — estimated, based on historical paid orders only.",
      action: null,
    };
  }

  // ── Regional performance
  const regions: RegionPerf[] = (["india", "international"] as const).map((region) => {
    const r = regionAgg[region];
    const cust = [...r.customers.values()];
    const commissionRegion = null; // no per-region commission source
    return {
      region,
      revenue: round2(r.revenue),
      profit: commissionRegion,
      refunds: round2(r.refunds),
      tax: round2(r.tax),
      shipping: round2(r.shipping),
      growth: r.first > 0 ? round2(((r.second - r.first) / r.first) * 100) : null,
      aov: r.orders ? round2(r.revenue / r.orders) : null,
      orders: r.orders,
      customers: r.customers.size,
      repeat_buyers: cust.filter((n) => n > 1).length,
      new_buyers: cust.filter((n) => n === 1).length,
    };
  });

  return {
    window_days: windowDays,
    generated_at: new Date().toISOString(),
    reporting_currency: "INR",
    has_any_data: orders.length > 0 || payments.length > 0,
    health: { score: healthScore, band, factors, covered: scored.length },
    profitability: {
      gross_revenue: totalRev > 0 ? round2(gross) : null,
      shipping_revenue: totalRev > 0 ? round2(shipping) : null,
      tax_collected: totalRev > 0 ? round2(tax) : null,
      discounts: totalRev > 0 ? round2(discount) : null,
      coupons: totalRev > 0 ? round2(coupon) : null,
      gateway_fees: feeValue == null ? null : round2(feeValue),
      platform_commission: commissionValue == null ? null : round2(commissionValue),
      vendor_share: vendorShare == null ? null : round2(vendorShare),
      estimated_net: estimatedNet == null ? null : round2(estimatedNet),
      net_is_estimate: feeValue == null || commissionValue == null,
    },
    cash_flow: {
      received_today: totalRev > 0 || ordersToday > 0 ? round2(revToday) : null,
      money_pending: pendingMoney > 0 ? round2(pendingMoney) : orders.length ? 0 : null,
      refunds_pending: refunds.length ? round2(refundPending) : null,
      settlements_pending: payouts.length ? round2(payoutPending) : null,
      vendor_payments_pending: payouts.length ? round2(payoutPending) : null,
      money_released: payouts.length ? round2(payoutReleased) : null,
      money_on_hold: orders.length ? round2(pendingMoney + refundPending) : null,
    },
    live: { today: round2(revToday), week: round2(revWeek), month: round2(revMonth), ytd: round2(revYtd), orders_today: ordersToday },
    forecast,
    customers,
    vendors: vendorRows,
    gateways: gatewayRows,
    refunds: {
      total_amount: round2(refundTotal),
      count: refunds.length,
      reasons: topRanks(refReasons),
      categories: topRanks(refCats),
      trend: [...refTrend.values()].sort((a, b) => a.day.localeCompare(b.day)),
      top_products: topRanks(refProducts),
      top_vendors: topRanks(refVendors),
      top_countries: topRanks(refCountries),
      top_states: topRanks(refStates),
    },
    settlements: { available: payouts.length > 0, buckets: settlementBuckets },
    tax: {
      india: {
        collected: round2(taxIndia.collected), pending: round2(taxIndia.pending), returned: 0,
        by_state: topRanks(taxByState), by_month: topRanks(taxIndiaMonth, 12),
      },
      international: {
        collected: round2(taxIntl.collected), pending: round2(taxIntl.pending), returned: 0,
        by_country: topRanks(taxByCountry), by_month: topRanks(taxIntlMonth, 12),
      },
      has_data: tax > 0 || taxIndia.pending > 0 || taxIntl.pending > 0,
    },
    currencies: {
      has_data: currencyRows.length > 0,
      rows: currencyRows,
      largest: currencyRows[0]?.code ?? null,
      conversion_note:
        "Native currency totals are never summed. Share is computed using indicative reference rates for comparison only.",
    },
    timeline,
    alerts,
    recommendation,
    regions,
    daily: dailySorted.map((d) => ({ day: d.day, revenue: round2(d.revenue), orders: d.orders, refunds: round2(d.refunds) })),
  };
}
