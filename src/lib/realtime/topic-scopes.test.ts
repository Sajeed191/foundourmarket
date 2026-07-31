/**
 * Defensive tests for security finding `realtime_anon_read_only_catalog_topics`.
 * Run with:  bun run src/lib/realtime/topic-scopes.test.ts
 * (No test framework installed; plain assertions, exits non-zero on failure.)
 *
 * These assert the *documented* public realtime surface never grows to include
 * sensitive topic families. RLS on realtime.messages remains the enforcement
 * point; this guards the documentation/classification from silent drift.
 */
import {
  PUBLIC_CATALOG_TOPIC_RULES,
  STAFF_TOPIC_RULES,
  classifyRealtimeTopic,
  isPublicCatalogTopic,
} from "./topic-scopes";

let failed = 0;
function assert(cond: unknown, msg: string) {
  if (!cond) {
    failed++;
    console.error("✗", msg);
  } else {
    console.log("✓", msg);
  }
}

const publicTopics = [
  "rt-products",
  "rt-product-123",
  "rt-banners-home",
  "rt-cms-page",
  "categories-live",
  "rt-testimonials",
  "rt-announcements",
  "rt-homepage-sections",
  "rt-storefront-blocks",
  "rt-flash-deals",
  "store-settings-live",
];

for (const topic of publicTopics) {
  assert(isPublicCatalogTopic(topic), `${topic} is classified as public catalog`);
  assert(
    classifyRealtimeTopic(topic)?.audience === "anon",
    `${topic} audience is anon`,
  );
}

const sensitiveTopics = [
  "financial-summary",
  "fin-daily",
  "fraud-alerts",
  "exec-overview",
  "cust-intel-live",
  "user-intel-9",
  "orders-live",
  "order-drawer-1",
  "pay-drawer-1",
  "payment-gateways-live",
  "analytics-live",
  "traffic-live",
  "notifications:abc",
  "rt-cart-abc",
  "support-thread:abc",
  "admin-inventory",
];

for (const topic of sensitiveTopics) {
  assert(!isPublicCatalogTopic(topic), `${topic} is never exposed to anon`);
}

assert(
  PUBLIC_CATALOG_TOPIC_RULES.every(
    (r) => r.scope === "catalog.read" && r.audience === "anon",
  ),
  "every public rule is catalog.read / anon",
);

assert(
  STAFF_TOPIC_RULES.every((r) => r.audience === "staff" && r.scope !== "catalog.read"),
  "every staff rule is staff-audience and non-catalog",
);

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll realtime topic-scope assertions passed");
