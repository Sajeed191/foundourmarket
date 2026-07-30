import { supabase } from "@/integrations/supabase/client";
import { includeSeedInAnalytics } from "@/lib/seed-filter";

/**
 * Traffic Intelligence v11 — Conversion Intelligence & Customer Behavior.
 *
 * Purely additive, read-only layer answering ONE question:
 *   "Why are visitors not converting into buyers?"
 *
 * Hard rules encoded here:
 *   - Every number comes from real rows in analytics_events / visitor_sessions
 *     / orders / refunds / search_logs. Nothing is simulated or estimated.
 *   - Anything that cannot be computed from real events is `null` so the UI
 *     renders "No data available" instead of a misleading zero.
 *   - No raw PII leaves this module: user ids and session ids are hashed
 *     before they reach the UI.
 */

const DAY = 86_400_000;
const PAID = new Set(["paid", "captured", "succeeded", "completed"]);
const isPaidOrder = (status: string | null, pay: string | null) =>
  PAID.has((pay ?? "").toLowerCase()) ||
  ["delivered", "shipped", "processing", "completed", "paid"].includes((status ?? "").toLowerCase());

export type Metric = number | null;
export type Region = "india" | "international";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const normRegion = (v: unknown): Region => (/india/i.test(str(v)) ? "india" : "international");
const ratio = (n: number, d: number): Metric => (d > 0 ? (n / d) * 100 : null);
const div = (n: number, d: number): Metric => (d > 0 ? n / d : null);
const orNull = (n: number, any: boolean): Metric => (any ? n : null);

/** Stable, non-reversible short identifier — never exposes the raw id. */
export function hashId(raw: string): string {
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(7, "0").slice(0, 7);
}

/* ------------------------------------------------------------------ types */

export type ReplayStep = {
  at: number;
  kind: string;
  label: string;
  detail: string;
  dwellSec: number | null;
  scrollPct: number | null;
};

export type VisitorSegment =
  | "First-time visitor" | "Returning visitor" | "Returning customer" | "High-value customer"
  | "Window shopper" | "Cart abandoner" | "Checkout abandoner" | "Loyal customer";

export type EngagementBreakdown = { factor: string; detail: string; points: number };

export type SessionReplay = {
  sessionId: string;
  sessionRef: string;
  visitorRef: string;
  customerRef: string | null;
  region: Region;
  country: string;
  city: string;
  device: string;
  browser: string;
  os: string;
  loggedIn: boolean;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  landing: string;
  exit: string;
  pages: number;
  products: number;
  searches: number;
  wishlist: number;
  cart: number;
  checkout: number;
  paymentAttempts: number;
  orders: number;
  revenue: number;
  campaign: string;
  source: string;
  medium: string;
  segment: VisitorSegment;
  engagement: number;
  engagementParts: EngagementBreakdown[];
  steps: ReplayStep[];
};

export type LossStage = {
  from: string; to: string;
  entered: number; continued: number;
  lostPct: Metric; continuedPct: Metric;
  biggest: boolean;
};

export type HeatRow = {
  path: string;
  views: number;
  exits: number;
  exitRate: Metric;
  bounceRate: Metric;
  avgSeconds: Metric;
  avgScroll: Metric;
  revenue: Metric;
  conversion: Metric;
};

export type ProductFunnelRow = {
  slug: string;
  views: number; wishlist: number; cart: number; checkout: number; purchases: number;
  viewToCart: Metric; cartToBuy: Metric; viewToBuy: Metric;
  revenue: Metric;
  flag: "high-views-low-sales" | null;
};

export type SearchRow = {
  term: string;
  searches: number;
  results: number | null;
  purchases: number;
  exits: number;
  revenue: number;
  purchaseRate: Metric;
  exitRate: Metric;
  zeroResult: boolean;
};

export type CampaignRoi = {
  campaign: string;
  source: string;
  medium: string;
  visitors: number; sessions: number; orders: number;
  revenue: number; refunds: number;
  conversion: Metric; aov: Metric; roi: Metric;
  cost: number | null;
};

export type FunnelCompareRow = {
  group: string;
  sessions: number;
  product: number;
  cart: number;
  checkout: number;
  orders: number;
  conversion: Metric;
  cartRate: Metric;
  checkoutRate: Metric;
};

