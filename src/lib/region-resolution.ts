/**
 * Region Resolution v2 — multi-signal, priority-ordered market resolver.
 *
 * WHY THIS EXISTS
 * Razorpay only exposes UPI / Netbanking / Wallets / EMI on **INR** orders.
 * Our Razorpay order currency is derived from the resolved market region, so a
 * customer who is really shopping in India but resolves to `international`
 * gets a USD order and therefore a cards-only checkout.
 *
 * This module resolves the market region from every signal we actually have,
 * in a fixed priority order, and records *why* it decided what it decided so
 * staff can diagnose a missing-UPI report without guessing.
 *
 * IMPORTANT — this module is pure and has NO side effects. It does not price,
 * charge, tax, or persist anything. It only maps signals → region.
 *
 * TRUST MODEL
 *   Trusted signals   : shipping address country, saved profile region,
 *                       billing address country, edge geo-IP country.
 *   Advisory signals  : client-declared region preference, browser locale,
 *                       browser timezone, client-side IP geolocation.
 *
 * Advisory signals are attacker-controlled, so they can only decide the region
 * when NO trusted signal is available. They can never override a trusted
 * signal (that would let a client pick the cheaper currency).
 */

export type MarketRegion = "india" | "international";
export type MarketCurrency = "INR" | "USD";

/** Ordered signal identifiers — index order is the resolution priority. */
export type RegionSignalKey =
  | "selected_region"
  | "shipping_country"
  | "profile_region"
  | "billing_country"
  | "edge_geo_country"
  | "browser_locale"
  | "browser_timezone"
  | "ip_geolocation"
  | "platform_fallback";

export type RegionSignals = {
  /** Region the customer explicitly picked (highest priority). */
  selectedRegion?: MarketRegion | string | null;
  /**
   * True when `selectedRegion` was read server-side (e.g. the write-once locked
   * profile region) rather than sent by the client. Client-sent selections stay
   * advisory so a tampered payload can never pick the cheaper currency.
   */
  selectedRegionTrusted?: boolean;
  /** Country on the shipping address already entered (trusted, server-read). */
  shippingCountry?: string | null;
  /** Region locked on the customer's profile (trusted, server-read). */
  profileRegion?: MarketRegion | string | null;
  /** Country on the billing address, when one exists (trusted, server-read). */
  billingCountry?: string | null;
  /** Edge geo-IP country header, e.g. `cf-ipcountry` (trusted, server-read). */
  edgeCountry?: string | null;
  /** `navigator.language` (advisory, client-sent). */
  locale?: string | null;
  /** IANA timezone from `Intl` (advisory, client-sent). */
  timezone?: string | null;
  /** Country from a client-side IP geolocation lookup, if already available. */
  ipCountry?: string | null;
};

export type SignalEvidence = {
  key: RegionSignalKey;
  label: string;
  /** Raw value as observed, or null when the signal was not available. */
  value: string | null;
  /** Region this signal points at, or null when it is uninformative. */
  indicates: MarketRegion | null;
  trusted: boolean;
  available: boolean;
};

export type RegionDecision = {
  region: MarketRegion;
  currency: MarketCurrency;
  /** The signal that actually determined the outcome. */
  decidedBy: RegionSignalKey;
  /** Plain-language explanation of the decision. */
  reason: string;
  /** 0–100 confidence, boosted when independent signals agree. */
  confidence: number;
  /** Every signal considered, in priority order. */
  signals: SignalEvidence[];
  /** Trusted signals that disagree with the outcome (worth investigating). */
  conflicts: RegionSignalKey[];
  /** True when Razorpay will expose UPI / Netbanking / Wallets for this order. */
  upiEligible: boolean;
  /** Populated when `upiEligible` is false. */
  upiUnavailableReason: string | null;
};

/** ISO-2 / ISO-3 / common spellings that all mean India. */
const INDIA_TOKENS = new Set(["IN", "IND", "INDIA", "BHARAT", "भारत"]);

/** Normalise a free-text country value to an ISO-2-ish token, or null. */
export function normalizeCountry(raw?: string | null): string | null {
  const v = (raw ?? "").trim().toUpperCase();
  if (!v) return null;
  if (INDIA_TOKENS.has(v)) return "IN";
  return v;
}

/** Map a country value to a market region. Unknown text ⇒ null (uninformative). */
export function countryToRegion(raw?: string | null): MarketRegion | null {
  const c = normalizeCountry(raw);
  if (!c) return null;
  return c === "IN" ? "india" : "international";
}

function regionFromValue(raw?: string | null): MarketRegion | null {
  const v = (raw ?? "").trim().toLowerCase();
  if (v === "india" || v === "international") return v;
  return null;
}

function localeRegion(raw?: string | null): MarketRegion | null {
  const l = (raw ?? "").trim().toLowerCase();
  if (!l) return null;
  if (l.endsWith("-in") || /^(hi|ta|te|ml|kn|bn|mr|gu|pa|or|as)\b/.test(l)) return "india";
  // A non-India locale is only a weak international hint; still informative.
  return "international";
}

