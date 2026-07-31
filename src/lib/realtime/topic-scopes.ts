/**
 * Realtime topic scope map — DOCUMENTATION + REGRESSION GUARD ONLY.
 *
 * ⚠️ THIS MODULE IS INERT. It is not imported by any runtime code path and it
 * does NOT change who can subscribe to what. Authorization for realtime
 * subscriptions is enforced exclusively by these policies on
 * `realtime.messages` (verified against the live database):
 *
 *   • `fom_realtime_select_anon`  (SELECT, role `anon`)
 *       → 9 public storefront topic families only.
 *   • `fom_realtime_select`       (SELECT, role `authenticated`)
 *       → owner-scoped families (topic must embed `auth.uid()`), the public
 *         storefront families, and staff families gated by
 *         `has_any_role(auth.uid(), ['admin','super_admin','manager'])`.
 *         Terminal `ELSE false` — unknown topics are denied by default.
 *   • `fom_realtime_insert`       (INSERT, role `authenticated`)
 *       → staff only, and only for `live-%` / `activity-feed`. `anon` has NO
 *         insert policy, so anonymous clients can never broadcast.
 *
 * Findings this module documents
 * ------------------------------
 * 1. `realtime_admin_wildcard_topics_broad` — staff topics are role-gated, not
 *    topic-gated, so any admin/manager/super_admin receives finance, fraud,
 *    executive and customer-intelligence streams. That is the intended design
 *    (single staff trust tier). The `RealtimeScope` taxonomy below is the
 *    future-ready, backward-compatible upgrade path: persist per-user grants
 *    in a `staff_topic_grants` table, reference it from the RLS policy as
 *    `has_topic_scope(auth.uid(), scope) OR has_any_role(...)` so the existing
 *    role check remains a fallback and no deployment changes behavior.
 * 2. `realtime_anon_read_only_catalog_topics` — the anon allow-list carries
 *    only data already rendered on public pages. No orders, payments,
 *    customers, vendors, inventory, costs, internal analytics, admin events,
 *    draft products or unpublished content are reachable; drafts are
 *    additionally filtered by the underlying tables' own RLS.
 *
 * The tests in `topic-scopes.test.ts` assert this map stays in parity with the
 * deployed policy, so a future topic cannot silently widen the public surface.
 */

/** Fine-grained permission names reserved for a future topic-level model. */
export const REALTIME_SCOPES = [
  'catalog.read',
  'finance.read',
  'fraud.read',
  'orders.read',
  'customers.read',
  'executive.read',
  'traffic.read',
  'marketing.read',
  'support.read',
  'ops.read',
  'self.read',
] as const;

export type RealtimeScope = (typeof REALTIME_SCOPES)[number];

/**
 * Audience enforced *today* by RLS:
 *  - `anon`          : readable by signed-out visitors (and everyone above).
 *  - `authenticated` : public data, but only served to signed-in sessions.
 *  - `owner`         : topic string must embed the subscriber's own user id.
 *  - `staff`         : requires admin / manager / super_admin.
 */
export type TopicAudience = 'anon' | 'authenticated' | 'owner' | 'staff';

export type TopicRule = {
  /** Matcher against the raw realtime topic string. */
  match: (topic: string) => boolean;
  scope: RealtimeScope;
  audience: TopicAudience;
};

const prefix = (p: string) => (topic: string) => topic.startsWith(p);
const exact = (t: string) => (topic: string) => topic === t;

/**
 * Public storefront topics reachable by anonymous visitors. Mirrors
 * `fom_realtime_select_anon` exactly. Adding an entry here without adding the
 * matching branch to that policy (or vice versa) is a security regression.
 */
export const PUBLIC_CATALOG_TOPIC_RULES: TopicRule[] = [
  { match: prefix('rt-products'), scope: 'catalog.read', audience: 'anon' },
  { match: prefix('rt-banners-'), scope: 'catalog.read', audience: 'anon' },
  { match: prefix('rt-cms-'), scope: 'catalog.read', audience: 'anon' },
  { match: prefix('reviews:'), scope: 'catalog.read', audience: 'anon' },
  { match: exact('categories-live'), scope: 'catalog.read', audience: 'anon' },
  { match: exact('rt-testimonials'), scope: 'catalog.read', audience: 'anon' },
  { match: exact('rt-announcements'), scope: 'catalog.read', audience: 'anon' },
  { match: exact('rt-homepage-sections'), scope: 'catalog.read', audience: 'anon' },
  { match: exact('rt-storefront-blocks'), scope: 'catalog.read', audience: 'anon' },
];

/**
 * Public-natured catalog topics that the deployed policy only exposes to
 * signed-in sessions (they are NOT in the anon allow-list). Kept separate so
 * the anon surface stays auditable.
 */
export const AUTHENTICATED_CATALOG_TOPIC_RULES: TopicRule[] = [
  { match: prefix('rt-product'), scope: 'catalog.read', audience: 'authenticated' },
  { match: exact('rt-flash-deals'), scope: 'catalog.read', audience: 'authenticated' },
  { match: exact('store-settings-live'), scope: 'catalog.read', audience: 'authenticated' },
  { match: exact('rt-badge-settings'), scope: 'catalog.read', audience: 'authenticated' },
];

/**
 * Owner-scoped topics: the policy requires the topic string to contain the
 * subscriber's own `auth.uid()` (or, for support threads, passes through the
 * `can_access_support_thread` SECURITY DEFINER check).
 */