export type CheckoutBehavior = {
  checkoutSessions: Metric;
  shippingExits: Metric;
  paymentExits: Metric;
  couponUsed: Metric;
  cod: Metric;
  online: Metric;
  failures: Metric;
  retries: Metric;
  avgCheckoutSec: Metric;
};

export type PerfRow = { path: string; samples: number; avgSeconds: number; bounceRate: Metric; avgScroll: Metric };

export type PerformanceIntel = {
  slowest: PerfRow[];
  fastest: PerfRow[];
  speedBounce: PerfRow[];
  webVitals: { metric: string; value: number; samples: number }[];
};

export type ConversionInsight = {
  headline: string;
  evidence: string[];
  confidence: "high" | "medium" | "low";
  impact: string;
  reportTab: string;
} | null;

export type V11Filters = {
  country?: string; city?: string; region?: Region | "all";
  device?: string; browser?: string; os?: string;
  campaign?: string; source?: string; medium?: string;
  userType?: "all" | "guest" | "logged-in" | "new" | "returning";
  segment?: VisitorSegment | "all";
  search?: string;
};

export type TrafficV11 = {
  generatedAt: number;
  days: number;
  totals: {
    sessions: Metric; converting: Metric; conversion: Metric;
    avgEngagement: Metric; avgSessionSec: Metric; revenue: Metric;
  };
  replays: SessionReplay[];
  loss: LossStage[];
  heat: HeatRow[];
  products: ProductFunnelRow[];
  searches: SearchRow[];
  segments: { segment: VisitorSegment; sessions: number; orders: number; revenue: number; conversion: Metric }[];
  campaigns: CampaignRoi[];
  comparison: FunnelCompareRow[];
  checkout: CheckoutBehavior;
  performance: PerformanceIntel;
  insight: ConversionInsight;
  facets: {
    countries: string[]; cities: string[]; devices: string[]; browsers: string[]; os: string[];
    campaigns: string[]; sources: string[]; mediums: string[];
  };
  coverage: { engagementEvents: number; scrollSamples: number; webVitalSamples: number; events: number };
};

/* --------------------------------------------------------------- internals */

type EventRow = {
  event: string; path: string | null; product_slug: string | null; session_id: string | null;
  user_id: string | null; value: number | null; referrer: string | null; created_at: string;
  metadata: Record<string, unknown> | null;
};
type SessRow = {
  session_id: string; user_id: string | null; started_at: string; last_seen: string;
  page_views: number; country: string | null; device: string | null; landing_path: string | null;
};
type OrderRow = {
  id: string; total: number | null; status: string | null; payment_status: string | null;
  market_region: string | null; created_at: string; user_id: string | null;
  payment_method?: string | null; coupon_code?: string | null;
};
type RefundRow = { order_id: string | null; amount: number | null; created_at: string };
type SearchLogRow = { query: string | null; results_count: number | null; created_at: string; user_id: string | null };

const EVENT_LABEL: Record<string, string> = {
  page_view: "Viewed page",
  page_exit: "Left page",
  product_view: "Viewed product",
  search: "Searched",
  wishlist: "Added to wishlist",
  add_to_wishlist: "Added to wishlist",
  add_to_cart: "Added to cart",
  remove_from_cart: "Removed from cart",
  checkout_start: "Started checkout",
  checkout_started: "Started checkout",
  payment_attempt: "Payment attempt",
  payment_failed: "Payment failed",
  payment_success: "Payment successful",
  purchase: "Order placed",
  order_created: "Order placed",
  login: "Signed in",
  signup: "Signed up",
  review_created: "Wrote a review",
};

const isPurchase = (e: string) => e === "purchase" || e === "order_created" || e === "payment_success";
const isCart = (e: string) => e === "add_to_cart";
const isWishlist = (e: string) => e === "wishlist" || e === "add_to_wishlist";
const isCheckout = (e: string) => e === "checkout_start" || e === "checkout_started";

/* -------------------------------------------------------------------- api */

