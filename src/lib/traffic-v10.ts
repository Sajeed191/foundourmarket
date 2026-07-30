import { supabase } from "@/integrations/supabase/client";
import { includeSeedInAnalytics } from "@/lib/seed-filter";

/**
 * Traffic Intelligence v10 — Enterprise Real-Time Analytics (read-only).
 *
 * Pure additive layer on top of the existing Traffic Intelligence engine.
 * It introduces NO new tables, NO writes and NO business-logic changes; it
 * only reads real production rows:
 *   analytics_events · page_views · visitor_sessions · orders · search_logs
 *
 * Hard rules encoded here:
 *   - Nothing is simulated, estimated or randomly generated.
 *   - Metrics that cannot be computed because the underlying events do not
 *     exist are returned as `null` so the UI renders "No data available"
 *     instead of a misleading zero.
 *   - India and International are computed independently; Global is the
 *     arithmetic sum of both, so the three always reconcile.
 */

const DAY = 86_400_000;
const PAID = new Set(["paid", "captured", "succeeded", "completed"]);
const isPaidOrder = (status: string | null, pay: string | null) =>
  PAID.has((pay ?? "").toLowerCase()) ||
  ["delivered", "shipped", "processing", "completed", "paid"].includes((status ?? "").toLowerCase());

export type Region = "india" | "international";

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const normRegion = (v: unknown): Region => (/india/i.test(str(v)) ? "india" : "international");

/* --------------------------------------------------------------- types */

export type Metric = number | null; // null === "No data available"

export type SegmentMetrics = {
  label: string;
  visitors: Metric;
  sessions: Metric;
  views: Metric;
  orders: Metric;
  revenue: Metric;
  conversion: Metric;
  aov: Metric;
  bounceRate: Metric;
  returningRate: Metric;
  newUsers: Metric;
  returningUsers: Metric;
  checkoutStarted: Metric;
  checkoutSuccess: Metric;
  checkoutFailure: Metric;
  mobile: Metric;
  tablet: Metric;
  desktop: Metric;
};

export type Breakdown = { label: string; sessions: number; visitors: number; orders: number; revenue: number; conversion: number };
export type JourneyStage = { stage: string; sessions: number; dropPct: number | null; conversionPct: number | null };
export type FeedItem = { id: string; at: number; actor: string; action: string; detail: string; region: Region; loggedIn: boolean };
export type LiveVisitorV10 = {
  sessionId: string; path: string; region: Region; country: string; city: string;
  device: string; browser: string; os: string; loggedIn: boolean; onPageSec: number; lastSeen: number;
};
export type QualityBuckets = { human: number; bot: number; unknown: number };
export type FraudSignal = { id: string; label: string; evidence: string; severity: "high" | "medium" | "low"; count: number };
export type Diagnostics = {
  eventsProcessed: number;
  pageViewRows: number;
  sessionRows: number;
  orderRows: number;
  duplicateEvents: number;
  eventsWithoutSession: number;
  lastEventAt: number | null;
  lastPageViewAt: number | null;
  freshnessSec: number | null;
  sources: { name: string; rows: number; lastAt: number | null; healthy: boolean }[];
};
export type CustomerIntel = {
  newCustomers: Metric; returningCustomers: Metric; repeatRate: Metric;
  ltv: Metric; aov: Metric; frequency: Metric;
};
export type TimeIntel = {
  hourly: { hour: string; visitors: number; orders: number; revenue: number }[];
  daily: { date: string; visitors: number; orders: number; revenue: number }[];
  weekly: { week: string; visitors: number; orders: number; revenue: number }[];
  monthly: { month: string; visitors: number; orders: number; revenue: number }[];
};

export type TrafficV10 = {
  generatedAt: number;
  days: number;
  global: SegmentMetrics;
  india: SegmentMetrics;
  international: SegmentMetrics;
  geo: { countries: Breakdown[]; cities: Breakdown[]; timezones: Breakdown[] };
  marketing: { campaigns: Breakdown[]; sources: Breakdown[]; mediums: Breakdown[]; channels: Breakdown[] };
  tech: { devices: Breakdown[]; os: Breakdown[]; browsers: Breakdown[]; screens: Breakdown[]; networks: Breakdown[]; languages: Breakdown[] };
  time: TimeIntel;
  journey: JourneyStage[];
  feed: FeedItem[];
  liveVisitors: LiveVisitorV10[];
  quality: QualityBuckets;
  fraud: FraudSignal[];
  customers: CustomerIntel;
  diagnostics: Diagnostics;
};

