/**
 * Payments Center v3 — server-only aggregation helpers.
 *
 * READ ONLY. This module never mutates payments, orders, refunds or gateway
 * configuration. It only reads existing rows and shapes them for the admin
 * analytics UI. Any metric with no underlying data returns `null` so the UI
 * can render an honest "No data available" state instead of a fake number.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Region = "india" | "international";

export type Bucket = { k: string; v: number; n: number };
export type DayPoint = { date: string; revenue: number; orders: number; refunds: number };

export type PaymentsKpis = {
  today_revenue: number;
  today_orders: number;
  total_collected: number;
  pending_amount: number;
  pending_count: number;
  failed_amount: number;
  failed_count: number;
  refunded_amount: number;
  refunded_count: number;
  processing_amount: number;
  processing_count: number;
  aov: number;
  success_rate: number | null;
  /** No chargeback source exists in the platform yet → null, never a fake 0. */
  chargebacks: number | null;
  deltas: {
    today_revenue: number | null;
    today_orders: number | null;
    total_collected: number | null;
    aov: number | null;
    success_rate: number | null;
    refunded_amount: number | null;
  };
};

export type HourPoint = { h: number; v: number; n: number };

export type RegionBlock = {
  region: Region;
  revenue: number;
  orders: number;
  aov: number;
  refund_value: number;
  refund_count: number;
  methods: Bucket[];
  currencies: Bucket[];
  daily: DayPoint[];
  hourly: HourPoint[];
  geo: Bucket[];
  cities: Bucket[];
  customers: { id: string; label: string; v: number; n: number }[];
  gateways: Bucket[];
  gst_estimate: number | null;
  cod_value: number;
  prepaid_value: number;
};

export type GatewayBlock = {
  provider: string;
  display_name: string;
  enabled: boolean | null;
  mode: string | null;
  configured: boolean | null;
  transactions: number;
  succeeded: number;
  failed: number;
  revenue: number;
  success_rate: number | null;
  failure_rate: number | null;
  /** No latency telemetry source exists yet → null, never a fake number. */
  latency_ms: number | null;
  last_sync: string | null;
};

export type RefundBlock = {
  queue: { id: string; order_id: string | null; amount: number; currency: string; status: string; reason: string | null; created_at: string }[];
  history: { id: string; order_id: string | null; amount: number; currency: string; status: string; reason: string | null; created_at: string }[];
  reasons: Bucket[];
  success_rate: number | null;
  avg_hours: number | null;
  total_value: number;
};

export type ActivityItem = {
  id: string;
  kind: "payment" | "refund" | "failed";
  label: string;
  amount: number;
  currency: string;
  at: string;
};

export type HealthFactor = {
  key: string;
  label: string;
  /** 0–100 sub-score, or null when the platform has no source for this metric. */
  score: number | null;
  weight: number;
  detail: string;
};

export type HealthBlock = {
  score: number | null;
  grade: "Excellent" | "Good" | "Fair" | "At risk" | null;
  factors: HealthFactor[];
  excluded: string[];
};

export type Insight = {
  id: string;
  tone: "good" | "warn" | "bad" | "info";
  title: string;
  detail: string;
};

export type QuickCounts = {
  today: number;
  pending: number;
  refund_queue: number;
  failed: number;
  settlements: number | null;
};

export type VendorPayoutRow = {
  vendor_id: string;
  vendor: string;
  pending: number;
  completed: number;
  next_settlement: string | null;
  total_sales: number | null;
  commission: number | null;
  net_earnings: number | null;
  currency: string;
};

export type VendorPayoutBlock = { enabled: boolean; rows: VendorPayoutRow[] };

export type PaymentsOverview = {
  kpis: PaymentsKpis;
  health: HealthBlock;
  insights: Insight[];
  quick: QuickCounts;
  regions: Record<Region, RegionBlock>;
  daily: DayPoint[];
  gateways: GatewayBlock[];
  refunds: RefundBlock;
  vendor_payouts: VendorPayoutBlock;
  /** Platform has no settlements source yet. */
  settlements: null;
  activity: ActivityItem[];
  window_days: number;
  generated_at: string;
  has_any_data: boolean;
};


type OrderLite = {
  id: string;
  currency: string | null;
  total: number | null;
  status: string | null;
  payment_status: string | null;
  payment_method: string | null;
  payment_provider: string | null;
  market_region: string | null;
  shipping_address: Record<string, unknown> | null;
  created_at: string;
  user_id: string | null;
  contact_email: string | null;
  tax: number | null;
};

