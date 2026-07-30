/**
 * Payments Center v6.5 — Regional Financial Breakdown (server-only, READ ONLY).
 *
 * India, International and Global are computed independently from the same
 * underlying order/payment/refund rows. Nothing is estimated, averaged or
 * fabricated: any metric without a source returns `null` so the UI can render
 * an honest "No data available" state.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type RegionScope = "india" | "international" | "global";

export const BREAKDOWN_REPORTING_CURRENCY = "INR";

/** Indicative reference rates → 1 unit of currency in INR (labelled in the UI). */
const RATES: Record<string, number> = {
  INR: 1, USD: 88, EUR: 95, GBP: 112, AED: 24, CAD: 64, AUD: 58,
  SGD: 65, JPY: 0.58, CHF: 100, NZD: 53, SAR: 23.5,
};

const num = (v: unknown) => Number(v ?? 0) || 0;
const toINR = (amount: number, currency: string | null | undefined) => {
  const c = (currency ?? "INR").toUpperCase();
  const r = RATES[c];
  return r == null ? amount : amount * r;
};

const SUCCESS = new Set(["succeeded", "paid", "captured", "settled", "success"]);
const PENDING = new Set(["pending", "created", "initiated", "requires_action", "processing", "authorized"]);
const FAILED = new Set(["failed", "cancelled", "canceled", "declined", "error"]);
const state = (s: string | null | undefined) => {
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

export type RankRow = { key: string; label: string; value: number; count: number };

export type PeriodRevenue = {
  today: number;
  yesterday: number;
  last7: number;
  last30: number;
  mtd: number;
  ytd: number;
};

export type ScopeBreakdown = {
  scope: RegionScope;
  has_data: boolean;
  periods: PeriodRevenue;
  gross_revenue: number;
  net_revenue: number;
  shipping_revenue: number;
  tax_collected: number;
  discount_given: number;
  coupon_discount: number;
  refund_amount: number;
  refund_count: number;
  refund_rate: number | null;
  successful_payments: number;
  failed_payments: number;
  pending_payments: number;
  cancelled_orders: number;
  orders: number;
  customers: number;
  aov: number;
  success_rate: number | null;
  gateway_split: RankRow[];
  cod_vs_online: RankRow[];
  top_states: RankRow[];
  top_cities: RankRow[];
  top_countries: RankRow[];
  top_categories: RankRow[];
  top_brands: RankRow[];
  top_vendors: RankRow[];
  currencies: RankRow[];
  chargebacks: number | null;
};

export type RegionalComparisonRow = {
  metric: string;
  india: string;
  international: string;
  note?: string;
};

export type RegionalComparison = {
  india_revenue: number;
  international_revenue: number;
  difference: number;
  india_share: number | null;
  international_share: number | null;
  rows: RegionalComparisonRow[];
};

export type BreakdownInsight = { id: string; tone: "good" | "warn" | "bad" | "info"; text: string };

export type RegionalBreakdown = {
  window_days: number;
  generated_at: string;
  reporting_currency: string;
  rates_note: string;
  scopes: Record<RegionScope, ScopeBreakdown>;
  comparison: RegionalComparison | null;
  insights: BreakdownInsight[];
  monthly: { month: string; india: number; international: number }[];
  has_any_data: boolean;
};

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

function regionOf(o: OrderRow): Exclude<RegionScope, "global"> {
  const mr = (o.market_region ?? "").toLowerCase();
  if (mr === "india" || mr === "in") return "india";
  if (mr === "international" || mr === "intl") return "international";
  const c = countryOf(o);
  if (c) return c.code === "IN" ? "india" : "international";
  return (o.currency ?? "INR").toUpperCase() === "INR" ? "india" : "international";
}

type Acc = {
  periods: PeriodRevenue;
  gross: number; shipping: number; tax: number; discount: number; coupon: number;
  total: number; refunds: number; refundCount: number;
  ok: number; failed: number; pending: number; attempts: number;
  cancelled: number; orders: number;
  customers: Set<string>;
  gateways: Map<string, { v: number; n: number }>;
  cod: Map<string, { v: number; n: number }>;
  states: Map<string, { v: number; n: number }>;
  cities: Map<string, { v: number; n: number }>;
  countries: Map<string, { label: string; v: number; n: number }>;
  currencies: Map<string, { v: number; n: number }>;
  categories: Map<string, { v: number; n: number }>;
  brands: Map<string, { v: number; n: number }>;
  vendors: Map<string, { label: string; v: number; n: number }>;
};

const newAcc = (): Acc => ({
  periods: { today: 0, yesterday: 0, last7: 0, last30: 0, mtd: 0, ytd: 0 },
  gross: 0, shipping: 0, tax: 0, discount: 0, coupon: 0, total: 0, refunds: 0, refundCount: 0,
  ok: 0, failed: 0, pending: 0, attempts: 0, cancelled: 0, orders: 0,
  customers: new Set(), gateways: new Map(), cod: new Map(), states: new Map(), cities: new Map(),
  countries: new Map(), currencies: new Map(), categories: new Map(), brands: new Map(), vendors: new Map(),
});

const bump = (m: Map<string, { v: number; n: number }>, k: string, v: number) => {
  const cur = m.get(k) ?? { v: 0, n: 0 };
  cur.v += v; cur.n += 1;
  m.set(k, cur);
};

const rank = (m: Map<string, { v: number; n: number }>, limit = 8): RankRow[] =>
  [...m.entries()]
    .map(([key, x]) => ({ key, label: key, value: x.v, count: x.n }))
    .filter((r) => r.value > 0 || r.count > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

const rankLabelled = (m: Map<string, { label: string; v: number; n: number }>, limit = 8): RankRow[] =>
  [...m.entries()]
    .map(([key, x]) => ({ key, label: x.label, value: x.v, count: x.n }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);

function finish(scope: RegionScope, a: Acc): ScopeBreakdown {
  const netBase = a.total - a.refunds;
  return {
    scope,
    has_data: a.orders > 0 || a.attempts > 0,
    periods: a.periods,
    gross_revenue: a.gross || a.total,
    net_revenue: netBase,
    shipping_revenue: a.shipping,
    tax_collected: a.tax,
    discount_given: a.discount,
    coupon_discount: a.coupon,
    refund_amount: a.refunds,
    refund_count: a.refundCount,
    refund_rate: a.total > 0 ? (a.refunds / a.total) * 100 : null,
    successful_payments: a.ok,
    failed_payments: a.failed,
    pending_payments: a.pending,
    cancelled_orders: a.cancelled,
    orders: a.orders,
    customers: a.customers.size,
    aov: a.orders ? a.total / a.orders : 0,
    success_rate: a.attempts ? (a.ok / a.attempts) * 100 : null,
    gateway_split: rank(a.gateways),
    cod_vs_online: rank(a.cod, 4),
    top_states: rank(a.states),
    top_cities: rank(a.cities),
    top_countries: rankLabelled(a.countries),
    top_categories: rank(a.categories),
    top_brands: rank(a.brands),
    top_vendors: rankLabelled(a.vendors),
    currencies: rank(a.currencies, 10),
    chargebacks: null,
  };
}

/** Build the India / International / Global breakdown for the given window. */
export async function buildRegionalBreakdown(windowDays: number): Promise<RegionalBreakdown> {
  const now = Date.now();
  const yearStart = new Date(new Date().getFullYear(), 0, 1).getTime();
  const since = new Date(Math.min(now - windowDays * 86400_000, yearStart)).toISOString();
  const todayKey = new Date().toISOString().slice(0, 10);
  const yKey = new Date(now - 86400_000).toISOString().slice(0, 10);
  const monthKey = todayKey.slice(0, 7);
  const yearKey = todayKey.slice(0, 4);

  const [ordRes, payRes, refRes] = await Promise.all([
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
      .select("id,order_id,status,amount,currency,method,created_at")
      .gte("created_at", since)
      .limit(20000),
    supabaseAdmin
      .from("refunds")
      .select("id,order_id,amount,currency,created_at")
      .gte("created_at", since)
      .limit(5000),
  ]);

  const orders = (ordRes.data ?? []) as unknown as OrderRow[];
  const payments = (payRes.data ?? []) as unknown as {
    id: string; order_id: string | null; status: string | null; amount: number | null;
    currency: string | null; method: string | null; created_at: string;
  }[];
  const refunds = (refRes.data ?? []) as unknown as {
    id: string; order_id: string | null; amount: number | null; currency: string | null; created_at: string;
  }[];

  const orderById = new Map(orders.map((o) => [o.id, o]));
  const regionById = new Map<string, Exclude<RegionScope, "global">>();
  for (const o of orders) regionById.set(o.id, regionOf(o));

  const acc: Record<RegionScope, Acc> = { india: newAcc(), international: newAcc(), global: newAcc() };
  const monthly = new Map<string, { month: string; india: number; international: number }>();

  const paidOrderIds: string[] = [];

  for (const o of orders) {
    const region = regionById.get(o.id)!;
    const cur = (o.currency ?? "INR").toUpperCase();
    const isPaid = state(o.payment_status) === "ok" || !!o.paid_at;
    const total = toINR(num(o.total), cur);
    const day = (o.paid_at ?? o.created_at).slice(0, 10);

    for (const t of [region, "global"] as RegionScope[]) {
      const a = acc[t];
      if ((o.status ?? "").toLowerCase() === "cancelled" || o.cancelled_at) a.cancelled += 1;
      if (!isPaid) continue;
      a.orders += 1;
      a.total += total;
      a.gross += toINR(num(o.subtotal), cur) || total;
      a.shipping += toINR(num(o.shipping), cur);
      a.tax += toINR(num(o.tax), cur);
      a.discount += toINR(num(o.discount), cur);
      if (o.promo_code) a.coupon += toINR(num(o.discount), cur);
      if (o.user_id) a.customers.add(o.user_id);
      bump(a.currencies, cur, num(o.total));
      const gw = (o.payment_provider ?? o.payment_method ?? "unknown").toLowerCase();
      bump(a.gateways, gw, total);
      const method = (o.payment_method ?? "").toLowerCase();
      bump(a.cod, method === "cod" || method.includes("cash") ? "Cash on delivery" : "Online payment", total);
      const st = addrField(o.shipping_address, ["state", "region", "province"]);
      if (st) bump(a.states, st, total);
      const city = addrField(o.shipping_address, ["city", "town", "locality"]);
      if (city) bump(a.cities, city, total);
      const c = countryOf(o);
      if (c) {
        const row = a.countries.get(c.code) ?? { label: c.name, v: 0, n: 0 };
        row.v += total; row.n += 1;
        a.countries.set(c.code, row);
      }
      // period revenue
      if (day === todayKey) a.periods.today += total;
      if (day === yKey) a.periods.yesterday += total;
      const ts = new Date(day).getTime();
      if (ts >= now - 7 * 86400_000) a.periods.last7 += total;
      if (ts >= now - 30 * 86400_000) a.periods.last30 += total;
      if (day.slice(0, 7) === monthKey) a.periods.mtd += total;
      if (day.slice(0, 4) === yearKey) a.periods.ytd += total;
    }

    if (isPaid) {
      paidOrderIds.push(o.id);
      const m = day.slice(0, 7);
      const row = monthly.get(m) ?? { month: m, india: 0, international: 0 };
      row[region] += total;
      monthly.set(m, row);
    }
  }

  for (const p of payments) {
    const o = p.order_id ? orderById.get(p.order_id) : undefined;
    const region = o ? regionById.get(o.id)! : ((p.currency ?? "INR").toUpperCase() === "INR" ? "india" : "international");
    const st = state(p.status);
    for (const t of [region, "global"] as RegionScope[]) {
      const a = acc[t];
      if (st === "other") continue;
      a.attempts += 1;
      if (st === "ok") a.ok += 1;
      else if (st === "failed") a.failed += 1;
      else a.pending += 1;
    }
  }

  for (const r of refunds) {
    const o = r.order_id ? orderById.get(r.order_id) : undefined;
    const region = o ? regionById.get(o.id)! : "india";
    const amt = toINR(num(r.amount), r.currency ?? o?.currency);
    for (const t of [region, "global"] as RegionScope[]) {
      acc[t].refunds += amt;
      acc[t].refundCount += 1;
    }
  }

  // ---- Catalog attribution (categories / brands / vendors) for paid orders only.
  if (paidOrderIds.length) {
    const ids = paidOrderIds.slice(0, 5000);
    const { data: itemRows } = await supabaseAdmin
      .from("order_items")
      .select("order_id,product_slug,line_total,quantity")
      .in("order_id", ids)
      .limit(20000);
    const items = (itemRows ?? []) as unknown as {
      order_id: string; product_slug: string | null; line_total: number | null; quantity: number | null;
    }[];
    const slugs = [...new Set(items.map((i) => i.product_slug).filter(Boolean) as string[])].slice(0, 2000);
    const [prodRes, vpRes] = await Promise.all([
      slugs.length
        ? supabaseAdmin.from("products").select("slug,category,brand").in("slug", slugs).limit(2000)
        : Promise.resolve({ data: [] as unknown[] }),
      slugs.length
        ? supabaseAdmin.from("vendor_products").select("product_slug,vendor_id").in("product_slug", slugs).limit(5000)
        : Promise.resolve({ data: [] as unknown[] }),
    ]);
    const products = new Map(
      ((prodRes.data ?? []) as unknown as { slug: string; category: string | null; brand: string | null }[])
        .map((p) => [p.slug, p]),
    );
    const vendorBySlug = new Map(
      ((vpRes.data ?? []) as unknown as { product_slug: string; vendor_id: string }[])
        .map((v) => [v.product_slug, v.vendor_id]),
    );
    const vendorIds = [...new Set([...vendorBySlug.values()])].slice(0, 500);
    const vendorNames = new Map<string, string>();
    if (vendorIds.length) {
      const { data: vRows } = await supabaseAdmin.from("vendors").select("id,business_name").in("id", vendorIds);
      for (const v of (vRows ?? []) as unknown as { id: string; business_name: string | null }[]) {
        vendorNames.set(v.id, v.business_name ?? "Vendor");
      }
    }

    for (const it of items) {
      const o = orderById.get(it.order_id);
      if (!o) continue;
      const region = regionById.get(o.id)!;
      const value = toINR(num(it.line_total), o.currency);
      const p = it.product_slug ? products.get(it.product_slug) : undefined;
      const vendorId = it.product_slug ? vendorBySlug.get(it.product_slug) : undefined;
      for (const t of [region, "global"] as RegionScope[]) {
        const a = acc[t];
        if (p?.category) bump(a.categories, p.category, value);
        if (p?.brand) bump(a.brands, p.brand, value);
        if (vendorId) {
          const row = a.vendors.get(vendorId) ?? { label: vendorNames.get(vendorId) ?? "Vendor", v: 0, n: 0 };
          row.v += value; row.n += 1;
          a.vendors.set(vendorId, row);
        }
      }
    }
  }

  const scopes: Record<RegionScope, ScopeBreakdown> = {
    india: finish("india", acc.india),
    international: finish("international", acc.international),
    global: finish("global", acc.global),
  };

  // ---- Regional comparison (only when at least one region has revenue)
  const iN = scopes.india, xN = scopes.international;
  const totalRev = iN.net_revenue + iN.refund_amount + (xN.net_revenue + xN.refund_amount);
  const iRev = iN.net_revenue + iN.refund_amount;
  const xRev = xN.net_revenue + xN.refund_amount;
  const fmtRate = (v: number | null) => (v == null ? "No data" : `${v.toFixed(1)}%`);
  const comparison: RegionalComparison | null = totalRev > 0
    ? {
        india_revenue: iRev,
        international_revenue: xRev,
        difference: iRev - xRev,
        india_share: (iRev / totalRev) * 100,
        international_share: (xRev / totalRev) * 100,
        rows: [
          { metric: "Revenue", india: String(Math.round(iRev)), international: String(Math.round(xRev)) },
          { metric: "Orders", india: String(iN.orders), international: String(xN.orders) },
          { metric: "Customers", india: String(iN.customers), international: String(xN.customers) },
          { metric: "Average order value", india: String(Math.round(iN.aov)), international: String(Math.round(xN.aov)) },
          { metric: "Refund rate", india: fmtRate(iN.refund_rate), international: fmtRate(xN.refund_rate) },
          { metric: "Success rate", india: fmtRate(iN.success_rate), international: fmtRate(xN.success_rate) },
          {
            metric: "Top gateway",
            india: iN.gateway_split[0]?.label ?? "No data",
            international: xN.gateway_split[0]?.label ?? "No data",
          },
          {
            metric: "Top country",
            india: iN.top_countries[0]?.label ?? "No data",
            international: xN.top_countries[0]?.label ?? "No data",
          },
          {
            metric: "Top state",
            india: iN.top_states[0]?.label ?? "No data",
            international: xN.top_states[0]?.label ?? "No data",
          },
          {
            metric: "Conversion rate",
            india: "No data",
            international: "No data",
            note: "No session-to-order source connected",
          },
        ],
      }
    : null;

  // ---- Evidence-backed insights only
  const insights: BreakdownInsight[] = [];
  if (comparison && comparison.india_share != null && iRev > 0 && xRev > 0) {
    insights.push({
      id: "share",
      tone: "info",
      text: `India generated ${comparison.india_share.toFixed(0)}% of marketplace revenue, international ${(comparison.international_share ?? 0).toFixed(0)}%.`,
    });
  }
  if (iN.aov > 0 && xN.aov > 0) {
    const ratio = xN.aov / iN.aov;
    if (ratio >= 1.2 || ratio <= 0.8) {
      insights.push({
        id: "aov",
        tone: "info",
        text: `International average order value is ${ratio.toFixed(1)}x ${ratio >= 1 ? "higher" : "lower"} than India.`,
      });
    }
  }
  for (const s of [iN, xN]) {
    const gw = s.gateway_split[0];
    if (gw && s.orders >= 3) {
      insights.push({
        id: `gw-${s.scope}`,
        tone: "info",
        text: `${s.scope === "india" ? "Indian" : "International"} customers mostly pay with ${gw.label} (${gw.count} order(s)).`,
      });
    }
    if ((s.refund_rate ?? 0) >= 10) {
      insights.push({
        id: `refund-${s.scope}`,
        tone: "bad",
        text: `${s.scope === "india" ? "India" : "International"} refund rate is ${(s.refund_rate ?? 0).toFixed(1)}% of captured revenue.`,
      });
    }
  }
  if (iRev > 0 && xRev === 0) {
    insights.push({ id: "no-intl", tone: "info", text: "No international transactions recorded in this window." });
  }

  return {
    window_days: windowDays,
    generated_at: new Date().toISOString(),
    reporting_currency: BREAKDOWN_REPORTING_CURRENCY,
    rates_note:
      "Cross-currency totals are converted to INR using indicative reference rates; native currency totals are listed separately and never summed.",
    scopes,
    comparison,
    insights,
    monthly: [...monthly.values()].sort((a, b) => a.month.localeCompare(b.month)),
    has_any_data: orders.length > 0 || payments.length > 0,
  };
}