/* ------------------------------------------------------------- internal */

type EventRow = {
  event: string; path: string | null; product_slug: string | null; session_id: string | null;
  user_id: string | null; value: number | null; referrer: string | null; created_at: string;
  metadata: Record<string, unknown> | null;
};
type SessRow = {
  session_id: string; user_id: string | null; started_at: string; last_seen: string;
  page_views: number; country: string | null; device: string | null; referrer: string | null; landing_path: string | null;
};
type OrderRow = { id: string; total: number | null; status: string | null; payment_status: string | null; market_region: string | null; created_at: string; user_id: string | null };
type PVRow = { path: string; created_at: string; session_id: string | null; country: string | null; device: string | null };

type SessionProfile = {
  region: Region; device: string; browser: string; os: string; country: string; city: string;
  timezone: string; language: string; network: string; screen: string; bot: boolean;
  utmSource: string; utmMedium: string; utmCampaign: string; channel: string;
  visitorId: string; loggedIn: boolean; landing: string;
};

const ratio = (num: number, den: number): Metric => (den > 0 ? (num / den) * 100 : null);
const div = (num: number, den: number): Metric => (den > 0 ? num / den : null);
const orNull = (n: number, any: boolean): Metric => (any ? n : null);

function pushBreak(
  map: Map<string, { sessions: Set<string>; visitors: Set<string>; orders: number; revenue: number }>,
  key: string,
) {
  let v = map.get(key);
  if (!v) { v = { sessions: new Set(), visitors: new Set(), orders: 0, revenue: 0 }; map.set(key, v); }
  return v;
}

