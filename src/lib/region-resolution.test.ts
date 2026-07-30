/**
 * Dependency-free verification of Region Resolution v2.
 * Run with:  bun run src/lib/region-resolution.test.ts
 */
import { resolveMarketRegion } from "./region-resolution";

let passed = 0;
function assert(label: string, cond: boolean, extra?: unknown) {
  if (!cond) throw new Error(`FAILED: ${label} ${extra ? JSON.stringify(extra) : ""}`);
  passed++;
  console.log(`✓ ${label}`);
}

// 1. India user with India address
const a = resolveMarketRegion({ shippingCountry: "India", edgeCountry: "IN", locale: "en-IN", timezone: "Asia/Kolkata" });
assert("India user + India address → INR + UPI", a.region === "india" && a.currency === "INR" && a.upiEligible, a);

// 2. Existing India customer (locked profile)
const b = resolveMarketRegion({ selectedRegion: "india", selectedRegionTrusted: true, profileRegion: "india", shippingCountry: "IN" });
assert("Existing India customer → INR + UPI", b.currency === "INR" && b.upiEligible && b.decidedBy === "selected_region", b);

// 3. New India customer (no profile, geo-IP only)
const c = resolveMarketRegion({ edgeCountry: "IN" });
assert("New India customer (geo-IP) → INR + UPI", c.currency === "INR" && c.upiEligible && c.decidedBy === "edge_geo_country", c);

// 4. US customer
const d = resolveMarketRegion({ shippingCountry: "US", edgeCountry: "US" });
assert("US customer → USD, no UPI", d.region === "international" && d.currency === "USD" && !d.upiEligible, d);

// 5. UAE customer
const e = resolveMarketRegion({ shippingCountry: "AE", edgeCountry: "AE" });
assert("UAE customer → international/USD", e.region === "international" && e.currency === "USD", e);

// 6. UK customer
const f = resolveMarketRegion({ shippingCountry: "GB", edgeCountry: "GB" });
assert("UK customer → international/USD", f.region === "international" && f.currency === "USD", f);

// 7. Missing profile but India shipping address
const g = resolveMarketRegion({ shippingCountry: "India" });
assert("No profile + India shipping → INR", g.currency === "INR" && g.decidedBy === "shipping_country", g);

// 8. Missing profile but non-India shipping address
const h = resolveMarketRegion({ shippingCountry: "Germany" });
assert("No profile + non-India shipping → international", h.region === "international", h);

// 9. Missing all signals → platform fallback
const i = resolveMarketRegion({});
assert("No signals → fallback international/USD", i.region === "international" && i.decidedBy === "platform_fallback", i);
assert("Fallback explains itself", i.reason.includes("platform fallback"));

// Locked international profile is never overridden by an India shipping address
const j = resolveMarketRegion({ selectedRegion: "international", selectedRegionTrusted: true, profileRegion: "international", shippingCountry: "IN" });
assert("Locked international wins over India shipping", j.region === "international" && j.conflicts.includes("shipping_country"), j);

// Advisory client hints can never override a trusted signal
const k = resolveMarketRegion({ shippingCountry: "US", locale: "en-IN", timezone: "Asia/Kolkata" });
assert("Advisory hints cannot force INR", k.region === "international" && k.currency === "USD", k);

// Advisory hints DO decide when nothing trusted exists
const l = resolveMarketRegion({ locale: "hi-IN", timezone: "Asia/Kolkata" });
assert("Hints decide when no trusted signal", l.region === "india" && l.decidedBy === "browser_locale", l);

// Agreement raises confidence over a lone signal
assert("Agreement boosts confidence", a.confidence > c.confidence, { a: a.confidence, c: c.confidence });

console.log(`\nAll ${passed} region-resolution checks passed.`);
