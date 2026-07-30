/**
 * Payments Center v6 — Global Financial Intelligence (server-only aggregation).
 *
 * READ ONLY. Never mutates payments, orders, refunds, vendors or gateways.
 * Every metric is derived from rows that already exist. Metrics with no
 * source return `null` so the UI can render an honest empty state.
 *
 * Currency policy: revenue is always reported in BOTH native currencies and a
 * single reporting currency (INR). Native amounts are never summed across
 * currencies; the reporting-currency total uses the indicative reference rate
 * table below, which is clearly labelled in the UI.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type Scope = "india" | "international" | "global";

export const REPORTING_CURRENCY = "INR";

/** Indicative reference rates → 1 unit of currency in INR. Labelled in the UI. */
const REFERENCE_RATES: Record<string, number> = {
  INR: 1,
  USD: 88,
  EUR: 95,
  GBP: 112,
  AED: 24,
  CAD: 64,
  AUD: 58,
  SGD: 65,
  JPY: 0.58,
  CHF: 100,
  NZD: 53,
  SAR: 23.5,
};

export type NativeAmount = { currency: string; amount: number; orders: number };

export type ScopeKpis = {
  scope: Scope;
  /** Reporting-currency (INR) total. */
  revenue: number;
  /** Per-currency native totals — never summed together. */
  native: NativeAmount[];
  primary_currency: string;
  orders: number;
  refund_value: number;
  refund_count: number;
  refund_rate: number | null;
  success_rate: number | null;
  aov: number;
  avg_payment_hours: number | null;
  cancelled_orders: number;
  pending_amount: number;
  pending_count: number;
  settlement_amount: number | null;
  net_revenue: number;
  platform_earnings: number | null;
  vendor_earnings: number | null;
  tax_collected: number;
  growth: {
    revenue: number | null;
    orders: number | null;
    aov: number | null;
    refunds: number | null;
  };
  today_revenue: number;
  today_growth: number | null;
  has_data: boolean;
};

export type CountryRow = {
  code: string;
  country: string;
  scope: Exclude<Scope, "global">;
  revenue: number;
  orders: number;
  growth: number | null;
  refund_rate: number | null;
  aov: number;
  success_rate: number | null;
  top_method: string | null;
  currency: string;
};

export type CurrencyRow = {
  currency: string;
  revenue_native: number;
  revenue_reporting: number;
  orders: number;
  growth: number | null;
  refund_rate: number | null;
  aov: number;
};

export type GatewayRow = {
  key: string;
  label: string;
  revenue: number;
  orders: number;
  success_rate: number | null;
  failure_rate: number | null;
  refund_rate: number | null;
  avg_processing_hours: number | null;
  growth: number | null;
};

export type TaxRow = { key: string; label: string; scope: Scope; amount: number | null; note: string };

export type SettlementBlock = { scope: Exclude<Scope, "global">; available: false; note: string };

export type VendorRevenueRow = {
  vendor_id: string;
  vendor: string;
  india: number;
  international: number;
  combined: number;
  commission: number | null;
  net_earnings: number | null;
  pending_payout: number;
  completed_payout: number;
};

export type GlobalInsight = {
  id: string;
  tone: "good" | "warn" | "bad" | "info";
  title: string;
  detail: string;
};

export type RegionSeriesPoint = { date: string; india: number; international: number; refunds: number };

export type GlobalFinance = {
  window_days: number;
  generated_at: string;
  reporting_currency: string;
  rates: Record<string, number>;
  rates_note: string;
  scopes: Record<Scope, ScopeKpis>;
  countries: CountryRow[];
  currencies: CurrencyRow[];
  gateways: { india: GatewayRow[]; international: GatewayRow[] };
  taxes: TaxRow[];
  settlements: { india: SettlementBlock; international: SettlementBlock };
  vendors: { enabled: boolean; rows: VendorRevenueRow[] };
  insights: GlobalInsight[];
  series: RegionSeriesPoint[];
  region_split: { k: string; v: number; n: number }[];
  has_any_data: boolean;
};