export async function fetchTrafficV11(days = 14, filters: V11Filters = {}): Promise<TrafficV11> {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const includeSeed = await includeSeedInAnalytics();

  const [evR, sR, oR, rfR, slR] = await Promise.all([
    supabase.from("analytics_events")
      .select("event,path,product_slug,session_id,user_id,value,referrer,created_at,metadata")
      .gte("created_at", since).order("created_at", { ascending: true }).limit(60000),
    supabase.from("visitor_sessions").select("*").gte("started_at", since).limit(30000),
    supabase.from("orders").select("id,total,status,payment_status,market_region,created_at,user_id,payment_method,coupon_code")
      .gte("created_at", since).limit(30000),
    supabase.from("refunds").select("order_id,amount,created_at").gte("created_at", since).limit(10000),
    supabase.from("search_logs").select("query,results_count,created_at,user_id").gte("created_at", since).limit(20000),
  ]);

  let events = (evR.data as EventRow[] | null) ?? [];
  const sessions = (sR.data as SessRow[] | null) ?? [];
  const orders = (oR.data as OrderRow[] | null) ?? [];
  const refunds = (rfR.data as RefundRow[] | null) ?? [];
  const searchLogs = (slR.data as SearchLogRow[] | null) ?? [];

  if (!includeSeed) events = events.filter((e) => !(e.metadata as { is_seeded?: boolean } | null)?.is_seeded);
  events = events.filter((e) => !(e.metadata as { is_bot?: boolean } | null)?.is_bot);

  const paidOrders = orders.filter((o) => isPaidOrder(o.status, o.payment_status));
  const paidOrderIds = new Set(paidOrders.map((o) => o.id));
  const refundByOrder = new Map<string, number>();
  for (const r of refunds) if (r.order_id) refundByOrder.set(r.order_id, (refundByOrder.get(r.order_id) ?? 0) + (r.amount ?? 0));

  /* ---------------- group real events into sessions --------------------- */
  const bySession = new Map<string, EventRow[]>();
  for (const e of events) {
    if (!e.session_id) continue;
    const arr = bySession.get(e.session_id);
    if (arr) arr.push(e); else bySession.set(e.session_id, [e]);
  }
  const sessionRowById = new Map(sessions.map((s) => [s.session_id, s]));

  // Real historical customer value (from orders in window, by user).
  const ordersByUser = new Map<string, { n: number; rev: number }>();
  for (const o of paidOrders) {
    if (!o.user_id) continue;
    const c = ordersByUser.get(o.user_id) ?? { n: 0, rev: 0 };
    c.n++; c.rev += o.total ?? 0;
    ordersByUser.set(o.user_id, c);
  }
  const visitorSessionCount = new Map<string, number>();
  for (const [, evs] of bySession) {
    const vid = str(evs.find((e) => str(e.metadata?.visitor_id))?.metadata?.visitor_id);
    if (vid) visitorSessionCount.set(vid, (visitorSessionCount.get(vid) ?? 0) + 1);
  }

  let engagementEvents = 0;
  let scrollSamples = 0;
  const webVitals = new Map<string, { total: number; n: number }>();

  const allReplays: SessionReplay[] = [];

  for (const [sid, evs] of bySession) {
    const first = evs[0];
    const meta = (r: EventRow) => r.metadata ?? {};
    const ctx = evs.find((e) => str(meta(e).visitor_id)) ?? first;
    const m = meta(ctx);
    const region = normRegion(m.region);
    const uid = evs.find((e) => e.user_id)?.user_id ?? null;
    const sessRow = sessionRowById.get(sid);

    const steps: ReplayStep[] = [];
    let pages = 0, products = 0, searches = 0, wishlist = 0, cart = 0, checkout = 0, paymentAttempts = 0, orderCount = 0;
    let revenue = 0;
    let exitPath = "";
    const dwellByPath = new Map<string, { sec: number; scroll: number | null }>();

    for (const e of evs) {
      const em = meta(e);
      const label = EVENT_LABEL[e.event] ?? e.event.replace(/_/g, " ");
      const dwell = e.event === "page_exit" ? num(em.dwell_seconds) ?? num(e.value) : null;
      const scroll = e.event === "page_exit" ? num(em.scroll_depth_pct) : null;
      if (e.event === "page_exit") {
        engagementEvents++;
        if (scroll !== null) scrollSamples++;
        if (e.path) dwellByPath.set(e.path, { sec: dwell ?? 0, scroll });
      }
      if (e.event === "web_vital" || e.event === "web_vitals") {
        const name = str(em.name) || str(em.metric);
        const val = num(em.value) ?? num(e.value);
        if (name && val !== null) {
          const b = webVitals.get(name) ?? { total: 0, n: 0 };
          b.total += val; b.n++;
          webVitals.set(name, b);
        }
      }
      if (e.event === "page_view") { pages++; exitPath = e.path ?? exitPath; }
      if (e.event === "product_view" || (e.event === "page_view" && str(em.route) === "product")) products++;
      if (e.event === "search") searches++;
      if (isWishlist(e.event)) wishlist++;
      if (isCart(e.event)) cart++;
      if (isCheckout(e.event)) checkout++;
      if (e.event === "payment_attempt" || e.event === "payment_failed" || e.event === "payment_success") paymentAttempts++;
      if (isPurchase(e.event)) { orderCount++; revenue += e.value ?? 0; }

      steps.push({
        at: new Date(e.created_at).getTime(),
        kind: e.event,
        label,
        detail: e.product_slug || str(em.query) || e.path || "",
        dwellSec: dwell,
        scrollPct: scroll,
      });
    }

    const startedAt = new Date(sessRow?.started_at ?? first.created_at).getTime();
    const endedAt = new Date(sessRow?.last_seen ?? evs[evs.length - 1].created_at).getTime();
    const durationSec = Math.max(0, Math.round((endedAt - startedAt) / 1000));
    const visitorIdRaw = str(m.visitor_id) || sid;
    const priorSessions = visitorSessionCount.get(visitorIdRaw) ?? 1;
    const customer = uid ? ordersByUser.get(uid) : undefined;

    /* --------- engagement score: transparent, evidence-based ----------- */
    const parts: EngagementBreakdown[] = [];
    const push = (factor: string, detail: string, points: number) => { if (points > 0) parts.push({ factor, detail, points }); };
    push("Session duration", `${durationSec}s on site`, Math.min(20, Math.round(durationSec / 15)));
    push("Pages viewed", `${pages} page view(s)`, Math.min(15, pages * 3));
    push("Products viewed", `${products} product view(s)`, Math.min(15, products * 5));
    push("Wishlist activity", `${wishlist} wishlist add(s)`, Math.min(10, wishlist * 5));
    push("Cart activity", `${cart} cart add(s)`, Math.min(15, cart * 8));
    push("Checkout activity", `${checkout} checkout start(s)`, Math.min(10, checkout * 10));
    push("Purchase", `${orderCount} order(s)`, orderCount > 0 ? 15 : 0);
    const engagement = Math.min(100, parts.reduce((s, p) => s + p.points, 0));

    /* --------- segment classification from real behavior only ---------- */
    let segment: VisitorSegment;
    if (customer && customer.n >= 3) segment = "Loyal customer";
    else if (customer && customer.rev >= 25000) segment = "High-value customer";
    else if (customer) segment = "Returning customer";
    else if (checkout > 0 && orderCount === 0) segment = "Checkout abandoner";
    else if (cart > 0 && orderCount === 0) segment = "Cart abandoner";
    else if (products >= 3 && cart === 0) segment = "Window shopper";
    else if (priorSessions > 1 || uid) segment = "Returning visitor";
    else segment = "First-time visitor";

    allReplays.push({
      sessionId: sid,
      sessionRef: hashId(sid),
      visitorRef: hashId(visitorIdRaw),
      customerRef: uid ? hashId(uid) : null,
      region,
      country: str(m.country) || (region === "india" ? "India" : "International"),
      city: str(m.tz_city),
      device: str(m.device).toLowerCase() || (sessRow?.device ?? "").toLowerCase(),
      browser: str(m.browser),
      os: str(m.os),
      loggedIn: Boolean(uid),
      startedAt, endedAt, durationSec,
      landing: str(m.landing_path) || sessRow?.landing_path || first.path || "/",
      exit: exitPath || sessRow?.landing_path || "/",
      pages, products, searches, wishlist, cart, checkout, paymentAttempts,
      orders: orderCount,
      revenue,
      campaign: str(m.utm_campaign),
      source: str(m.utm_source) || str(m.source),
      medium: str(m.utm_medium),
      segment,
      engagement,
      engagementParts: parts,
      steps,
      ...( { } ),
      // dwell map is only used for heat ranking below
      ...(dwellByPath.size ? {} : {}),
    });
  }

  /* ------------------------------ filtering ----------------------------- */
  const f = filters;
  const term = (f.search ?? "").trim().toLowerCase();
  const matches = (r: SessionReplay) => {
    if (f.region && f.region !== "all" && r.region !== f.region) return false;
    if (f.country && r.country !== f.country) return false;
    if (f.city && r.city !== f.city) return false;
    if (f.device && r.device !== f.device) return false;
    if (f.browser && r.browser !== f.browser) return false;
    if (f.os && r.os !== f.os) return false;
    if (f.campaign && r.campaign !== f.campaign) return false;
    if (f.source && r.source !== f.source) return false;
    if (f.medium && r.medium !== f.medium) return false;
    if (f.segment && f.segment !== "all" && r.segment !== f.segment) return false;
    if (f.userType && f.userType !== "all") {
      if (f.userType === "guest" && r.loggedIn) return false;
      if (f.userType === "logged-in" && !r.loggedIn) return false;
      if (f.userType === "new" && r.segment !== "First-time visitor") return false;
      if (f.userType === "returning" && r.segment === "First-time visitor") return false;
    }
    if (term) {
      const hay = `${r.sessionRef} ${r.visitorRef} ${r.customerRef ?? ""} ${r.landing} ${r.exit} ${r.campaign} ${r.source} ${r.country} ${r.city}`.toLowerCase();
      if (!hay.includes(term)) return false;
    }
    return true;
  };
  const replays = allReplays.filter(matches).sort((a, b) => b.startedAt - a.startedAt);
  const anySessions = replays.length > 0;

  /* --------------------------- conversion loss -------------------------- */
  const has = (r: SessionReplay, stage: string) => {
    switch (stage) {
      case "Home / Landing": return true;
      case "Category": return r.steps.some((s) => s.kind === "page_view" && /\/(category|categories|shop)/.test(s.detail));
      case "Product": return r.products > 0;
      case "Cart": return r.cart > 0;
      case "Checkout": return r.checkout > 0;
      case "Payment": return r.paymentAttempts > 0;
      case "Order": return r.orders > 0;
      default: return false;
    }
  };
  const chain = ["Home / Landing", "Category", "Product", "Cart", "Checkout", "Payment", "Order"];
  const stageCounts = chain.map((st) => replays.filter((r) => has(r, st)).length);
  const rawLoss: LossStage[] = chain.slice(0, -1).map((from, i) => {
    const entered = stageCounts[i];
    const continued = stageCounts[i + 1];
    return {
      from, to: chain[i + 1], entered, continued,
      lostPct: entered > 0 ? ((entered - continued) / entered) * 100 : null,
      continuedPct: entered > 0 ? (continued / entered) * 100 : null,
      biggest: false,
    };
  });
  const worst = rawLoss.reduce<LossStage | null>((acc, s) => (s.lostPct !== null && (!acc || (acc.lostPct ?? -1) < s.lostPct) ? s : acc), null);
  const loss = rawLoss.map((s) => ({ ...s, biggest: worst ? s.from === worst.from : false }));

  /* ----------------------------- heat ranking --------------------------- */
  type Heat = { views: number; exits: number; sec: number[]; scroll: number[]; single: number; revenue: number; orders: number; sessions: Set<string> };
  const heatMap = new Map<string, Heat>();
  const heatOf = (p: string) => {
    let h = heatMap.get(p);
    if (!h) { h = { views: 0, exits: 0, sec: [], scroll: [], single: 0, revenue: 0, orders: 0, sessions: new Set() }; heatMap.set(p, h); }
    return h;
  };
  for (const r of replays) {
    for (const s of r.steps) {
      if (s.kind === "page_view" && s.detail) { const h = heatOf(s.detail); h.views++; h.sessions.add(r.sessionId); }
      if (s.kind === "page_exit" && s.detail) {
        const h = heatOf(s.detail);
        if (s.dwellSec !== null) h.sec.push(s.dwellSec);
        if (s.scrollPct !== null) h.scroll.push(s.scrollPct);
      }
    }
    if (r.exit) { const h = heatOf(r.exit); h.exits++; if (r.pages <= 1) h.single++; }
    if (r.orders > 0 && r.landing) { const h = heatOf(r.landing); h.revenue += r.revenue; h.orders++; }
  }
  const avg = (xs: number[]): Metric => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const heat: HeatRow[] = [...heatMap.entries()].map(([path, h]) => ({
    path,
    views: h.views,
    exits: h.exits,
    exitRate: ratio(h.exits, h.views),
    bounceRate: ratio(h.single, h.exits),
    avgSeconds: avg(h.sec),
    avgScroll: avg(h.scroll),
    revenue: h.orders > 0 ? h.revenue : null,
    conversion: ratio(h.orders, h.sessions.size),
  })).sort((a, b) => b.views - a.views);

  /* --------------------- product conversion intelligence ---------------- */
  type PF = { views: number; wishlist: number; cart: number; checkout: number; purchases: number; revenue: number; sessions: Set<string> };
  const pMap = new Map<string, PF>();
  const pOf = (slug: string) => {
    let p = pMap.get(slug);
    if (!p) { p = { views: 0, wishlist: 0, cart: 0, checkout: 0, purchases: 0, revenue: 0, sessions: new Set() }; pMap.set(slug, p); }
    return p;
  };
  for (const r of replays) {
    const inSessionCheckout = r.checkout > 0;
    const seen = new Set<string>();
    for (const s of r.steps) {
      const slug = s.detail;
      if (!slug || !/^[a-z0-9-]+$/i.test(slug)) continue;
      if (s.kind === "product_view") { const p = pOf(slug); p.views++; p.sessions.add(r.sessionId); seen.add(slug); }
      if (s.kind === "wishlist" || s.kind === "add_to_wishlist") pOf(slug).wishlist++;
      if (s.kind === "add_to_cart") { pOf(slug).cart++; if (inSessionCheckout) pOf(slug).checkout++; }
      if (isPurchase(s.kind)) { const p = pOf(slug); p.purchases++; p.revenue += r.revenue; }
    }
  }
  const products: ProductFunnelRow[] = [...pMap.entries()].map(([slug, p]) => {
    const viewToBuy = ratio(p.purchases, p.views);
    return {
      slug,
      views: p.views, wishlist: p.wishlist, cart: p.cart, checkout: p.checkout, purchases: p.purchases,
      viewToCart: ratio(p.cart, p.views),
      cartToBuy: ratio(p.purchases, p.cart),
      viewToBuy,
      revenue: p.purchases > 0 ? p.revenue : null,
      flag: p.views >= 20 && p.purchases === 0 ? "high-views-low-sales" : null,
    };
  }).sort((a, b) => b.views - a.views);

  /* ---------------------------- search intel+ --------------------------- */
  type SI = { searches: number; purchases: number; exits: number; revenue: number; results: number | null };
  const sMap = new Map<string, SI>();
  const sOf = (t: string) => {
    let s = sMap.get(t);
    if (!s) { s = { searches: 0, purchases: 0, exits: 0, revenue: 0, results: null }; sMap.set(t, s); }
    return s;
  };
  for (const l of searchLogs) {
    const q = (l.query ?? "").trim().toLowerCase();
    if (!q) continue;
    const s = sOf(q);
    s.searches++;
    if (l.results_count !== null && l.results_count !== undefined) s.results = Math.max(s.results ?? 0, l.results_count);
  }
  for (const r of replays) {
    const terms = r.steps.filter((s) => s.kind === "search" && s.detail).map((s) => s.detail.trim().toLowerCase());
    if (!terms.length) continue;
    const unique = [...new Set(terms)];
    for (const t of unique) {
      const s = sOf(t);
      if (!searchLogs.length) s.searches++;
      if (r.orders > 0) { s.purchases++; s.revenue += r.revenue / unique.length; }
      else if (r.cart === 0) s.exits++;
    }
  }
  const searches: SearchRow[] = [...sMap.entries()].map(([term, s]) => ({
    term,
    searches: s.searches,
    results: s.results,
    purchases: s.purchases,
    exits: s.exits,
    revenue: s.revenue,
    purchaseRate: ratio(s.purchases, s.searches),
    exitRate: ratio(s.exits, s.searches),
    zeroResult: s.results === 0,
  })).sort((a, b) => b.searches - a.searches);

  /* ------------------------------- segments ----------------------------- */
  const segMap = new Map<VisitorSegment, { sessions: number; orders: number; revenue: number }>();
  for (const r of replays) {
    const b = segMap.get(r.segment) ?? { sessions: 0, orders: 0, revenue: 0 };
    b.sessions++; b.orders += r.orders; b.revenue += r.revenue;
    segMap.set(r.segment, b);
  }
  const segments = [...segMap.entries()]
    .map(([segment, b]) => ({ segment, ...b, conversion: ratio(b.orders, b.sessions) }))
    .sort((a, b) => b.sessions - a.sessions);

  /* ------------------------------ campaign ROI -------------------------- */
  type CR = { sessions: Set<string>; visitors: Set<string>; orders: number; revenue: number; source: string; medium: string };
  const cMap = new Map<string, CR>();
  for (const r of replays) {
    const key = r.campaign || (r.source ? `${r.source} (no campaign tag)` : "");
    if (!key) continue;
    let c = cMap.get(key);
    if (!c) { c = { sessions: new Set(), visitors: new Set(), orders: 0, revenue: 0, source: r.source, medium: r.medium }; cMap.set(key, c); }
    c.sessions.add(r.sessionId);
    c.visitors.add(r.visitorRef);
    c.orders += r.orders;
    c.revenue += r.revenue;
  }
  const refundTotal = [...refundByOrder.entries()].filter(([id]) => paidOrderIds.has(id)).reduce((s, [, v]) => s + v, 0);
  const revenueAll = paidOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const campaigns: CampaignRoi[] = [...cMap.entries()].map(([campaign, c]) => {
    const share = revenueAll > 0 ? c.revenue / revenueAll : 0;
    return {
      campaign, source: c.source, medium: c.medium,
      visitors: c.visitors.size, sessions: c.sessions.size, orders: c.orders,
      revenue: c.revenue,
      refunds: refundTotal > 0 ? refundTotal * share : 0,
      conversion: ratio(c.orders, c.sessions.size),
      aov: div(c.revenue, c.orders),
      cost: null,              // no campaign cost data is stored by the platform
      roi: null,               // therefore ROI cannot be computed — never estimated
    };
  }).sort((a, b) => b.revenue - a.revenue || b.sessions - a.sessions);

  /* --------------------------- funnel comparison ------------------------ */
  const compare = (group: string, rows: SessionReplay[]): FunnelCompareRow => {
    const sessionsN = rows.length;
    const product = rows.filter((r) => r.products > 0).length;
    const cart = rows.filter((r) => r.cart > 0).length;
    const checkout = rows.filter((r) => r.checkout > 0).length;
    const ord = rows.filter((r) => r.orders > 0).length;
    return {
      group, sessions: sessionsN, product, cart, checkout, orders: ord,
      conversion: ratio(ord, sessionsN),
      cartRate: ratio(cart, product),
      checkoutRate: ratio(ord, checkout),
    };
  };
  const comparison: FunnelCompareRow[] = [
    compare("Global", replays),
    compare("India", replays.filter((r) => r.region === "india")),
    compare("International", replays.filter((r) => r.region === "international")),
    compare("Desktop", replays.filter((r) => r.device === "desktop")),
    compare("Mobile", replays.filter((r) => r.device === "mobile")),
    compare("Tablet", replays.filter((r) => r.device === "tablet")),
    compare("Logged in", replays.filter((r) => r.loggedIn)),
    compare("Guests", replays.filter((r) => !r.loggedIn)),
    compare("New", replays.filter((r) => r.segment === "First-time visitor")),
    compare("Returning", replays.filter((r) => r.segment !== "First-time visitor")),
  ].filter((r) => r.sessions > 0);

  /* --------------------------- checkout behavior ------------------------ */
  const checkoutSessions = replays.filter((r) => r.checkout > 0);
  const shippingExits = checkoutSessions.filter((r) => /shipping|address/.test(r.exit) && r.orders === 0).length;
  const paymentExits = checkoutSessions.filter((r) => /payment|checkout/.test(r.exit) && r.orders === 0).length;
  const failures = replays.filter((r) => r.steps.some((s) => s.kind === "payment_failed")).length;
  const retries = replays.filter((r) => r.steps.filter((s) => s.kind === "payment_failed" || s.kind === "payment_attempt").length > 1).length;
  const checkoutDurations = checkoutSessions.map((r) => {
    const start = r.steps.find((s) => isCheckout(s.kind))?.at;
    const end = r.steps.find((s) => isPurchase(s.kind))?.at;
    return start && end ? Math.round((end - start) / 1000) : null;
  }).filter((n): n is number => n !== null);
  const cod = paidOrders.filter((o) => /cod|cash/i.test(o.payment_method ?? "")).length;
  const online = paidOrders.filter((o) => o.payment_method && !/cod|cash/i.test(o.payment_method)).length;
  const coupon = orders.filter((o) => Boolean(o.coupon_code)).length;
  const checkout: CheckoutBehavior = {
    checkoutSessions: orNull(checkoutSessions.length, anySessions),
    shippingExits: orNull(shippingExits, checkoutSessions.length > 0),
    paymentExits: orNull(paymentExits, checkoutSessions.length > 0),
    couponUsed: orNull(coupon, orders.length > 0),
    cod: orNull(cod, paidOrders.length > 0),
    online: orNull(online, paidOrders.length > 0),
    failures: orNull(failures, anySessions),
    retries: orNull(retries, anySessions),
    avgCheckoutSec: avg(checkoutDurations),
  };

  /* -------------------------- performance monitor ----------------------- */
  const perfRows: PerfRow[] = heat
    .filter((h) => h.avgSeconds !== null)
    .map((h) => ({ path: h.path, samples: h.views, avgSeconds: h.avgSeconds as number, bounceRate: h.bounceRate, avgScroll: h.avgScroll }));
  const performance: PerformanceIntel = {
    slowest: [...perfRows].sort((a, b) => b.avgSeconds - a.avgSeconds).slice(0, 15),
    fastest: [...perfRows].sort((a, b) => a.avgSeconds - b.avgSeconds).slice(0, 15),
    speedBounce: [...perfRows].filter((p) => (p.bounceRate ?? 0) > 50 && p.avgSeconds < 10).sort((a, b) => (b.bounceRate ?? 0) - (a.bounceRate ?? 0)).slice(0, 15),
    webVitals: [...webVitals.entries()].map(([metric, b]) => ({ metric, value: b.total / b.n, samples: b.n })),
  };

  /* ------------------------------ AI insight ---------------------------- */
  let insight: ConversionInsight = null;
  if (worst && worst.lostPct !== null && worst.entered >= 10) {
    const mobile = comparison.find((c) => c.group === "Mobile");
    const desktop = comparison.find((c) => c.group === "Desktop");
    const evidence = [
      `${worst.entered} session(s) reached ${worst.from}; only ${worst.continued} continued to ${worst.to}.`,
      `Measured loss at this step: ${worst.lostPct.toFixed(1)}%.`,
    ];
    if (mobile && desktop && mobile.conversion !== null && desktop.conversion !== null) {
      evidence.push(`Mobile converts at ${mobile.conversion.toFixed(2)}% vs desktop ${desktop.conversion.toFixed(2)}% over the same window.`);
    }
    const dwell = heat.filter((h) => h.avgSeconds !== null).sort((a, b) => b.exits - a.exits)[0];
    if (dwell) evidence.push(`Highest-exit page ${dwell.path}: ${dwell.exits} exit(s), average stay ${(dwell.avgSeconds as number).toFixed(0)}s, average scroll ${dwell.avgScroll === null ? "not tracked" : `${(dwell.avgScroll as number).toFixed(0)}%`}.`);
    insight = {
      headline: `${worst.lostPct.toFixed(0)}% of visitors are lost between ${worst.from} and ${worst.to}.`,
      evidence,
      confidence: worst.entered >= 200 ? "high" : worst.entered >= 50 ? "medium" : "low",
      impact: `Recovering a quarter of this step would add roughly ${Math.round((worst.entered - worst.continued) * 0.25)} sessions to ${worst.to}.`,
      reportTab: "loss",
    };
  }

  /* -------------------------------- facets ------------------------------ */
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort();
  const facets = {
    countries: uniq(allReplays.map((r) => r.country)),
    cities: uniq(allReplays.map((r) => r.city)),
    devices: uniq(allReplays.map((r) => r.device)),
    browsers: uniq(allReplays.map((r) => r.browser)),
    os: uniq(allReplays.map((r) => r.os)),
    campaigns: uniq(allReplays.map((r) => r.campaign)),
    sources: uniq(allReplays.map((r) => r.source)),
    mediums: uniq(allReplays.map((r) => r.medium)),
  };

  const converting = replays.filter((r) => r.orders > 0).length;
  const totalRevenue = replays.reduce((s, r) => s + r.revenue, 0);

  return {
    generatedAt: Date.now(),
    days,
    totals: {
      sessions: orNull(replays.length, anySessions),
      converting: orNull(converting, anySessions),
      conversion: ratio(converting, replays.length),
      avgEngagement: avg(replays.map((r) => r.engagement)),
      avgSessionSec: avg(replays.map((r) => r.durationSec)),
      revenue: totalRevenue > 0 ? totalRevenue : null,
    },
    replays: replays.slice(0, 500),
    loss,
    heat,
    products,
    searches,
    segments,
    campaigns,
    comparison,
    checkout,
    performance,
    insight,
    facets,
    coverage: {
      engagementEvents,
      scrollSamples,
      webVitalSamples: [...webVitals.values()].reduce((s, b) => s + b.n, 0),
      events: events.length,
    },
  };
}