export const OWNER_TOPIC_RULES: TopicRule[] = [
  { match: prefix('notifications:'), scope: 'self.read', audience: 'owner' },
  { match: prefix('addresses:'), scope: 'self.read', audience: 'owner' },
  { match: prefix('account-orders:'), scope: 'self.read', audience: 'owner' },
  { match: prefix('spm-'), scope: 'self.read', audience: 'owner' },
  { match: prefix('support-tickets:'), scope: 'self.read', audience: 'owner' },
  { match: prefix('support-thread:'), scope: 'self.read', audience: 'owner' },
  { match: prefix('wishlist-alerts-'), scope: 'self.read', audience: 'owner' },
  { match: prefix('chat-orders:'), scope: 'self.read', audience: 'owner' },
  { match: prefix('rt-cart-'), scope: 'self.read', audience: 'owner' },
];

/** Staff topics, grouped by the scope a future per-topic model would require. */
export const STAFF_TOPIC_RULES: TopicRule[] = [
  { match: prefix('fin-'), scope: 'finance.read', audience: 'staff' },
  { match: prefix('financial-'), scope: 'finance.read', audience: 'staff' },
  { match: exact('payment-gateways-live'), scope: 'finance.read', audience: 'staff' },
  { match: prefix('pay-drawer-'), scope: 'finance.read', audience: 'staff' },
  { match: prefix('fraud-'), scope: 'fraud.read', audience: 'staff' },
  { match: exact('orders-live'), scope: 'orders.read', audience: 'staff' },
  { match: prefix('order-drawer-'), scope: 'orders.read', audience: 'staff' },
  { match: prefix('order-ops-'), scope: 'orders.read', audience: 'staff' },
  { match: exact('shipment-command-center'), scope: 'orders.read', audience: 'staff' },
  { match: prefix('cust-intel'), scope: 'customers.read', audience: 'staff' },
  { match: prefix('user-intel-'), scope: 'customers.read', audience: 'staff' },
  { match: prefix('exec-'), scope: 'executive.read', audience: 'staff' },
  { match: prefix('traffic-'), scope: 'traffic.read', audience: 'staff' },
  { match: exact('analytics-live'), scope: 'traffic.read', audience: 'staff' },
  { match: exact('storefront-dashboard'), scope: 'traffic.read', audience: 'staff' },
  { match: prefix('mkt-'), scope: 'marketing.read', audience: 'staff' },
  { match: prefix('cust-mkt'), scope: 'marketing.read', audience: 'staff' },
  { match: prefix('customer-marketing'), scope: 'marketing.read', audience: 'staff' },
  { match: prefix('inventory-marketing'), scope: 'marketing.read', audience: 'staff' },
  { match: prefix('product-marketing'), scope: 'marketing.read', audience: 'staff' },
  { match: prefix('marketplace'), scope: 'ops.read', audience: 'staff' },
  { match: exact('rt-campaign-events'), scope: 'marketing.read', audience: 'staff' },
  { match: exact('rt-growth-center'), scope: 'marketing.read', audience: 'staff' },
  { match: exact('support-settings-live'), scope: 'support.read', audience: 'staff' },
  { match: prefix('ai-ops-'), scope: 'ops.read', audience: 'staff' },
  { match: prefix('ai-fb-'), scope: 'ops.read', audience: 'staff' },
  { match: prefix('admin-'), scope: 'ops.read', audience: 'staff' },
  { match: prefix('live-'), scope: 'ops.read', audience: 'staff' },
  { match: exact('activity-feed'), scope: 'ops.read', audience: 'staff' },
  { match: exact('intel-rt'), scope: 'ops.read', audience: 'staff' },
  { match: exact('dash-draft-activity'), scope: 'ops.read', audience: 'staff' },
  { match: exact('bulk-visibility'), scope: 'ops.read', audience: 'staff' },
  { match: exact('category-cms'), scope: 'ops.read', audience: 'staff' },
  { match: exact('rt-cms-posts-list'), scope: 'ops.read', audience: 'staff' },
];

/** Topic families that must NEVER be reachable by anonymous visitors. */
export const SENSITIVE_SCOPES: RealtimeScope[] = [
  'finance.read',
  'fraud.read',
  'orders.read',
  'customers.read',
  'executive.read',
  'traffic.read',
  'marketing.read',
  'support.read',
  'ops.read',
  'self.read',
];

/**
 * Classify a topic for reporting/audit purposes. Ordered most-restrictive-first
 * so owner/staff families always win over a loose catalog prefix.
 * Never use this for authorization — RLS is the only enforcement point.
 */
export function classifyRealtimeTopic(topic: string): TopicRule | undefined {
  return (
    OWNER_TOPIC_RULES.find((r) => r.match(topic)) ??
    STAFF_TOPIC_RULES.find((r) => r.match(topic)) ??
    PUBLIC_CATALOG_TOPIC_RULES.find((r) => r.match(topic)) ??
    AUTHENTICATED_CATALOG_TOPIC_RULES.find((r) => r.match(topic))
  );
}

/** True when a topic is part of the anonymous public storefront surface. */
export function isPublicCatalogTopic(topic: string): boolean {
  return PUBLIC_CATALOG_TOPIC_RULES.some((r) => r.match(topic));
}

/** True when a topic requires the staff trust tier under today's policy. */
export function isStaffTopic(topic: string): boolean {
  return STAFF_TOPIC_RULES.some((r) => r.match(topic));
}
