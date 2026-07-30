import { supabase } from "@/integrations/supabase/client";

/**
 * Enterprise visitor identity + traffic tracking engine.
 *
 * Single source of truth for visitor/session identity. Every page view is
 * written to `page_views` and folded into `visitor_sessions` via the
 * `track_visit` RPC (SECURITY DEFINER so guests can keep sessions alive).
 * Rich domain events flow into `analytics_events` with classified metadata.
 */

const VISITOR_KEY = "fom_visitor_id"; // persistent across sessions (localStorage)
const SESSION_KEY = "fom_session_id"; // current session (sessionStorage)
const SESSION_TS_KEY = "fom_session_ts"; // last-activity timestamp (localStorage)
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 min inactivity = new session

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/** Stable per-device visitor id — survives refresh, navigation, return visits. */
export function visitorId(): string {
  if (typeof window === "undefined") return "ssr";
  let v = localStorage.getItem(VISITOR_KEY);
  if (!v) {
    v = uuid();
    localStorage.setItem(VISITOR_KEY, v);
  }
  return v;
}

/**
 * Session id that survives refresh/navigation but rotates after 30 min of
 * inactivity. Stored in localStorage (mobile browsers drop sessionStorage on
 * reload) with an activity timestamp guard.
 */
export function sessionId(): { id: string; isNew: boolean } {
  if (typeof window === "undefined") return { id: "ssr", isNew: false };
  const now = Date.now();
  const last = Number(localStorage.getItem(SESSION_TS_KEY) || 0);
  let id = localStorage.getItem(SESSION_KEY);
  let isNew = false;
  if (!id || !last || now - last > SESSION_TTL_MS) {
    id = uuid();
    localStorage.setItem(SESSION_KEY, id);
    isNew = true;
  }
  localStorage.setItem(SESSION_TS_KEY, String(now));
  return { id, isNew };
}

export function deviceType(): "mobile" | "tablet" | "desktop" {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  if (/iPad|Tablet|PlayBook|Silk|(Android(?!.*Mobile))/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone|iPod|IEMobile|BlackBerry|Opera Mini/i.test(ua)) return "mobile";
  return "desktop";
}

export function browserName(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "Other";
}

export function osName(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/Windows/.test(ua)) return "Windows";
  if (/Android/.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/.test(ua)) return "iOS";
  if (/Mac OS X/.test(ua)) return "macOS";
  if (/Linux/.test(ua)) return "Linux";
  return "Other";
}

/** Region the visitor is currently browsing (India / International). */
export function currentRegion(): "india" | "international" {
  if (typeof window === "undefined") return "international";
  return localStorage.getItem("market_region") === "india" ? "india" : "international";
}

function countryLabel(): string {
  return currentRegion() === "india" ? "India" : "International";
}

/**
 * Classify a referrer + UTM params into a canonical traffic source.
 * Drives the Traffic Source Intelligence dashboard.
 */
export function classifySource(referrer: string, url?: string): string {
  try {
    const u = url ? new URL(url) : typeof window !== "undefined" ? new URL(window.location.href) : null;
    const utm = u?.searchParams.get("utm_source")?.toLowerCase();
    if (utm) {
      const map: Record<string, string> = {
        google: "Google Search", bing: "Bing", yahoo: "Yahoo",
        facebook: "Facebook", fb: "Facebook", instagram: "Instagram", ig: "Instagram",
        youtube: "YouTube", tiktok: "TikTok", reddit: "Reddit", pinterest: "Pinterest",
        whatsapp: "WhatsApp", telegram: "Telegram", email: "Email Campaigns",
        newsletter: "Email Campaigns", influencer: "Influencers", affiliate: "Affiliate Sources",
      };
      if (map[utm]) return map[utm];
    }
  } catch {
    /* ignore */
  }

  if (!referrer) return "Direct";
  let host = referrer;
  try {
    host = new URL(referrer).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    /* ignore */
  }
  if (typeof window !== "undefined" && host.includes(window.location.hostname)) return "Direct";

  const rules: [RegExp, string][] = [
    [/google\./, "Google Search"], [/bing\./, "Bing"], [/yahoo\./, "Yahoo"],
    [/duckduckgo\./, "Google Search"],
    [/facebook\.|fb\.com|fb\.me/, "Facebook"], [/instagram\./, "Instagram"],
    [/youtube\.|youtu\.be/, "YouTube"], [/tiktok\./, "TikTok"], [/reddit\./, "Reddit"],
    [/pinterest\./, "Pinterest"], [/whatsapp\.|wa\.me/, "WhatsApp"], [/t\.me|telegram\./, "Telegram"],
  ];
  for (const [re, label] of rules) if (re.test(host)) return label;
  return "Referral Sites";
}