type OrderRow = {
  id: string;
  currency: string | null;
  total: number | null;
  subtotal: number | null;
  tax: number | null;
  shipping: number | null;
  discount: number | null;
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

type PayRow = {
  id: string;
  order_id: string | null;
  method: string | null;
  status: string | null;
  amount: number | null;
  currency: string | null;
  created_at: string;
};

const num = (v: unknown) => Number(v ?? 0) || 0;
const day = (iso: string) => iso.slice(0, 10);
const SUCCESS = new Set(["succeeded", "paid", "captured", "settled", "success"]);
const PENDING = new Set(["pending", "created", "initiated", "requires_action", "processing", "authorized"]);
const FAILED = new Set(["failed", "cancelled", "canceled", "declined", "error"]);
const REFUNDED = new Set(["refunded", "partially_refunded", "reversed"]);

const state = (s: string | null | undefined) => {
  const v = (s ?? "").toLowerCase();
  if (SUCCESS.has(v)) return "ok" as const;
  if (REFUNDED.has(v)) return "refunded" as const;
  if (PENDING.has(v)) return "pending" as const;
  if (FAILED.has(v)) return "failed" as const;
  return "other" as const;
};

const pct = (curr: number, prev: number): number | null => (prev ? ((curr - prev) / prev) * 100 : null);

export const toReporting = (amount: number, currency: string | null | undefined) => {
  const c = (currency ?? REPORTING_CURRENCY).toUpperCase();
  const rate = REFERENCE_RATES[c];
  return rate == null ? amount : amount * rate;
};

const COUNTRY_NAMES: Record<string, string> = {
  IN: "India", US: "United States", GB: "United Kingdom", UK: "United Kingdom", CA: "Canada",
  AU: "Australia", AE: "United Arab Emirates", DE: "Germany", FR: "France", SG: "Singapore",
  JP: "Japan", NZ: "New Zealand", CH: "Switzerland", NL: "Netherlands", SA: "Saudi Arabia",
};

function countryOf(addr: Record<string, unknown> | null): string | null {
  if (!addr) return null;
  for (const k of ["country_code", "country", "countryCode"]) {
    const v = addr[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function normCountry(raw: string | null): { code: string; name: string } | null {
  if (!raw) return null;
  const t = raw.trim();
  if (!t) return null;
  const upper = t.toUpperCase();
  if (upper.length <= 3) {
    const code = upper.slice(0, 2);
    return { code, name: COUNTRY_NAMES[code] ?? upper };
  }
  const byName = Object.entries(COUNTRY_NAMES).find(([, n]) => n.toLowerCase() === t.toLowerCase());
  if (byName) return { code: byName[0], name: byName[1] };
  return { code: upper.slice(0, 2), name: t };
}

function regionOfOrder(o: OrderRow | undefined, p?: PayRow): Exclude<Scope, "global"> {
  const mr = (o?.market_region ?? "").toLowerCase();
  if (mr === "india" || mr === "in") return "india";
  if (mr === "international" || mr === "intl") return "international";
  const c = normCountry(countryOf(o?.shipping_address ?? null));
  if (c) return c.code === "IN" ? "india" : "international";
  const cur = (p?.currency ?? o?.currency ?? "INR").toUpperCase();
  return cur === "INR" ? "india" : "international";
}

type Acc = {
  revenue: number;
  native: Map<string, { amount: number; orders: number }>;
  orders: number;
  refundValue: number;
  refundCount: number;
  ok: number;
  attempts: number;
  pendingAmt: number;
  pendingN: number;
  cancelled: number;
  tax: number;
  payHoursSum: number;
  payHoursN: number;
  today: number;
  yesterday: number;
  currRev: number;
  prevRev: number;
  currN: number;
  prevN: number;
  currRef: number;
  prevRef: number;
};

const newAcc = (): Acc => ({
  revenue: 0, native: new Map(), orders: 0, refundValue: 0, refundCount: 0, ok: 0, attempts: 0,
  pendingAmt: 0, pendingN: 0, cancelled: 0, tax: 0, payHoursSum: 0, payHoursN: 0,
  today: 0, yesterday: 0, currRev: 0, prevRev: 0, currN: 0, prevN: 0, currRef: 0, prevRef: 0,
});

function finish(scope: Scope, a: Acc, commission: number | null, vendorNet: number | null): ScopeKpis {
  const native: NativeAmount[] = [...a.native.entries()]
    .map(([currency, v]) => ({ currency, amount: v.amount, orders: v.orders }))
    .sort((x, y) => toReporting(y.amount, y.currency) - toReporting(x.amount, x.currency));
  const currAov = a.currN ? a.currRev / a.currN : 0;
  const prevAov = a.prevN ? a.prevRev / a.prevN : 0;
  return {
    scope,
    revenue: a.revenue,
    native,
    primary_currency: native[0]?.currency ?? (scope === "india" ? "INR" : REPORTING_CURRENCY),
    orders: a.orders,
    refund_value: a.refundValue,
    refund_count: a.refundCount,
    refund_rate: a.revenue > 0 ? (a.refundValue / a.revenue) * 100 : null,
    success_rate: a.attempts ? (a.ok / a.attempts) * 100 : null,
    aov: a.orders ? a.revenue / a.orders : 0,
    avg_payment_hours: a.payHoursN ? a.payHoursSum / a.payHoursN : null,
    cancelled_orders: a.cancelled,
    pending_amount: a.pendingAmt,
    pending_count: a.pendingN,
    settlement_amount: null,
    net_revenue: a.revenue - a.refundValue,
    platform_earnings: commission,
    vendor_earnings: vendorNet,
    tax_collected: a.tax,
    growth: {
      revenue: pct(a.currRev, a.prevRev),
      orders: pct(a.currN, a.prevN),
      aov: pct(currAov, prevAov),
      refunds: pct(a.currRef, a.prevRef),
    },
    today_revenue: a.today,
    today_growth: pct(a.today, a.yesterday),
    has_data: a.orders > 0 || a.attempts > 0,
  };
}

/** Build the full Global Financial Intelligence payload. */
export async function buildGlobalFinance(windowDays: number): Promise<GlobalFinance> {
  const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
  const midpoint = Date.now() - (windowDays / 2) * 86400_000;
  const todayKey = new Date().toISOString().slice(0, 10);
  const yKey = new Date(Date.now() - 86400_000).toISOString().slice(0, 10);

  const [ordRes, payRes, refRes, vendorRes, payoutRes, commRes] = await Promise.all([
    supabaseAdmin
      .from("orders")
      .select(
        "id,currency,total,subtotal,tax,shipping,discount,status,payment_status,payment_method,payment_provider,market_region,shipping_address,created_at,paid_at,cancelled_at",
      )
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000),
    supabaseAdmin
      .from("payments")
      .select("id,order_id,method,status,amount,currency,created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(20000),
    supabaseAdmin
      .from("refunds")
      .select("id,order_id,amount,currency,status,created_at")
      .gte("created_at", since)
      .limit(5000),
    supabaseAdmin.from("vendors").select("id,business_name,commission_rate").limit(500),
    supabaseAdmin.from("vendor_payouts").select("vendor_id,amount,currency,status").limit(5000),
    supabaseAdmin.from("vendor_commissions").select("vendor_id,amount,currency,status").limit(5000),
  ]);

  const orders = (ordRes.data ?? []) as unknown as OrderRow[];
  const payments = (payRes.data ?? []) as unknown as PayRow[];
  const refunds = (refRes.data ?? []) as unknown as {
    id: string; order_id: string | null; amount: number | null; currency: string | null; status: string | null; created_at: string;
  }[];

  const orderById = new Map(orders.map((o) => [o.id, o]));

  const acc: Record<Scope, Acc> = { india: newAcc(), international: newAcc(), global: newAcc() };
  const countryAcc = new Map<string, {
    name: string; scope: Exclude<Scope, "global">; revenue: number; orders: number; refunds: number;
    ok: number; attempts: number; curr: number; prev: number; methods: Map<string, number>; currency: string;
  }>();
  const currencyAcc = new Map<string, { native: number; reporting: number; orders: number; refunds: number; curr: number; prev: number }>();
  const gwAcc = new Map<string, {
    scope: Exclude<Scope, "global">; label: string; revenue: number; orders: number; ok: number;
    failed: number; attempts: number; refunds: number; hoursSum: number; hoursN: number; curr: number; prev: number;
  }>();
  const seriesMap = new Map<string, RegionSeriesPoint>();

  const addSeries = (d: string, region: Exclude<Scope, "global">, v: number, refund = 0) => {
    const row = seriesMap.get(d) ?? { date: d, india: 0, international: 0, refunds: 0 };
    row[region] += v;
    row.refunds += refund;
    seriesMap.set(d, row);
  };

  // ---- Payments drive revenue, success rate and gateway performance.
  for (const p of payments) {
    const o = p.order_id ? orderById.get(p.order_id) : undefined;
    const region = regionOfOrder(o, p);
    const st = state(p.status);
    const cur = (p.currency ?? o?.currency ?? "INR").toUpperCase();
    const nativeAmt = num(p.amount);
    const amt = toReporting(nativeAmt, cur);
    const recent = new Date(p.created_at).getTime() >= midpoint;
    const targets: Scope[] = [region, "global"];

    for (const t of targets) {
      const a = acc[t];
      if (st !== "other") a.attempts += 1;
      if (st === "ok") {
        a.ok += 1;
        a.orders += 1;
        a.revenue += amt;
        const n = a.native.get(cur) ?? { amount: 0, orders: 0 };
        n.amount += nativeAmt; n.orders += 1;
        a.native.set(cur, n);
        if (day(p.created_at) === todayKey) a.today += amt;
        if (day(p.created_at) === yKey) a.yesterday += amt;
        if (recent) { a.currRev += amt; a.currN += 1; } else { a.prevRev += amt; a.prevN += 1; }
      } else if (st === "pending") { a.pendingAmt += amt; a.pendingN += 1; }
    }

    if (st === "ok") addSeries(day(p.created_at), region, amt);

    // Currency analytics
    if (st === "ok") {
      const c = currencyAcc.get(cur) ?? { native: 0, reporting: 0, orders: 0, refunds: 0, curr: 0, prev: 0 };
      c.native += nativeAmt; c.reporting += amt; c.orders += 1;
      if (recent) c.curr += amt; else c.prev += amt;
      currencyAcc.set(cur, c);
    }

    // Gateway / method intelligence (per region)
    const gwKey = (o?.payment_provider ?? p.method ?? o?.payment_method ?? "unknown").toLowerCase();
    const key = `${region}:${gwKey}`;
    const g = gwAcc.get(key) ?? {
      scope: region, label: gwKey, revenue: 0, orders: 0, ok: 0, failed: 0, attempts: 0,
      refunds: 0, hoursSum: 0, hoursN: 0, curr: 0, prev: 0,
    };
    if (st !== "other") g.attempts += 1;
    if (st === "ok") {
      g.ok += 1; g.orders += 1; g.revenue += amt;
      if (recent) g.curr += amt; else g.prev += amt;
    }
    if (st === "failed") g.failed += 1;
    if (o?.paid_at) {
      const h = (new Date(o.paid_at).getTime() - new Date(o.created_at).getTime()) / 3600_000;
      if (h >= 0 && h < 24 * 30) { g.hoursSum += h; g.hoursN += 1; }
    }
    gwAcc.set(key, g);

    // Country analytics
    const c = normCountry(countryOf(o?.shipping_address ?? null)) ?? (region === "india" ? { code: "IN", name: "India" } : null);
    if (c) {
      const row = countryAcc.get(c.code) ?? {
        name: c.name, scope: region, revenue: 0, orders: 0, refunds: 0, ok: 0, attempts: 0,
        curr: 0, prev: 0, methods: new Map<string, number>(), currency: cur,
      };
      if (st !== "other") row.attempts += 1;
      if (st === "ok") {
        row.ok += 1; row.orders += 1; row.revenue += amt; row.currency = cur;
        row.methods.set(gwKey, (row.methods.get(gwKey) ?? 0) + 1);
        if (recent) row.curr += amt; else row.prev += amt;
      }
      countryAcc.set(c.code, row);
    }
  }

  // ---- Orders contribute tax, cancellations and payment latency.
  for (const o of orders) {
    const region = regionOfOrder(o);
    const cur = (o.currency ?? "INR").toUpperCase();
    for (const t of [region, "global"] as Scope[]) {
      const a = acc[t];
      a.tax += toReporting(num(o.tax), cur);
      if ((o.status ?? "").toLowerCase() === "cancelled" || o.cancelled_at) a.cancelled += 1;
      if (o.paid_at) {
        const h = (new Date(o.paid_at).getTime() - new Date(o.created_at).getTime()) / 3600_000;
        if (h >= 0 && h < 24 * 30) { a.payHoursSum += h; a.payHoursN += 1; }
      }
    }
  }

  // ---- Refunds
  for (const r of refunds) {
    const o = r.order_id ? orderById.get(r.order_id) : undefined;
    const region = regionOfOrder(o);
    const cur = (r.currency ?? o?.currency ?? "INR").toUpperCase();
    const amt = toReporting(num(r.amount), cur);
    const recent = new Date(r.created_at).getTime() >= midpoint;
    for (const t of [region, "global"] as Scope[]) {
      const a = acc[t];
      a.refundValue += amt; a.refundCount += 1;
      if (recent) a.currRef += amt; else a.prevRef += amt;
    }
    addSeries(day(r.created_at), region, 0, amt);
    const c = currencyAcc.get(cur);
    if (c) c.refunds += amt;
    const cc = normCountry(countryOf(o?.shipping_address ?? null));
    const row = cc ? countryAcc.get(cc.code) : undefined;
    if (row) row.refunds += amt;
    const gwKey = (o?.payment_provider ?? o?.payment_method ?? "unknown").toLowerCase();
    const g = gwAcc.get(`${region}:${gwKey}`);
    if (g) g.refunds += amt;
  }

  // ---- Vendors (revenue split is only reported when payouts/commissions exist)
  const vendorRows = (vendorRes.data ?? []) as unknown as { id: string; business_name: string | null; commission_rate: number | null }[];
  const payoutRows = (payoutRes.data ?? []) as unknown as { vendor_id: string; amount: number | null; currency: string | null; status: string | null }[];
  const commRows = (commRes.data ?? []) as unknown as { vendor_id: string; amount: number | null; currency: string | null; status: string | null }[];

  const vendors = {
    enabled: vendorRows.length > 0,
    rows: vendorRows.map((v) => {
      const payouts = payoutRows.filter((p) => p.vendor_id === v.id);
      const comms = commRows.filter((c) => c.vendor_id === v.id);
      const commission = comms.length
        ? comms.reduce((s, c) => s + toReporting(num(c.amount), c.currency), 0)
        : null;
      const pending = payouts
        .filter((p) => state(p.status) === "pending")
        .reduce((s, p) => s + toReporting(num(p.amount), p.currency), 0);
      const completed = payouts
        .filter((p) => state(p.status) === "ok")
        .reduce((s, p) => s + toReporting(num(p.amount), p.currency), 0);
      const combined = pending + completed;
      return {
        vendor_id: v.id,
        vendor: v.business_name ?? "Vendor",
        india: 0,
        international: 0,
        combined,
        commission,
        net_earnings: commission == null ? null : combined - commission,
        pending_payout: pending,
        completed_payout: completed,
      } satisfies VendorRevenueRow;
    }),
  };

  const totalCommission = commRows.length
    ? commRows.reduce((s, c) => s + toReporting(num(c.amount), c.currency), 0)
    : null;

  const scopes: Record<Scope, ScopeKpis> = {
    india: finish("india", acc.india, null, null),
    international: finish("international", acc.international, null, null),
    global: finish(
      "global",
      acc.global,
      totalCommission,
      totalCommission == null ? null : Math.max(0, acc.global.revenue - totalCommission),
    ),
  };

  const countries: CountryRow[] = [...countryAcc.entries()]
    .map(([code, r]) => ({
      code,
      country: r.name,
      scope: r.scope,
      revenue: r.revenue,
      orders: r.orders,
      growth: pct(r.curr, r.prev),
      refund_rate: r.revenue > 0 ? (r.refunds / r.revenue) * 100 : null,
      aov: r.orders ? r.revenue / r.orders : 0,
      success_rate: r.attempts ? (r.ok / r.attempts) * 100 : null,
      top_method: [...r.methods.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      currency: r.currency,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const currencies: CurrencyRow[] = [...currencyAcc.entries()]
    .map(([currency, c]) => ({
      currency,
      revenue_native: c.native,
      revenue_reporting: c.reporting,
      orders: c.orders,
      growth: pct(c.curr, c.prev),
      refund_rate: c.reporting > 0 ? (c.refunds / c.reporting) * 100 : null,
      aov: c.orders ? c.native / c.orders : 0,
    }))
    .sort((a, b) => b.revenue_reporting - a.revenue_reporting);

  const gwList = (scope: Exclude<Scope, "global">): GatewayRow[] =>
    [...gwAcc.entries()]
      .filter(([, g]) => g.scope === scope)
      .map(([key, g]) => ({
        key,
        label: g.label,
        revenue: g.revenue,
        orders: g.orders,
        success_rate: g.attempts ? (g.ok / g.attempts) * 100 : null,
        failure_rate: g.attempts ? (g.failed / g.attempts) * 100 : null,
        refund_rate: g.revenue > 0 ? (g.refunds / g.revenue) * 100 : null,
        avg_processing_hours: g.hoursN ? g.hoursSum / g.hoursN : null,
        growth: pct(g.curr, g.prev),
      }))
      .sort((a, b) => b.revenue - a.revenue);

  const taxes: TaxRow[] = [
    { key: "gst", label: "GST (India)", scope: "india", amount: acc.india.tax || null, note: "Recorded order tax on Indian orders" },
    { key: "intl_tax", label: "VAT / Sales tax (International)", scope: "international", amount: acc.international.tax || null, note: "Recorded order tax on cross-border orders" },
    { key: "customs", label: "Customs duties", scope: "global", amount: null, note: "No customs field recorded on orders" },
    { key: "import", label: "Import duties", scope: "global", amount: null, note: "No import-duty source connected" },
    { key: "other", label: "Other taxes", scope: "global", amount: null, note: "No additional tax source connected" },
  ];

  const settlements = {
    india: { scope: "india", available: false, note: "No settlement feed connected for Indian gateways." } as SettlementBlock,
    international: { scope: "international", available: false, note: "No settlement feed connected for international gateways." } as SettlementBlock,
  };

  // ---- Insights derived strictly from the aggregates above
  const insights: GlobalInsight[] = [];
  const gi = scopes.india, gx = scopes.international, gg = scopes.global;
  if (gi.growth.revenue != null && Math.abs(gi.growth.revenue) >= 5) {
    insights.push({
      id: "india-growth",
      tone: gi.growth.revenue > 0 ? "good" : "warn",
      title: `India revenue ${gi.growth.revenue > 0 ? "grew" : "declined"} ${Math.abs(gi.growth.revenue).toFixed(1)}%`,
      detail: `Compared with the previous ${Math.round(windowDays / 2)} days.`,
    });
  }
  if (gx.growth.revenue != null && Math.abs(gx.growth.revenue) >= 5) {
    insights.push({
      id: "intl-growth",
      tone: gx.growth.revenue > 0 ? "good" : "warn",
      title: `International revenue ${gx.growth.revenue > 0 ? "grew" : "declined"} ${Math.abs(gx.growth.revenue).toFixed(1)}%`,
      detail: `${gx.orders} cross-border payment(s) captured in this window.`,
    });
  }
  const bestAov = [...countries].filter((c) => c.orders >= 3).sort((a, b) => b.aov - a.aov)[0];
  if (bestAov) {
    insights.push({
      id: "aov-country",
      tone: "info",
      title: `${bestAov.country} has the highest average order value`,
      detail: `${bestAov.orders} order(s) at an average of ${Math.round(bestAov.aov)} ${REPORTING_CURRENCY}.`,
    });
  }
  const risky = [...countries].filter((c) => (c.refund_rate ?? 0) > 10 && c.orders >= 3)
    .sort((a, b) => (b.refund_rate ?? 0) - (a.refund_rate ?? 0))[0];
  if (risky) {
    insights.push({
      id: "refund-country",
      tone: "bad",
      title: `Refunds are elevated in ${risky.country}`,
      detail: `${(risky.refund_rate ?? 0).toFixed(1)}% of revenue refunded across ${risky.orders} order(s).`,
    });
  }
  const allGw = [...gwList("india"), ...gwList("international")].filter((g) => g.orders + (g.failure_rate ? 1 : 0) > 0);
  const worst = allGw.filter((g) => (g.failure_rate ?? 0) >= 15).sort((a, b) => (b.failure_rate ?? 0) - (a.failure_rate ?? 0))[0];
  if (worst) {
    insights.push({
      id: "gw-fail",
      tone: "bad",
      title: `${worst.label.toUpperCase()} success rate is low`,
      detail: `${(worst.failure_rate ?? 0).toFixed(1)}% of attempts failed on this route.`,
    });
  }
  const topCurrency = currencies[0];
  if (topCurrency && currencies.length > 1) {
    insights.push({
      id: "top-currency",
      tone: "info",
      title: `${topCurrency.currency} generates the most revenue`,
      detail: `${((topCurrency.revenue_reporting / (gg.revenue || 1)) * 100).toFixed(1)}% of global revenue in reporting currency.`,
    });
  }
  if (gg.revenue > 0 && gx.revenue === 0) {
    insights.push({
      id: "no-intl",
      tone: "info",
      title: "All revenue is currently domestic",
      detail: "International analytics will populate automatically once cross-border orders are paid.",
    });
  }

  const series = [...seriesMap.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    window_days: windowDays,
    generated_at: new Date().toISOString(),
    reporting_currency: REPORTING_CURRENCY,
    rates: REFERENCE_RATES,
    rates_note:
      "Combined totals are converted to INR using indicative reference rates. Native currency amounts are never summed together.",
    scopes,
    countries,
    currencies,
    gateways: { india: gwList("india"), international: gwList("international") },
    taxes,
    settlements,
    vendors,
    insights,
    series,
    region_split: [
      { k: "India", v: scopes.india.revenue, n: scopes.india.orders },
      { k: "International", v: scopes.international.revenue, n: scopes.international.orders },
    ].filter((r) => r.v > 0 || r.n > 0),
    has_any_data: payments.length > 0 || orders.length > 0,
  };
}