function timezoneRegion(raw?: string | null): MarketRegion | null {
  const tz = (raw ?? "").trim();
  if (!tz) return null;
  if (tz === "Asia/Kolkata" || tz === "Asia/Calcutta") return "india";
  return "international";
}

export const CURRENCY_BY_REGION: Record<MarketRegion, MarketCurrency> = {
  india: "INR",
  international: "USD",
};

/**
 * Resolve the market region from all available signals.
 *
 * Priority (first informative signal wins, advisory signals only apply when no
 * trusted signal is informative):
 *   1. selected region  2. shipping country  3. profile region
 *   4. billing country  5. edge geo-IP       6. browser locale
 *   7. browser timezone 8. IP geolocation    9. platform fallback
 */
export function resolveMarketRegion(signals: RegionSignals): RegionDecision {
  const evidence: SignalEvidence[] = [
    {
      key: "selected_region",
      label: "Customer-selected region",
      value: signals.selectedRegion ? String(signals.selectedRegion) : null,
      indicates: regionFromValue(signals.selectedRegion as string | null),
      trusted: signals.selectedRegionTrusted === true,
      available: !!signals.selectedRegion,
    },
    {
      key: "shipping_country",
      label: "Shipping address country",
      value: normalizeCountry(signals.shippingCountry),
      indicates: countryToRegion(signals.shippingCountry),
      trusted: true,
      available: !!normalizeCountry(signals.shippingCountry),
    },
    {
      key: "profile_region",
      label: "Saved profile region",
      value: signals.profileRegion ? String(signals.profileRegion) : null,
      indicates: regionFromValue(signals.profileRegion as string | null),
      trusted: true,
      available: !!regionFromValue(signals.profileRegion as string | null),
    },
    {
      key: "billing_country",
      label: "Billing address country",
      value: normalizeCountry(signals.billingCountry),
      indicates: countryToRegion(signals.billingCountry),
      trusted: true,
      available: !!normalizeCountry(signals.billingCountry),
    },
    {
      key: "edge_geo_country",
      label: "Edge geo-IP country (cf-ipcountry)",
      value: normalizeCountry(signals.edgeCountry),
      indicates: countryToRegion(signals.edgeCountry),
      trusted: true,
      available: !!normalizeCountry(signals.edgeCountry),
    },
    {
      key: "browser_locale",
      label: "Browser locale",
      value: signals.locale ?? null,
      indicates: localeRegion(signals.locale),
      trusted: false,
      available: !!signals.locale,
    },
    {
      key: "browser_timezone",
      label: "Browser timezone",
      value: signals.timezone ?? null,
      indicates: timezoneRegion(signals.timezone),
      trusted: false,
      available: !!signals.timezone,
    },
    {
      key: "ip_geolocation",
      label: "IP geolocation country",
      value: normalizeCountry(signals.ipCountry),
      indicates: countryToRegion(signals.ipCountry),
      trusted: false,
      available: !!normalizeCountry(signals.ipCountry),
    },
  ];

  const trustedInformative = evidence.filter((e) => e.trusted && e.indicates);
  const pool = trustedInformative.length > 0 ? trustedInformative : evidence.filter((e) => e.indicates);

  let region: MarketRegion;
  let decidedBy: RegionSignalKey;
  let reason: string;

  if (pool.length > 0) {
    const winner = pool[0]!;
    region = winner.indicates!;
    decidedBy = winner.key;
    reason =
      `${winner.label} = ${winner.value} ⇒ ${region}` +
      (trustedInformative.length === 0 ? " (no trusted signal available; advisory signal used)" : "");
  } else {
    // 9. Platform fallback — unchanged behaviour: international / USD.
    region = "international";
    decidedBy = "platform_fallback";
    reason =
      "No region signal was available (no selection, no address country, no profile region, " +
      "no geo-IP, no locale or timezone). Applied the platform fallback: international / USD.";
  }

  const agreeing = evidence.filter((e) => e.indicates === region);
  const conflicts = evidence.filter((e) => e.trusted && e.indicates && e.indicates !== region).map((e) => e.key);

  let confidence: number;
  if (decidedBy === "platform_fallback") confidence = 30;
  else {
    const base = pool[0]!.trusted ? 80 : 55;
    confidence = Math.min(100, base + (agreeing.length - 1) * 6 - conflicts.length * 15);
  }
  confidence = Math.max(0, Math.min(100, Math.round(confidence)));

  const currency = CURRENCY_BY_REGION[region];
  const upiEligible = currency === "INR";

  return {
    region,
    currency,
    decidedBy,
    reason,
    confidence,
    signals: evidence,
    conflicts,
    upiEligible,
    upiUnavailableReason: upiEligible
      ? null
      : `Razorpay only offers UPI, Netbanking, Wallets and EMI on INR orders. This order resolves to ` +
        `${region} (${currency}) because: ${reason}`,
  };
}
