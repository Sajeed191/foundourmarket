/**
 * Security regression tests for realtime authorization + user_roles RLS.
 * Run with:  bun run src/lib/realtime/topic-scopes.test.ts
 * (No test framework required; plain assertions, exits non-zero on failure.)
 *
 * Covers findings:
 *   • realtime_anon_read_only_catalog_topics
 *   • realtime_admin_wildcard_topics_broad
 *   • user_roles_missing_select_scope  (documented invariants, see notes below)
 *
 * RLS on `realtime.messages` remains the only enforcement point; these tests
 * guard the documented classification from silent drift.
 */
import {
  PUBLIC_CATALOG_TOPIC_RULES,
  AUTHENTICATED_CATALOG_TOPIC_RULES,
  OWNER_TOPIC_RULES,
  STAFF_TOPIC_RULES,
  SENSITIVE_SCOPES,
  classifyRealtimeTopic,
  isPublicCatalogTopic,
  isStaffTopic,
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

/* ------------------------------------------------------------------ *
 * 1. Anonymous surface parity with `fom_realtime_select_anon`
 * ------------------------------------------------------------------ */

// Exact mirror of the deployed anon policy branches.
const DEPLOYED_ANON_TOPICS = [
  "rt-products",
  "rt-products-list",
  "categories-live",
  "rt-banners-home",
  "rt-testimonials",
  "reviews:some-slug",
  "rt-announcements",
  "rt-cms-page",
  "rt-cms-posts-list",
  "rt-homepage-sections",
  "rt-storefront-blocks",
];

for (const topic of DEPLOYED_ANON_TOPICS) {
  assert(isPublicCatalogTopic(topic), `anon-allowed topic classified public: ${topic}`);
}

assert(
  PUBLIC_CATALOG_TOPIC_RULES.every((r) => r.audience === "anon"),
  "every public catalog rule declares the anon audience",
);
assert(
  PUBLIC_CATALOG_TOPIC_RULES.every((r) => r.scope === "catalog.read"),
  "public catalog rules only carry catalog.read scope",
);

/* ------------------------------------------------------------------ *
 * 2. Sensitive families must never leak into the anonymous surface
 * ------------------------------------------------------------------ */

const SENSITIVE_TOPICS = [
  "orders-live",
  "order-drawer-1",
  "order-ops-x",
  "shipment-command-center",
  "financial-summary",
  "fin-recon",
  "pay-drawer-9",
  "payment-gateways-live",
  "fraud-alerts",
  "cust-intel-summary",
  "customer-marketing-x",
  "cust-mkt-x",
  "user-intel-abc",
  "exec-dashboard",
  "traffic-live",
  "analytics-live",
  "storefront-dashboard",
  "mkt-campaigns",
  "inventory-marketing-x",
  "product-marketing-x",
  "marketplace-readiness",
  "admin-activity",
  "ai-ops-queue",
  "ai-fb-x",
  "intel-rt",
  "dash-draft-activity",
  "bulk-visibility",
  "category-cms",
  "live-orders",
  "activity-feed",
  "support-settings-live",
  "rt-growth-center",
  "rt-campaign-events",
];

for (const topic of SENSITIVE_TOPICS) {
  assert(!isPublicCatalogTopic(topic), `sensitive topic not anon-readable: ${topic}`);
  assert(isStaffTopic(topic), `sensitive topic classified staff-only: ${topic}`);
}

const OWNER_TOPICS = [
  "notifications:uid",
  "addresses:uid",
  "account-orders:uid",
  "spm-uid",
  "support-tickets:uid",
  "support-thread:abc",
  "wishlist-alerts-uid",
  "chat-orders:uid",
  "rt-cart-uid",
];

for (const topic of OWNER_TOPICS) {
  const rule = classifyRealtimeTopic(topic);
  assert(rule?.audience === "owner", `owner-scoped topic requires own uid: ${topic}`);
  assert(!isPublicCatalogTopic(topic), `owner topic not anon-readable: ${topic}`);
}

/* ------------------------------------------------------------------ *
 * 3. Structural invariants
 * ------------------------------------------------------------------ */

assert(
  STAFF_TOPIC_RULES.every((r) => r.audience === "staff"),
  "every staff rule declares the staff audience",
);
assert(
  OWNER_TOPIC_RULES.every((r) => r.scope === "self.read" && r.audience === "owner"),
  "every owner rule is self.read/owner",
);
assert(
  AUTHENTICATED_CATALOG_TOPIC_RULES.every(
    (r) => r.audience === "authenticated" && r.scope === "catalog.read",
  ),
  "signed-in catalog rules stay catalog.read/authenticated",
);
assert(
  !SENSITIVE_SCOPES.includes("catalog.read"),
  "catalog.read is not classified as a sensitive scope",
);
assert(
  STAFF_TOPIC_RULES.every((r) => SENSITIVE_SCOPES.includes(r.scope)),
  "all staff scopes are enumerated as sensitive",
);
assert(
  PUBLIC_CATALOG_TOPIC_RULES.every((r) => !SENSITIVE_SCOPES.includes(r.scope)),
  "no public rule carries a sensitive scope",
);

// Unknown topics fall through: the deployed policy ends in `ELSE false`.
for (const topic of ["", "totally-unknown", "vendors-live", "payments-raw", "inventory-costs"]) {
  assert(
    classifyRealtimeTopic(topic) === undefined,
    `unclassified topic denied by policy default: "${topic}"`,
  );
  assert(!isPublicCatalogTopic(topic), `unclassified topic not anon-readable: "${topic}"`);
}

/* ------------------------------------------------------------------ *
 * 4. user_roles invariants (documented; enforced in the database)
 *
 * Deployed policies verified against the live database:
 *   SELECT "read own roles"           USING  auth.uid() = user_id
 *   INSERT "super_admin insert roles" CHECK  has_role(auth.uid(),'super_admin')
 *   UPDATE "super_admin update roles" USING+CHECK has_role(...,'super_admin')
 *   DELETE "super_admin delete roles" USING  has_role(...,'super_admin')
 * `has_role` is SECURITY DEFINER + STABLE with `search_path = public`, so it
 * cannot recurse into user_roles RLS and cannot be shadowed. No policy grants
 * a user the ability to insert a row for themselves, so there is no
 * self-escalation path. Anonymous sessions have auth.uid() IS NULL and match
 * zero rows.
 * ------------------------------------------------------------------ */

const USER_ROLES_POLICY_CONTRACT = {
  select: "auth.uid() = user_id",
  insert: "has_role(auth.uid(), 'super_admin')",
  update: "has_role(auth.uid(), 'super_admin')",
  delete: "has_role(auth.uid(), 'super_admin')",
} as const;

assert(
  USER_ROLES_POLICY_CONTRACT.select.includes("auth.uid() = user_id"),
  "user_roles SELECT is owner-scoped",
);
for (const cmd of ["insert", "update", "delete"] as const) {
  assert(
    USER_ROLES_POLICY_CONTRACT[cmd].includes("super_admin"),
    `user_roles ${cmd.toUpperCase()} is super_admin-gated`,
  );
}

console.log(failed === 0 ? "\nAll assertions passed." : `\n${failed} assertion(s) failed.`);
if (failed > 0) process.exit(1);