/** Derive a route category + slugs from a pathname for journey analytics. */
export function classifyRoute(path: string): {
  route: string;
  productSlug: string | null;
  categorySlug: string | null;
} {
  const seg = path.split("?")[0].split("/").filter(Boolean);
  if (seg.length === 0) return { route: "home", productSlug: null, categorySlug: null };
  const [first, second] = seg;
  if (first === "products") return { route: "product", productSlug: second ?? null, categorySlug: null };
  if (first === "category") return { route: "category", productSlug: null, categorySlug: second ?? null };
  const map: Record<string, string> = {
    search: "search", cart: "cart", checkout: "checkout", account: "account",
    blog: "blog", pages: "cms", deals: "deals", wishlist: "wishlist", compare: "compare",
  };
  return { route: map[first] ?? first, productSlug: null, categorySlug: null };
}

let lastPath = "";

/* ------------------------------------------------------------------ v10 */
/**
 * Traffic Intelligence v10 capture helpers.
 * Everything below is read from the real browser environment — no guessing,
 * no estimation. Fields that the browser does not expose are omitted entirely
 * so dashboards can render "No data available" instead of a fabricated value.
 */

/** Marketing attribution captured from the live URL (real UTM only). */
export function utmParams(url?: string): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    const u = new URL(url ?? window.location.href);
    for (const k of ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"]) {
      const v = u.searchParams.get(k);
      if (v) out[k] = v.slice(0, 120);
    }
  } catch {
    /* ignore */
  }
  return out;
}

/** IANA timezone reported by the device (exact, not inferred). */
export function timezoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "";
  } catch {
    return "";
  }
}

/** City segment of the IANA timezone, e.g. Asia/Kolkata → Kolkata. */
export function timezoneCity(tz = timezoneName()): string {
  const seg = tz.split("/").pop() ?? "";
  return seg ? seg.replace(/_/g, " ") : "";
}

export function screenSize(): string {
  if (typeof window === "undefined" || !window.screen) return "";
  return `${window.screen.width}x${window.screen.height}`;
}

export function networkType(): string {
  const c = (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
  return c?.effectiveType ?? "";
}

/** Bot/automation detection from real signals only. */
export function isLikelyBot(): boolean {
  if (typeof navigator === "undefined") return false;
  if ((navigator as unknown as { webdriver?: boolean }).webdriver) return true;
  return /bot|crawl|spider|slurp|headless|preview|monitor|lighthouse|pingdom|curl|wget/i.test(navigator.userAgent);
}

/** Full, real environment snapshot attached to every page_view event. */
export function captureContext(path: string) {
  const utm = utmParams();
  const tz = timezoneName();
  return {
    visitor_id: visitorId(),
    region: currentRegion(),
    device: deviceType(),
    browser: browserName(),
    os: osName(),
    screen: screenSize(),
    language: typeof navigator !== "undefined" ? navigator.language : "",
    timezone: tz,
    tz_city: timezoneCity(tz),
    network: networkType(),
    currency: currentRegion() === "india" ? "INR" : "USD",
    landing_path: path,
    is_bot: isLikelyBot(),
    utm_source: utm.utm_source ?? null,
    utm_medium: utm.utm_medium ?? null,
    utm_campaign: utm.utm_campaign ?? null,
    utm_term: utm.utm_term ?? null,
    utm_content: utm.utm_content ?? null,
    click_id: utm.gclid ?? utm.fbclid ?? null,
  };
}

/* ------------------------------------------------------------------ *
 * Page engagement capture (real measurements only).
 * Emits a `page_exit` event carrying the measured dwell time and the
 * maximum scroll depth actually reached on the page being left. This is
 * the only new capture required by Conversion Intelligence v11 — no
 * schema change, no business-logic change.
 * ------------------------------------------------------------------ */
let pageEnteredAt = 0;
let maxScrollPct = 0;
let engagementBound = false;

function measureScroll() {
  const doc = document.documentElement;
  const scrollable = doc.scrollHeight - window.innerHeight;
  const pct = scrollable > 0 ? ((window.scrollY || doc.scrollTop) / scrollable) * 100 : 100;
  if (pct > maxScrollPct) maxScrollPct = Math.min(100, Math.round(pct));
}

function emitPageEngagement(path: string) {
  if (!path || !pageEnteredAt) return;
  const seconds = Math.round((Date.now() - pageEnteredAt) / 1000);
  if (seconds < 0) return;
  const { route, productSlug, categorySlug } = classifyRoute(path);
  void trackEvent("page_exit", {
    path,
    productSlug: productSlug ?? undefined,
    value: seconds,
    metadata: {
      route,
      category_slug: categorySlug,
      dwell_seconds: seconds,
      scroll_depth_pct: maxScrollPct,
    },
  });
}

function bindEngagement() {
  if (engagementBound || typeof window === "undefined") return;
  engagementBound = true;
  window.addEventListener("scroll", measureScroll, { passive: true });
  window.addEventListener("pagehide", () => emitPageEngagement(lastPath));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") emitPageEngagement(lastPath);
  });
}