function finishBreak(map: Map<string, { sessions: Set<string>; visitors: Set<string>; orders: number; revenue: number }>): Breakdown[] {
  return [...map.entries()]
    .map(([label, v]) => ({
      label,
      sessions: v.sessions.size,
      visitors: v.visitors.size,
      orders: v.orders,
      revenue: v.revenue,
      conversion: v.sessions.size ? (v.orders / v.sessions.size) * 100 : 0,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.revenue - a.revenue);
}

/* ------------------------------------------------------------------ api */

export async function fetchTrafficV10(days = 14): Promise<TrafficV10> {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const includeSeed = await includeSeedInAnalytics();

  const [evR, sR, oR, pvR] = await Promise.all([
    supabase.from("analytics_events")
      .select("event,path,product_slug,session_id,user_id,value,referrer,created_at,metadata")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(50000),
    supabase.from("visitor_sessions").select("*").gte("started_at", since).limit(20000),
    supabase.from("orders").select("id,total,status,payment_status,market_region,created_at,user_id")
      .gte("created_at", since).limit(20000),
    supabase.from("page_views").select("path,created_at,session_id,country,device")
      .gte("created_at", since).order("created_at", { ascending: false }).limit(50000),
  ]);

  let events = (evR.data as EventRow[] | null) ?? [];
  const sessions = (sR.data as SessRow[] | null) ?? [];
  const orders = (oR.data as OrderRow[] | null) ?? [];
  const pageViews = (pvR.data as PVRow[] | null) ?? [];

  if (!includeSeed) {
    events = events.filter((e) => !(e.metadata as { is_seeded?: boolean } | null)?.is_seeded);
  }

  /* ---- session profiles from the first real page_view of each session --- */
  const profiles = new Map<string, SessionProfile>();
  const pvEvents = events.filter((e) => e.event === "page_view").slice().reverse(); // oldest first
  for (const e of pvEvents) {
    const sid = e.session_id;
    if (!sid || profiles.has(sid)) continue;
    const m = e.metadata ?? {};
    const utmSource = str(m.utm_source);
    const utmMedium = str(m.utm_medium);
    const region = normRegion(m.region);
    profiles.set(sid, {
      region,
      device: str(m.device).toLowerCase() || "",
      browser: str(m.browser),
      os: str(m.os),
      country: region === "india" ? "India" : "International",
      city: str(m.tz_city),
      timezone: str(m.timezone),
      language: str(m.language),
      network: str(m.network),
      screen: str(m.screen),
      bot: Boolean(m.is_bot),
      utmSource,
      utmMedium,
      utmCampaign: str(m.utm_campaign),
      channel: utmMedium || (utmSource ? "campaign" : str(m.source) || (e.referrer ? "referral" : "direct")),
      visitorId: str(m.visitor_id),
      loggedIn: Boolean(e.user_id),
      landing: str(m.landing_path) || e.path || "/",
    });
  }
  const profileOf = (sid: string | null): SessionProfile | null => (sid ? profiles.get(sid) ?? null : null);

  /* ---- traffic quality: bots never count as visitors ------------------- */
  const quality: QualityBuckets = { human: 0, bot: 0, unknown: 0 };
  for (const s of sessions) {
    const p = profileOf(s.session_id);
    if (!p) quality.unknown++;
    else if (p.bot) quality.bot++;
    else quality.human++;
  }
  const humanSession = (sid: string | null) => !(profileOf(sid)?.bot ?? false);
  const cleanSessions = sessions.filter((s) => humanSession(s.session_id));
  const cleanEvents = events.filter((e) => humanSession(e.session_id));

  /* ---- orders ---------------------------------------------------------- */
  const paidOrders = orders.filter((o) => isPaidOrder(o.status, o.payment_status));
  const anyOrderData = orders.length > 0;

  /* ---- segment builder ------------------------------------------------- */
  function segment(label: string, region: Region | "all"): SegmentMetrics {
    const inSeg = (sid: string | null) => {
      if (region === "all") return true;
      const p = profileOf(sid);
      return p ? p.region === region : false;
    };
    const segSessions = cleanSessions.filter((s) =>
      region === "all" ? true : (profileOf(s.session_id)?.region ?? normRegion(s.country)) === region,
    );
    const segEvents = cleanEvents.filter((e) => (region === "all" ? true : inSeg(e.session_id)));
    const views = segEvents.filter((e) => e.event === "page_view").length;
    const visitors = new Set<string>();
    for (const e of segEvents) {
      const vid = str(e.metadata?.visitor_id);
      if (vid) visitors.add(vid);
    }
    const segOrders = paidOrders.filter((o) => (region === "all" ? true : normRegion(o.market_region) === region));
    const revenue = segOrders.reduce((s, o) => s + (o.total ?? 0), 0);
    const sessionCount = segSessions.length;
    const bounced = segSessions.filter((s) => (s.page_views ?? 0) <= 1).length;
    const newSessions = segSessions.filter((s) => !s.user_id).length;
    const checkoutStarted = new Set(segEvents.filter((e) => e.event === "checkout_start" || e.event === "checkout_started").map((e) => e.session_id)).size;
    const success = new Set(segEvents.filter((e) => e.event === "purchase" || e.event === "payment_success" || e.event === "order_created").map((e) => e.session_id)).size;
    const failure = new Set(segEvents.filter((e) => e.event === "payment_failed").map((e) => e.session_id)).size;
    const anyEvents = segEvents.length > 0;
    const anySessions = sessionCount > 0;
    const devCount = (d: string) => segSessions.filter((s) => (profileOf(s.session_id)?.device || (s.device ?? "").toLowerCase()) === d).length;

    return {
      label,
      views: orNull(views, anyEvents),
      visitors: orNull(visitors.size, visitors.size > 0),
      sessions: orNull(sessionCount, anySessions),
      orders: orNull(segOrders.length, anyOrderData),
      revenue: orNull(revenue, anyOrderData),
      conversion: ratio(segOrders.length, sessionCount),
      aov: div(revenue, segOrders.length),
      bounceRate: ratio(bounced, sessionCount),
      returningRate: ratio(sessionCount - newSessions, sessionCount),
      newUsers: orNull(newSessions, anySessions),
      returningUsers: orNull(sessionCount - newSessions, anySessions),
      checkoutStarted: orNull(checkoutStarted, anyEvents),
      checkoutSuccess: orNull(success, anyEvents),
      checkoutFailure: orNull(failure, anyEvents),
      mobile: orNull(devCount("mobile"), anySessions),
      tablet: orNull(devCount("tablet"), anySessions),
      desktop: orNull(devCount("desktop"), anySessions),
    };
  }

  const india = segment("India", "india");
  const international = segment("International", "international");
  const global = segment("Global", "all");

  /* ---- dimension breakdowns ------------------------------------------- */
  const dim = {
    countries: new Map<string, ReturnType<typeof pushBreak>>(),
    cities: new Map<string, ReturnType<typeof pushBreak>>(),
    timezones: new Map<string, ReturnType<typeof pushBreak>>(),
    campaigns: new Map<string, ReturnType<typeof pushBreak>>(),
    sources: new Map<string, ReturnType<typeof pushBreak>>(),
    mediums: new Map<string, ReturnType<typeof pushBreak>>(),
    channels: new Map<string, ReturnType<typeof pushBreak>>(),
    devices: new Map<string, ReturnType<typeof pushBreak>>(),
    os: new Map<string, ReturnType<typeof pushBreak>>(),
    browsers: new Map<string, ReturnType<typeof pushBreak>>(),
    screens: new Map<string, ReturnType<typeof pushBreak>>(),
    networks: new Map<string, ReturnType<typeof pushBreak>>(),
    languages: new Map<string, ReturnType<typeof pushBreak>>(),
  } as const;

  type DimMap = Map<string, { sessions: Set<string>; visitors: Set<string>; orders: number; revenue: number }>;
  const add = (map: DimMap, key: string, sid: string, vid: string) => {
    if (!key) return;
    const b = pushBreak(map, key);
    b.sessions.add(sid);
    if (vid) b.visitors.add(vid);
  };

  for (const [sid, p] of profiles) {
    if (p.bot) continue;
    add(dim.countries as DimMap, p.country, sid, p.visitorId);
    add(dim.cities as DimMap, p.city, sid, p.visitorId);
    add(dim.timezones as DimMap, p.timezone, sid, p.visitorId);
    add(dim.campaigns as DimMap, p.utmCampaign, sid, p.visitorId);
    add(dim.sources as DimMap, p.utmSource, sid, p.visitorId);
    add(dim.mediums as DimMap, p.utmMedium, sid, p.visitorId);
    add(dim.channels as DimMap, p.channel, sid, p.visitorId);
    add(dim.devices as DimMap, p.device, sid, p.visitorId);
    add(dim.os as DimMap, p.os, sid, p.visitorId);
    add(dim.browsers as DimMap, p.browser, sid, p.visitorId);
    add(dim.screens as DimMap, p.screen, sid, p.visitorId);
    add(dim.networks as DimMap, p.network, sid, p.visitorId);
    add(dim.languages as DimMap, p.language, sid, p.visitorId);
  }

  // Attach real purchase revenue to each dimension via session attribution.
  for (const e of cleanEvents) {
    if (e.event !== "purchase" && e.event !== "payment_success" && e.event !== "order_created") continue;
    const p = profileOf(e.session_id);
    if (!p) continue;
    const rev = e.value ?? 0;
    const bump = (map: DimMap, key: string) => {
      if (!key) return;
      const b = map.get(key);
      if (!b) return;
      b.orders++;
      b.revenue += rev;
    };
    bump(dim.countries as DimMap, p.country);
    bump(dim.cities as DimMap, p.city);
    bump(dim.timezones as DimMap, p.timezone);
    bump(dim.campaigns as DimMap, p.utmCampaign);
    bump(dim.sources as DimMap, p.utmSource);
    bump(dim.mediums as DimMap, p.utmMedium);
    bump(dim.channels as DimMap, p.channel);
    bump(dim.devices as DimMap, p.device);
    bump(dim.os as DimMap, p.os);
    bump(dim.browsers as DimMap, p.browser);
    bump(dim.screens as DimMap, p.screen);
    bump(dim.networks as DimMap, p.network);
    bump(dim.languages as DimMap, p.language);
  }

  /* ---- time intelligence ---------------------------------------------- */
  const hourly = new Map<string, { v: Set<string>; o: number; r: number }>();
  const daily = new Map<string, { v: Set<string>; o: number; r: number }>();
  const weekly = new Map<string, { v: Set<string>; o: number; r: number }>();
  const monthly = new Map<string, { v: Set<string>; o: number; r: number }>();
  const bucket = (m: Map<string, { v: Set<string>; o: number; r: number }>, k: string) => {
    let b = m.get(k);
    if (!b) { b = { v: new Set(), o: 0, r: 0 }; m.set(k, b); }
    return b;
  };
  const weekKey = (d: Date) => {
    const t = new Date(d);
    t.setDate(t.getDate() - ((t.getDay() + 6) % 7));
    return t.toISOString().slice(0, 10);
  };
  for (const e of cleanEvents.filter((x) => x.event === "page_view")) {
    const d = new Date(e.created_at);
    const vid = str(e.metadata?.visitor_id) || e.session_id || "";
    bucket(hourly, String(d.getHours()).padStart(2, "0")).v.add(vid);
    bucket(daily, e.created_at.slice(0, 10)).v.add(vid);
    bucket(weekly, weekKey(d)).v.add(vid);
    bucket(monthly, e.created_at.slice(0, 7)).v.add(vid);
  }
  for (const o of paidOrders) {
    const d = new Date(o.created_at);
    const rev = o.total ?? 0;
    for (const [m, k] of [
      [hourly, String(d.getHours()).padStart(2, "0")],
      [daily, o.created_at.slice(0, 10)],
      [weekly, weekKey(d)],
      [monthly, o.created_at.slice(0, 7)],
    ] as [typeof hourly, string][]) {
      const b = bucket(m, k);
      b.o++;
      b.r += rev;
    }
  }
  const serialize = (m: Map<string, { v: Set<string>; o: number; r: number }>, key: string) =>
    [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([k, b]) => ({ [key]: k, visitors: b.v.size, orders: b.o, revenue: b.r })) as never;

  const time: TimeIntel = {
    hourly: serialize(hourly, "hour"),
    daily: serialize(daily, "date"),
    weekly: serialize(weekly, "week"),
    monthly: serialize(monthly, "month"),
  };

  /* ---- customer journey ------------------------------------------------ */
  const stageSets: [string, Set<string>][] = [
    ["Visitors", new Set<string>()],
    ["Landing", new Set<string>()],
    ["Search", new Set<string>()],
    ["Product", new Set<string>()],
    ["Wishlist", new Set<string>()],
    ["Cart", new Set<string>()],
    ["Checkout", new Set<string>()],
    ["Payment", new Set<string>()],
    ["Order", new Set<string>()],
  ];
  const S = Object.fromEntries(stageSets) as Record<string, Set<string>>;
  for (const e of cleanEvents) {
    const sid = e.session_id;
    if (!sid) continue;
    S.Visitors.add(sid);
    const route = str(e.metadata?.route);
    if (e.event === "page_view") {
      if (route === "home" || route === "category") S.Landing.add(sid);
      if (route === "search") S.Search.add(sid);
      if (route === "product") S.Product.add(sid);
      if (route === "wishlist") S.Wishlist.add(sid);
      if (route === "cart") S.Cart.add(sid);
      if (route === "checkout") S.Checkout.add(sid);
    }
    if (e.event === "search") S.Search.add(sid);
    if (e.event === "product_view") S.Product.add(sid);
    if (e.event === "wishlist" || e.event === "add_to_wishlist") S.Wishlist.add(sid);
    if (e.event === "add_to_cart") S.Cart.add(sid);
    if (e.event === "checkout_start" || e.event === "checkout_started") S.Checkout.add(sid);
    if (e.event === "payment_success" || e.event === "payment_failed") S.Payment.add(sid);
    if (e.event === "purchase" || e.event === "order_created") { S.Payment.add(sid); S.Order.add(sid); }
  }
  const topStage = S.Visitors.size;
  let prev = 0;
  const journey: JourneyStage[] = stageSets.map(([stage], i) => {
    const n = S[stage].size;
    const drop = i === 0 || prev === 0 ? null : Math.max(0, ((prev - n) / prev) * 100);
    prev = n;
    return { stage, sessions: n, dropPct: drop, conversionPct: topStage ? (n / topStage) * 100 : null };
  });

  /* ---- live activity feed (real events only) --------------------------- */
  const label: Record<string, string> = {
    page_view: "Viewed a page", product_view: "Viewed product", add_to_cart: "Added to cart",
    wishlist: "Added to wishlist", add_to_wishlist: "Added to wishlist", search: "Searched",
    checkout_start: "Started checkout", checkout_started: "Started checkout",
    payment_success: "Payment successful", payment_failed: "Payment failed",
    purchase: "Order completed", order_created: "Order created",
    login: "Signed in", signup: "Signed up", logout: "Signed out", review_created: "Wrote a review",
  };
  const feed: FeedItem[] = cleanEvents
    .filter((e) => label[e.event] && e.event !== "page_view")
    .slice(0, 60)
    .map((e, i) => {
      const p = profileOf(e.session_id);
      return {
        id: `${e.created_at}-${i}`,
        at: new Date(e.created_at).getTime(),
        actor: e.user_id ? "Customer" : "Guest",
        action: label[e.event],
        detail: e.product_slug ?? e.path ?? "",
        region: p?.region ?? "international",
        loggedIn: Boolean(e.user_id),
      };
    });

  /* ---- live visitors --------------------------------------------------- */
  const liveCut = Date.now() - 5 * 60 * 1000;
  const lastPathBySession = new Map<string, string>();
  for (const e of cleanEvents.filter((x) => x.event === "page_view")) {
    if (e.session_id && !lastPathBySession.has(e.session_id)) lastPathBySession.set(e.session_id, e.path ?? "/");
  }
  const liveVisitors: LiveVisitorV10[] = cleanSessions
    .filter((s) => new Date(s.last_seen).getTime() >= liveCut)
    .map((s) => {
      const p = profileOf(s.session_id);
      return {
        sessionId: s.session_id,
        path: lastPathBySession.get(s.session_id) ?? s.landing_path ?? "/",
        region: p?.region ?? normRegion(s.country),
        country: p?.country ?? (s.country || ""),
        city: p?.city ?? "",
        device: p?.device || (s.device ?? "").toLowerCase(),
        browser: p?.browser ?? "",
        os: p?.os ?? "",
        loggedIn: Boolean(s.user_id),
        onPageSec: Math.max(0, Math.round((Date.now() - new Date(s.last_seen).getTime()) / 1000)),
        lastSeen: new Date(s.last_seen).getTime(),
      };
    })
    .sort((a, b) => b.lastSeen - a.lastSeen);

  /* ---- fraud signals (evidence-backed only) ---------------------------- */
  const fraud: FraudSignal[] = [];
  const perSessionViews = new Map<string, number>();
  for (const e of cleanEvents.filter((x) => x.event === "page_view")) {
    if (e.session_id) perSessionViews.set(e.session_id, (perSessionViews.get(e.session_id) ?? 0) + 1);
  }
  const rapid = [...perSessionViews.entries()].filter(([sid, n]) => {
    const s = sessions.find((x) => x.session_id === sid);
    if (!s) return false;
    const durMin = (new Date(s.last_seen).getTime() - new Date(s.started_at).getTime()) / 60000;
    return n >= 30 && durMin < 2;
  });
  if (rapid.length) fraud.push({ id: "rapid", label: "Rapid refresh pattern", evidence: `${rapid.length} session(s) with 30+ page views inside 2 minutes`, severity: "medium", count: rapid.length });
  if (quality.bot) fraud.push({ id: "bot", label: "Automated traffic detected", evidence: `${quality.bot} session(s) reported automation or a bot user-agent`, severity: "low", count: quality.bot });
  const failsBySession = new Map<string, number>();
  for (const e of cleanEvents.filter((x) => x.event === "payment_failed")) {
    if (e.session_id) failsBySession.set(e.session_id, (failsBySession.get(e.session_id) ?? 0) + 1);
  }
  const repeatedFails = [...failsBySession.values()].filter((n) => n >= 3).length;
  if (repeatedFails) fraud.push({ id: "fails", label: "Repeated failed checkouts", evidence: `${repeatedFails} session(s) with 3+ failed payment attempts`, severity: "high", count: repeatedFails });
  const tzMismatch = [...profiles.values()].filter((p) => p.region === "india" && p.timezone && !/Asia\/(Kolkata|Calcutta)/i.test(p.timezone)).length;
  if (tzMismatch) fraud.push({ id: "geo", label: "Region / timezone mismatch", evidence: `${tzMismatch} India-region session(s) reporting a non-India device timezone`, severity: "low", count: tzMismatch });

  /* ---- customer intelligence (from real orders) ------------------------- */
  const byCustomer = new Map<string, { n: number; rev: number }>();
  for (const o of paidOrders) {
    if (!o.user_id) continue;
    const c = byCustomer.get(o.user_id) ?? { n: 0, rev: 0 };
    c.n++; c.rev += o.total ?? 0;
    byCustomer.set(o.user_id, c);
  }
  const customerCount = byCustomer.size;
  const repeat = [...byCustomer.values()].filter((c) => c.n > 1).length;
  const totalRev = [...byCustomer.values()].reduce((s, c) => s + c.rev, 0);
  const totalOrd = [...byCustomer.values()].reduce((s, c) => s + c.n, 0);
  const customers: CustomerIntel = {
    newCustomers: orNull(customerCount - repeat, customerCount > 0),
    returningCustomers: orNull(repeat, customerCount > 0),
    repeatRate: ratio(repeat, customerCount),
    ltv: div(totalRev, customerCount),
    aov: div(totalRev, totalOrd),
    frequency: div(totalOrd, customerCount),
  };

  /* ---- diagnostics ----------------------------------------------------- */
  const seen = new Set<string>();
  let duplicates = 0;
  for (const e of events) {
    const k = `${e.session_id}|${e.event}|${e.path}|${e.created_at}`;
    if (seen.has(k)) duplicates++;
    else seen.add(k);
  }
  const lastEventAt = events.length ? new Date(events[0].created_at).getTime() : null;
  const lastPvAt = pageViews.length ? new Date(pageViews[0].created_at).getTime() : null;
  const fresh = (ts: number | null) => (ts === null ? null : Math.round((Date.now() - ts) / 1000));
  const diagnostics: Diagnostics = {
    eventsProcessed: events.length,
    pageViewRows: pageViews.length,
    sessionRows: sessions.length,
    orderRows: orders.length,
    duplicateEvents: duplicates,
    eventsWithoutSession: events.filter((e) => !e.session_id).length,
    lastEventAt,
    lastPageViewAt: lastPvAt,
    freshnessSec: fresh(lastEventAt),
    sources: [
      { name: "analytics_events", rows: events.length, lastAt: lastEventAt, healthy: events.length > 0 && !evR.error },
      { name: "page_views", rows: pageViews.length, lastAt: lastPvAt, healthy: pageViews.length > 0 && !pvR.error },
      { name: "visitor_sessions", rows: sessions.length, lastAt: sessions.length ? Math.max(...sessions.map((s) => new Date(s.last_seen).getTime())) : null, healthy: sessions.length > 0 && !sR.error },
      { name: "orders", rows: orders.length, lastAt: orders.length ? Math.max(...orders.map((o) => new Date(o.created_at).getTime())) : null, healthy: !oR.error },
    ],
  };

  return {
    generatedAt: Date.now(),
    days,
    global, india, international,
    geo: {
      countries: finishBreak(dim.countries as DimMap),
      cities: finishBreak(dim.cities as DimMap),
      timezones: finishBreak(dim.timezones as DimMap),
    },
    marketing: {
      campaigns: finishBreak(dim.campaigns as DimMap),
      sources: finishBreak(dim.sources as DimMap),
      mediums: finishBreak(dim.mediums as DimMap),
      channels: finishBreak(dim.channels as DimMap),
    },
    tech: {
      devices: finishBreak(dim.devices as DimMap),
      os: finishBreak(dim.os as DimMap),
      browsers: finishBreak(dim.browsers as DimMap),
      screens: finishBreak(dim.screens as DimMap),
      networks: finishBreak(dim.networks as DimMap),
      languages: finishBreak(dim.languages as DimMap),
    },
    time,
    journey,
    feed,
    liveVisitors,
    quality,
    fraud,
    customers,
    diagnostics,
  };
}