type PaymentLite = {
  id: string;
  order_id: string | null;
  user_id: string | null;
  method: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  transaction_id: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  fee: number | null;
  gateway_tax: number | null;
  demo: boolean | null;
  created_at: string;
};

const num = (v: unknown) => Number(v ?? 0) || 0;
const dayKey = (iso: string) => iso.slice(0, 10);

const SUCCESS = new Set(["succeeded", "paid", "captured", "settled", "success"]);
const PENDING = new Set(["pending", "created", "initiated", "requires_action"]);
const PROCESSING = new Set(["processing", "authorized", "in_progress"]);
const FAILED = new Set(["failed", "cancelled", "canceled", "declined", "error"]);
const REFUNDED = new Set(["refunded", "partially_refunded", "reversed"]);

export const classify = (s: string | null | undefined) => {
  const v = (s ?? "").toLowerCase();
  if (SUCCESS.has(v)) return "succeeded" as const;
  if (REFUNDED.has(v)) return "refunded" as const;
  if (PROCESSING.has(v)) return "processing" as const;
  if (PENDING.has(v)) return "pending" as const;
  if (FAILED.has(v)) return "failed" as const;
  return "other" as const;
};

const addrField = (addr: Record<string, unknown> | null, keys: string[]): string | null => {
  if (!addr) return null;
  for (const k of keys) {
    const v = addr[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
};

export function regionOf(order: OrderLite | undefined, payment?: PaymentLite): Region {
  const mr = (order?.market_region ?? "").toLowerCase();
  if (mr === "india" || mr === "in") return "india";
  if (mr === "international" || mr === "intl") return "international";
  const country = addrField(order?.shipping_address ?? null, ["country", "country_code"]);
  if (country) {
    const c = country.toLowerCase();
    if (c === "in" || c === "india") return "india";
    return "international";
  }
  const cur = (payment?.currency ?? order?.currency ?? "INR").toUpperCase();
  return cur === "INR" ? "india" : "international";
}

function bump(map: Map<string, Bucket>, key: string, v: number) {
  const k = key || "unknown";
  const cur = map.get(k) ?? { k, v: 0, n: 0 };
  cur.v += v;
  cur.n += 1;
  map.set(k, cur);
}
const sortBuckets = (m: Map<string, Bucket>, limit = 12) =>
  [...m.values()].sort((a, b) => b.v - a.v).slice(0, limit);

const pct = (curr: number, prev: number): number | null => {
  if (!prev) return null;
  return ((curr - prev) / prev) * 100;
};

/** Fetch + aggregate everything the Payments Center dashboard needs. */
export async function buildPaymentsOverview(windowDays: number): Promise<PaymentsOverview> {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();

  const [payRes, ordRes, refRes, gwRes] = await Promise.all([
    supabaseAdmin
      .from("payments")
      .select(
        "id,order_id,user_id,method,status,amount,currency,transaction_id,razorpay_payment_id,razorpay_order_id,fee,gateway_tax,demo,created_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000),
    supabaseAdmin
      .from("orders")
      .select(
        "id,currency,total,status,payment_status,payment_method,payment_provider,market_region,shipping_address,created_at,user_id,contact_email,tax",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000),
    supabaseAdmin
      .from("refunds")
      .select("id,order_id,amount,currency,reason,status,created_at,updated_at")
      .order("created_at", { ascending: false })
      .limit(2000),
    supabaseAdmin.from("payment_gateways").select("*"),
  ]);

  const payments = (payRes.data ?? []) as unknown as PaymentLite[];
  const orders = (ordRes.data ?? []) as unknown as OrderLite[];
  const refunds = (refRes.data ?? []) as unknown as {
    id: string; order_id: string | null; amount: number | null; currency: string | null;
    reason: string | null; status: string | null; created_at: string; updated_at: string | null;
  }[];
  const gwRows = (gwRes.data ?? []) as unknown as Record<string, unknown>[];

  const orderById = new Map(orders.map((o) => [o.id, o]));

  // ---- KPI windows
  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const yKey = new Date(now.getTime() - 86400_000).toISOString().slice(0, 10);

  let todayRevenue = 0, yRevenue = 0, todayOrders = 0, yOrders = 0;
  let totalCollected = 0, pendingAmt = 0, pendingN = 0, failedAmt = 0, failedN = 0;
  let processingAmt = 0, processingN = 0, refundedAmt = 0, refundedN = 0;
  let succeededN = 0, attemptedN = 0;

  for (const p of payments) {
    const bucketStatus = classify(p.status);
    const amt = num(p.amount);
    const d = dayKey(p.created_at);
    if (bucketStatus !== "other") attemptedN += 1;
    if (bucketStatus === "succeeded") {
      succeededN += 1;
      totalCollected += amt;
      if (d === todayKey) { todayRevenue += amt; todayOrders += 1; }
      if (d === yKey) { yRevenue += amt; yOrders += 1; }
    } else if (bucketStatus === "pending") { pendingAmt += amt; pendingN += 1; }
    else if (bucketStatus === "processing") { processingAmt += amt; processingN += 1; }
    else if (bucketStatus === "failed") { failedAmt += amt; failedN += 1; }
    else if (bucketStatus === "refunded") { refundedAmt += amt; refundedN += 1; }
  }

  const refundValue = refunds.reduce((s, r) => s + num(r.amount), 0);
  const aov = succeededN ? totalCollected / succeededN : 0;
  const successRate = attemptedN ? (succeededN / attemptedN) * 100 : null;

  // Prior-period comparisons (previous equal window).
  const half = windowDays / 2;
  const midpoint = new Date(Date.now() - half * 86400_000).getTime();
  let currRev = 0, prevRev = 0, currN = 0, prevN = 0, currOk = 0, prevOk = 0, currAll = 0, prevAll = 0;
  for (const p of payments) {
    const t = new Date(p.created_at).getTime();
    const recent = t >= midpoint;
    const c = classify(p.status);
    if (c !== "other") { if (recent) currAll += 1; else prevAll += 1; }
    if (c === "succeeded") {
      if (recent) { currRev += num(p.amount); currN += 1; currOk += 1; }
      else { prevRev += num(p.amount); prevN += 1; prevOk += 1; }
    }
  }
  const currAov = currN ? currRev / currN : 0;
  const prevAov = prevN ? prevRev / prevN : 0;
  const currSr = currAll ? (currOk / currAll) * 100 : 0;
  const prevSr = prevAll ? (prevOk / prevAll) * 100 : 0;

  const refundsRecent = refunds.filter((r) => new Date(r.created_at).getTime() >= midpoint)
    .reduce((s, r) => s + num(r.amount), 0);
  const refundsPrev = refunds.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return t < midpoint && t >= midpoint - half * 86400_000;
  }).reduce((s, r) => s + num(r.amount), 0);

  const kpis: PaymentsKpis = {
    today_revenue: todayRevenue,
    today_orders: todayOrders,
    total_collected: totalCollected,
    pending_amount: pendingAmt,
    pending_count: pendingN,
    failed_amount: failedAmt,
    failed_count: failedN,
    refunded_amount: refundValue || refundedAmt,
    refunded_count: refunds.length || refundedN,
    processing_amount: processingAmt,
    processing_count: processingN,
    aov,
    success_rate: successRate,
    chargebacks: null,
    deltas: {
      today_revenue: pct(todayRevenue, yRevenue),
      today_orders: pct(todayOrders, yOrders),
      total_collected: pct(currRev, prevRev),
      aov: pct(currAov, prevAov),
      success_rate: pct(currSr, prevSr),
      refunded_amount: pct(refundsRecent, refundsPrev),
    },
  };

  // ---- Region blocks
  const mkRegion = (region: Region): RegionBlock => ({
    region, revenue: 0, orders: 0, aov: 0, refund_value: 0, refund_count: 0,
    methods: [], currencies: [], daily: [], hourly: [], geo: [], cities: [], customers: [], gateways: [],
    gst_estimate: region === "india" ? 0 : null, cod_value: 0, prepaid_value: 0,
  });
  const regions: Record<Region, RegionBlock> = { india: mkRegion("india"), international: mkRegion("international") };
  const acc: Record<Region, {
    methods: Map<string, Bucket>; currencies: Map<string, Bucket>; geo: Map<string, Bucket>;
    cities: Map<string, Bucket>; customers: Map<string, { id: string; label: string; v: number; n: number }>;
    daily: Map<string, DayPoint>; gateways: Map<string, Bucket>; hourly: HourPoint[];
  }> = {
    india: { methods: new Map(), currencies: new Map(), geo: new Map(), cities: new Map(), customers: new Map(), daily: new Map(), gateways: new Map(), hourly: Array.from({ length: 24 }, (_, h) => ({ h, v: 0, n: 0 })) },
    international: { methods: new Map(), currencies: new Map(), geo: new Map(), cities: new Map(), customers: new Map(), daily: new Map(), gateways: new Map(), hourly: Array.from({ length: 24 }, (_, h) => ({ h, v: 0, n: 0 })) },
  };

  const dailyAll = new Map<string, DayPoint>();

  const touchDay = (m: Map<string, DayPoint>, date: string) => {
    const cur = m.get(date) ?? { date, revenue: 0, orders: 0, refunds: 0 };
    m.set(date, cur);
    return cur;
  };

  for (const p of payments) {
    if (classify(p.status) !== "succeeded") continue;
    const order = p.order_id ? orderById.get(p.order_id) : undefined;
    const region = regionOf(order, p);
    const block = regions[region];
    const a = acc[region];
    const amt = num(p.amount);
    const cur = (p.currency ?? order?.currency ?? "INR").toUpperCase();

    block.revenue += amt;
    block.orders += 1;

    const method = (p.method ?? order?.payment_method ?? "unknown").toLowerCase();
    bump(a.methods, method, amt);
    bump(a.currencies, cur, amt);
    if (method === "cod") block.cod_value += amt; else block.prepaid_value += amt;

    const state = addrField(order?.shipping_address ?? null, ["state", "region", "province"]);
    const country = addrField(order?.shipping_address ?? null, ["country", "country_code"]);
    const city = addrField(order?.shipping_address ?? null, ["city", "town"]);
    if (region === "india") { if (state) bump(a.geo, state, amt); }
    else if (country) bump(a.geo, country, amt);
    if (city) bump(a.cities, city, amt);

    const custId = p.user_id ?? order?.user_id ?? null;
    const label = order?.contact_email ?? custId ?? "Guest";
    if (custId || order?.contact_email) {
      const key = custId ?? label;
      const c = a.customers.get(key) ?? { id: key, label, v: 0, n: 0 };
      c.v += amt; c.n += 1;
      a.customers.set(key, c);
    }

    if (region === "india" && order?.tax != null) block.gst_estimate = (block.gst_estimate ?? 0) + num(order.tax);

    const gwKey = (order?.payment_provider
      ?? (p.razorpay_payment_id ? "razorpay" : null)
      ?? (p.method === "cod" ? "cod" : null)
      ?? p.method
      ?? "unknown").toLowerCase();
    bump(a.gateways, gwKey, amt);

    const hr = new Date(p.created_at).getHours();
    const slot = a.hourly[hr];
    if (slot) { slot.v += amt; slot.n += 1; }

    const d = dayKey(p.created_at);
    const dp = touchDay(a.daily, d); dp.revenue += amt; dp.orders += 1;
    const da = touchDay(dailyAll, d); da.revenue += amt; da.orders += 1;

  }

  for (const r of refunds) {
    const order = r.order_id ? orderById.get(r.order_id) : undefined;
    const region = regionOf(order);
    regions[region].refund_value += num(r.amount);
    regions[region].refund_count += 1;
    const d = dayKey(r.created_at);
    touchDay(acc[region].daily, d).refunds += num(r.amount);
    touchDay(dailyAll, d).refunds += num(r.amount);
  }

  for (const region of ["india", "international"] as Region[]) {
    const a = acc[region];
    const b = regions[region];
    b.methods = sortBuckets(a.methods);
    b.currencies = sortBuckets(a.currencies);
    b.geo = sortBuckets(a.geo, 10);
    b.cities = sortBuckets(a.cities, 10);
    b.gateways = sortBuckets(a.gateways, 8);
    b.customers = [...a.customers.values()].sort((x, y) => y.v - x.v).slice(0, 8);
    b.daily = [...a.daily.values()].sort((x, y) => x.date.localeCompare(y.date));
    b.hourly = a.hourly;
    b.aov = b.orders ? b.revenue / b.orders : 0;
  }


  // ---- Gateways
  const gwAcc = new Map<string, GatewayBlock>();
  const ensureGw = (provider: string): GatewayBlock => {
    const key = provider.toLowerCase();
    const found = gwAcc.get(key);
    if (found) return found;
    const created: GatewayBlock = {
      provider: key, display_name: key.charAt(0).toUpperCase() + key.slice(1),
      enabled: null, mode: null, configured: null,
      transactions: 0, succeeded: 0, failed: 0, revenue: 0,
      success_rate: null, failure_rate: null, latency_ms: null, last_sync: null,
    };

    gwAcc.set(key, created);
    return created;
  };
  for (const row of gwRows) {
    const g = ensureGw(String(row.provider ?? "unknown"));
    g.display_name = String(row.display_name ?? g.display_name);
    g.enabled = Boolean(row.enabled);
    g.mode = (row.mode as string) ?? null;
    g.configured = Boolean(row.configured);
    g.last_sync = (row.last_checked_at as string) ?? (row.updated_at as string) ?? null;
  }
  for (const p of payments) {
    const order = p.order_id ? orderById.get(p.order_id) : undefined;
    const provider = (order?.payment_provider
      ?? (p.razorpay_payment_id ? "razorpay" : null)
      ?? (p.method === "cod" ? "cod" : null)
      ?? p.method
      ?? "unknown").toLowerCase();
    const g = ensureGw(provider);
    g.transactions += 1;
    const c = classify(p.status);
    if (c === "succeeded") { g.succeeded += 1; g.revenue += num(p.amount); }
    if (c === "failed") g.failed += 1;
    if (!g.last_sync || p.created_at > g.last_sync) g.last_sync = p.created_at;
  }
  const gateways = [...gwAcc.values()]
    .map((g) => ({
      ...g,
      success_rate: g.transactions ? (g.succeeded / g.transactions) * 100 : null,
      failure_rate: g.transactions ? (g.failed / g.transactions) * 100 : null,
      latency_ms: null,
    }))
    .sort((a, b) => b.revenue - a.revenue || a.provider.localeCompare(b.provider));


  // ---- Refunds block
  const reasons = new Map<string, Bucket>();
  let refundOk = 0, refundClosed = 0, hoursSum = 0, hoursN = 0;
  for (const r of refunds) {
    bump(reasons, (r.reason ?? "unspecified").toLowerCase(), num(r.amount));
    const c = classify(r.status);
    if (c === "succeeded" || c === "refunded") {
      refundOk += 1; refundClosed += 1;
      if (r.updated_at) {
        const h = (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 3600_000;
        if (h >= 0) { hoursSum += h; hoursN += 1; }
      }
    } else if (c === "failed") refundClosed += 1;
  }
  const mapRefund = (r: (typeof refunds)[number]) => ({
    id: r.id, order_id: r.order_id, amount: num(r.amount), currency: (r.currency ?? "INR").toUpperCase(),
    status: r.status ?? "pending", reason: r.reason, created_at: r.created_at,
  });
  const refundBlock: RefundBlock = {
    queue: refunds.filter((r) => ["pending", "processing"].includes(classify(r.status))).slice(0, 30).map(mapRefund),
    history: refunds.slice(0, 40).map(mapRefund),
    reasons: sortBuckets(reasons, 8),
    success_rate: refundClosed ? (refundOk / refundClosed) * 100 : null,
    avg_hours: hoursN ? hoursSum / hoursN : null,
    total_value: refundValue,
  };

  // ---- Live activity (real events only)
  const activity: ActivityItem[] = [
    ...payments.slice(0, 40).map((p) => {
      const c = classify(p.status);
      return {
        id: `p_${p.id}`,
        kind: (c === "failed" ? "failed" : "payment") as ActivityItem["kind"],
        label: c === "failed" ? "Payment failed" : c === "succeeded" ? "Payment received" : `Payment ${c}`,
        amount: num(p.amount),
        currency: (p.currency ?? "INR").toUpperCase(),
        at: p.created_at,
      };
    }),
    ...refunds.slice(0, 20).map((r) => ({
      id: `r_${r.id}`,
      kind: "refund" as const,
      label: classify(r.status) === "succeeded" ? "Refund completed" : "Refund requested",
      amount: num(r.amount),
      currency: (r.currency ?? "INR").toUpperCase(),
      at: r.created_at,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 30);

  // ---- Payment health score (only metrics with a real source contribute)
  const totalPaymentAttempts = attemptedN;
  const refundRate = totalCollected > 0 ? (refundValue / totalCollected) * 100 : null;
  const pendingBacklogRate = totalPaymentAttempts ? ((pendingN + processingN) / totalPaymentAttempts) * 100 : null;
  const failureRate = totalPaymentAttempts ? (failedN / totalPaymentAttempts) * 100 : null;
  const configurable = gateways.filter((g) => g.enabled != null);
  const gatewayReady = configurable.length
    ? (configurable.filter((g) => g.enabled && g.configured).length / configurable.length) * 100
    : null;

  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const factors: HealthFactor[] = [
    {
      key: "success_rate", label: "Success rate", weight: 0.35,
      score: successRate == null ? null : clamp(successRate),
      detail: successRate == null ? "No payment attempts recorded" : `${successRate.toFixed(1)}% of attempts captured`,
    },
    {
      key: "failures", label: "Failed payments", weight: 0.2,
      score: failureRate == null ? null : clamp(100 - failureRate * 2),
      detail: failureRate == null ? "No payment attempts recorded" : `${failedN} failure(s) · ${failureRate.toFixed(1)}%`,
    },
    {
      key: "pending", label: "Pending backlog", weight: 0.15,
      score: pendingBacklogRate == null ? null : clamp(100 - pendingBacklogRate * 2),
      detail: pendingBacklogRate == null ? "No payment attempts recorded" : `${pendingN + processingN} awaiting completion`,
    },
    {
      key: "refunds", label: "Refund rate", weight: 0.15,
      score: refundRate == null ? null : clamp(100 - refundRate * 4),
      detail: refundRate == null ? "No collected revenue to compare" : `${refundRate.toFixed(1)}% of collected revenue`,
    },
    {
      key: "gateways", label: "Gateway readiness", weight: 0.15,
      score: gatewayReady,
      detail: gatewayReady == null ? "No gateway configuration found" : `${configurable.filter((g) => g.enabled && g.configured).length}/${configurable.length} gateways live`,
    },
    {
      key: "latency", label: "Processing latency", weight: 0,
      score: null,
      detail: "No latency telemetry source connected",
    },
  ];
  const usable = factors.filter((f) => f.score != null && f.weight > 0);
  const weightSum = usable.reduce((s, f) => s + f.weight, 0);
  const healthScore = weightSum
    ? Math.round(usable.reduce((s, f) => s + (f.score as number) * f.weight, 0) / weightSum)
    : null;
  const health: HealthBlock = {
    score: healthScore,
    grade:
      healthScore == null ? null
        : healthScore >= 90 ? "Excellent"
        : healthScore >= 75 ? "Good"
        : healthScore >= 55 ? "Fair"
        : "At risk",
    factors,
    excluded: factors.filter((f) => f.score == null).map((f) => f.label),
  };

  // ---- Smart insights (derived from real aggregates only)
  const insights: Insight[] = [];
  if (kpis.deltas.success_rate != null && Math.abs(kpis.deltas.success_rate) >= 1) {
    const up = kpis.deltas.success_rate > 0;
    insights.push({
      id: "sr",
      tone: up ? "good" : "warn",
      title: `Payment success rate ${up ? "increased" : "decreased"} ${Math.abs(kpis.deltas.success_rate).toFixed(1)}%`,
      detail: `Compared with the previous ${Math.round(half)} days.`,
    });
  }
  if (refundRate != null) {
    insights.push({
      id: "refund-rate",
      tone: refundRate <= 3 ? "good" : refundRate <= 8 ? "info" : "warn",
      title: `Refund rate is ${refundRate.toFixed(1)}% of collected revenue`,
      detail: `${refunds.length} refund(s) totalling ${refundValue.toFixed(0)} across the window.`,
    });
  }
  const intlRev = regions.international.revenue;
  const inRev = regions.india.revenue;
  if (intlRev > 0 && inRev + intlRev > 0) {
    insights.push({
      id: "intl-share",
      tone: "info",
      title: `International orders are ${((intlRev / (inRev + intlRev)) * 100).toFixed(1)}% of revenue`,
      detail: `${regions.international.orders} cross-border payment(s) captured.`,
    });
  }
  const allMethods = new Map<string, Bucket>();
  for (const region of ["india", "international"] as Region[]) {
    for (const m of regions[region].methods) bump(allMethods, m.k, m.v);
  }
  const topMethod = [...allMethods.values()].sort((a, b) => b.n - a.n)[0];
  if (topMethod) {
    insights.push({
      id: "top-method",
      tone: "info",
      title: `${topMethod.k.toUpperCase()} is the most-used payment method`,
      detail: `${topMethod.n} successful payment(s) via ${topMethod.k}.`,
    });
  }
  const worstGw = gateways
    .filter((g) => g.transactions >= 5 && g.failed > 0)
    .sort((a, b) => (b.failure_rate ?? 0) - (a.failure_rate ?? 0))[0];
  if (worstGw && (worstGw.failure_rate ?? 0) >= 10) {
    insights.push({
      id: "gw-failures",
      tone: "bad",
      title: `Most failures are occurring on ${worstGw.display_name}`,
      detail: `${worstGw.failed} of ${worstGw.transactions} transactions failed (${(worstGw.failure_rate ?? 0).toFixed(1)}%).`,
    });
  }
  if (pendingN > 0) {
    insights.push({
      id: "pending",
      tone: pendingN > 10 ? "warn" : "info",
      title: `${pendingN} payment(s) are still pending`,
      detail: `Worth ${pendingAmt.toFixed(0)} in uncollected value.`,
    });
  }

  const quick: QuickCounts = {
    today: payments.filter((p) => dayKey(p.created_at) === todayKey).length,
    pending: pendingN + processingN,
    refund_queue: refundBlock.queue.length,
    failed: failedN,
    settlements: null,
  };

  // ---- Vendor payouts (only when the marketplace actually has vendor rows)
  let vendorPayouts: VendorPayoutBlock = { enabled: false, rows: [] };
  const [vendorRes, payoutRes, commissionRes] = await Promise.all([
    supabaseAdmin.from("vendors").select("id,business_name,commission_rate").limit(500),
    supabaseAdmin.from("vendor_payouts").select("vendor_id,amount,currency,status,period_end,processed_at").limit(5000),
    supabaseAdmin.from("vendor_commissions").select("vendor_id,amount,rate,currency,status").limit(5000),
  ]);
  const vendorRows = (vendorRes.data ?? []) as unknown as { id: string; business_name: string | null; commission_rate: number | null }[];
  if (vendorRows.length) {
    const payoutRows = (payoutRes.data ?? []) as unknown as { vendor_id: string; amount: number | null; currency: string | null; status: string | null; period_end: string | null; processed_at: string | null }[];
    const commRows = (commissionRes.data ?? []) as unknown as { vendor_id: string; amount: number | null; currency: string | null; status: string | null }[];
    vendorPayouts = {
      enabled: true,
      rows: vendorRows.map((v) => {
        const mine = payoutRows.filter((p) => p.vendor_id === v.id);
        const comm = commRows.filter((c) => c.vendor_id === v.id);
        const pending = mine.filter((p) => ["pending", "processing"].includes(classify(p.status))).reduce((s, p) => s + num(p.amount), 0);
        const completed = mine.filter((p) => classify(p.status) === "succeeded").reduce((s, p) => s + num(p.amount), 0);
        const commission = comm.length ? comm.reduce((s, c) => s + num(c.amount), 0) : null;
        const upcoming = mine
          .filter((p) => classify(p.status) !== "succeeded" && p.period_end)
          .map((p) => p.period_end as string)
          .sort()[0] ?? null;
        return {
          vendor_id: v.id,
          vendor: v.business_name ?? "Vendor",
          pending,
          completed,
          next_settlement: upcoming,
          total_sales: null,
          commission,
          net_earnings: commission == null ? null : pending + completed,
          currency: (mine[0]?.currency ?? comm[0]?.currency ?? "INR").toUpperCase(),
        };
      }).sort((a, b) => b.pending - a.pending || b.completed - a.completed),
    };
  }

  return {
    kpis,
    health,
    insights,
    quick,
    regions,
    daily: [...dailyAll.values()].sort((a, b) => a.date.localeCompare(b.date)),
    gateways,
    refunds: refundBlock,
    vendor_payouts: vendorPayouts,
    settlements: null,
    activity,
    window_days: windowDays,
    generated_at: new Date().toISOString(),
    has_any_data: payments.length > 0 || orders.length > 0 || refunds.length > 0,
  };
}


export type LedgerFilters = {
  search?: string;
  from?: string;
  to?: string;
  region?: "all" | Region;
  country?: string;
  currency?: string;
  gateway?: string;
  method?: string;
  status?: string;
  orderStatus?: string;
  minAmount?: number;
  maxAmount?: number;
  sort?: "recent" | "oldest" | "amount_desc" | "amount_asc";
  page: number;
  pageSize: number;
};

export type LedgerRow = {
  id: string;
  order_id: string | null;
  customer: string;
  customer_email: string | null;
  country: string | null;
  currency: string;
  amount: number;
  method: string | null;
  gateway: string;
  status: string;
  order_status: string | null;
  settlement_status: null;
  transaction_id: string | null;
  created_at: string;
  region: Region;
};

export type LedgerResult = { rows: LedgerRow[]; total: number; capped: boolean };

/** Filtered, sorted, paginated payment ledger built from real rows only. */
export async function buildLedger(f: LedgerFilters): Promise<LedgerResult> {
  const CAP = 5000;
  let q = supabaseAdmin
    .from("payments")
    .select(
      "id,order_id,user_id,method,status,amount,currency,transaction_id,razorpay_payment_id,razorpay_order_id,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(CAP);

  if (f.from) q = q.gte("created_at", f.from);
  if (f.to) q = q.lte("created_at", f.to);
  if (f.currency && f.currency !== "all") q = q.eq("currency", f.currency);
  if (f.minAmount != null) q = q.gte("amount", f.minAmount);
  if (f.maxAmount != null) q = q.lte("amount", f.maxAmount);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const payments = (data ?? []) as unknown as PaymentLite[];

  const orderIds = [...new Set(payments.map((p) => p.order_id).filter((v): v is string => !!v))];
  const orders: OrderLite[] = [];
  for (let i = 0; i < orderIds.length; i += 500) {
    const { data: od } = await supabaseAdmin
      .from("orders")
      .select("id,currency,total,status,payment_status,payment_method,payment_provider,market_region,shipping_address,created_at,user_id,contact_email,tax")
      .in("id", orderIds.slice(i, i + 500));
    orders.push(...((od ?? []) as unknown as OrderLite[]));
  }
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const userIds = [...new Set(payments.map((p) => p.user_id).filter((v): v is string => !!v))];
  const profiles = new Map<string, { full_name: string | null; phone: string | null }>();
  for (let i = 0; i < userIds.length; i += 500) {
    const { data: pd } = await supabaseAdmin
      .from("profiles")
      .select("id,full_name,phone")
      .in("id", userIds.slice(i, i + 500));
    for (const row of (pd ?? []) as { id: string; full_name: string | null; phone: string | null }[]) {
      profiles.set(row.id, { full_name: row.full_name, phone: row.phone });
    }
  }

  let rows: LedgerRow[] = payments.map((p) => {
    const o = p.order_id ? orderById.get(p.order_id) : undefined;
    const prof = p.user_id ? profiles.get(p.user_id) : undefined;
    const gateway = (o?.payment_provider
      ?? (p.razorpay_payment_id ? "razorpay" : null)
      ?? (p.method === "cod" ? "cod" : null)
      ?? p.method
      ?? "unknown").toLowerCase();
    return {
      id: p.id,
      order_id: p.order_id,
      customer: prof?.full_name || o?.contact_email || "Guest",
      customer_email: o?.contact_email ?? null,
      country: addrField(o?.shipping_address ?? null, ["country", "country_code"]),
      currency: (p.currency ?? o?.currency ?? "INR").toUpperCase(),
      amount: num(p.amount),
      method: p.method ?? o?.payment_method ?? null,
      gateway,
      status: classify(p.status) === "other" ? (p.status ?? "unknown") : classify(p.status),
      order_status: o?.status ?? null,
      settlement_status: null,
      transaction_id: p.razorpay_payment_id ?? p.transaction_id ?? null,
      created_at: p.created_at,
      region: regionOf(o, p),
    };
  });

  const term = f.search?.trim().toLowerCase();
  if (term) {
    rows = rows.filter((r) =>
      [r.id, r.order_id, r.customer, r.customer_email, r.transaction_id, r.gateway, r.method, r.country]
        .some((v) => (v ?? "").toString().toLowerCase().includes(term)),
    );
  }
  if (f.region && f.region !== "all") rows = rows.filter((r) => r.region === f.region);
  if (f.country && f.country !== "all") rows = rows.filter((r) => (r.country ?? "").toLowerCase() === f.country!.toLowerCase());
  if (f.gateway && f.gateway !== "all") rows = rows.filter((r) => r.gateway === f.gateway);
  if (f.method && f.method !== "all") rows = rows.filter((r) => (r.method ?? "").toLowerCase() === f.method);
  if (f.status && f.status !== "all") rows = rows.filter((r) => r.status === f.status);
  if (f.orderStatus && f.orderStatus !== "all") rows = rows.filter((r) => (r.order_status ?? "") === f.orderStatus);

  switch (f.sort) {
    case "oldest": rows.sort((a, b) => a.created_at.localeCompare(b.created_at)); break;
    case "amount_desc": rows.sort((a, b) => b.amount - a.amount); break;
    case "amount_asc": rows.sort((a, b) => a.amount - b.amount); break;
    default: rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  const total = rows.length;
  const start = f.page * f.pageSize;
  return { rows: rows.slice(start, start + f.pageSize), total, capped: payments.length >= CAP };
}