/**
 * Record a page view + keep the visitor session live. Called on every route
 * change. Also emits a `page_view` analytics_event with classified metadata.
 */
export async function trackVisit(path: string): Promise<void> {
  if (typeof window === "undefined") return;
  if (path === lastPath) return; // guard against duplicate effect fires
  if (lastPath) emitPageEngagement(lastPath);
  lastPath = path;
  pageEnteredAt = Date.now();
  maxScrollPct = 0;
  bindEngagement();


  const { id: sid, isNew } = sessionId();
  const referrer = document.referrer || "";
  const device = deviceType();
  const country = countryLabel();
  const source = classifySource(referrer);
  const { route, productSlug, categorySlug } = classifyRoute(path);

  try {
    await supabase.rpc("track_visit", {
      _path: path,
      _session_id: sid,
      _referrer: referrer || undefined,
      _user_agent: navigator.userAgent,
      _country: country,
      _device: device,
      _is_new_session: isNew,
    });
  } catch {
    /* swallow tracking errors — never break the storefront */
  }

  // Rich event copy for funnel / journey / source dashboards.
  void trackEvent("page_view", {
    path,
    productSlug: productSlug ?? undefined,
    metadata: {
      ...captureContext(path),
      route, source,
      category_slug: categorySlug,
      is_new_session: isNew,
      referrer,
    },
  });

  // GA4 page_view for SPA route changes.
  void import("@/lib/ga4").then((m) => m.ga4PageView(path)).catch(() => {});
}



// Cache the current auth user id so trackEvent doesn't hit the network on
// every call. supabase.auth.getUser() is a JWKS-validating call; for
// high-frequency analytics we resolve it once and refresh only on sign-in /
// sign-out via onAuthStateChange.
let cachedUserId: string | null = null;
let userIdResolved = false;
async function getCurrentUserId(): Promise<string | null> {
  if (userIdResolved) return cachedUserId;
  try {
    const { data } = await supabase.auth.getSession();
    cachedUserId = data.session?.user?.id ?? null;
  } catch {
    cachedUserId = null;
  }
  userIdResolved = true;
  return cachedUserId;
}
if (typeof window !== "undefined") {
  supabase.auth.onAuthStateChange((_evt, session) => {
    cachedUserId = session?.user?.id ?? null;
    userIdResolved = true;
  });
}

// Batch analytics_events inserts. Individual events used to fire one HTTP +
// one INSERT per interaction; on busy pages (grid impressions, scroll depth,
// hover) this dominated the DB write budget. We now coalesce into a single
// batched INSERT flushed on an idle timer or when the buffer fills up.
type PendingEvent = {
  user_id: string | null;
  session_id: string;
  event: string;
  path: string;
  referrer: string | null;
  product_slug: string | null;
  value: number | null;
  metadata: Record<string, unknown>;
};
const buffer: PendingEvent[] = [];
const BATCH_MAX = 20;
const BATCH_INTERVAL_MS = 1500;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimer = null;
  if (!buffer.length) return;
  const rows = buffer.splice(0, buffer.length);
  try {
    await supabase.from("analytics_events").insert(rows as never);
  } catch {
    /* swallow analytics errors — never block the storefront */
  }
}

function scheduleFlush() {
  if (buffer.length >= BATCH_MAX) {
    if (flushTimer) { clearTimeout(flushTimer); flushTimer = null; }
    void flush();
    return;
  }
  if (flushTimer) return;
  flushTimer = setTimeout(() => { void flush(); }, BATCH_INTERVAL_MS);
}

if (typeof window !== "undefined") {
  // Best-effort flush before the tab unloads or is backgrounded so events
  // aren't lost.
  const finalFlush = () => { if (buffer.length) void flush(); };
  window.addEventListener("pagehide", finalFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") finalFlush();
  });
}

/** Emit a domain analytics event (product_view, add_to_cart, purchase, …). */
export async function trackEvent(
  event: string,
  opts: {
    path?: string;
    productSlug?: string;
    value?: number;
    metadata?: Record<string, unknown>;
  } = {},
): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const uid = await getCurrentUserId();
    buffer.push({
      user_id: uid,
      session_id: sessionId().id,
      event,
      path: opts.path ?? window.location.pathname,
      referrer: document.referrer || null,
      product_slug: opts.productSlug ?? null,
      value: opts.value ?? null,
      metadata: {
        region: currentRegion(),
        device: deviceType(),
        visitor_id: visitorId(),
        ...(opts.metadata ?? {}),
      },
    });
    scheduleFlush();
  } catch {
    /* swallow analytics errors */
  }
}
