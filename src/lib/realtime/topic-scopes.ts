/**
 * Realtime topic scope map — DOCUMENTATION + FUTURE-READY SCAFFOLDING ONLY.
 *
 * ⚠️ THIS MODULE IS INERT. It is not imported by any runtime code path and it
 * does NOT change who can subscribe to what today. Authorization for realtime
 * subscriptions is enforced exclusively by the `fom_realtime_select` /
 * `fom_realtime_anon_select` RLS policies on `realtime.messages`.
 *
 * Why it exists
 * -------------
 * Security audit finding `realtime_admin_wildcard_topics_broad` observed that
 * every `admin` / `manager` / `super_admin` can subscribe to all staff topics
 * (`financial-%`, `fraud-%`, `exec-%`, `cust-intel%`, ...). That is the
 * intended platform design today: staff dashboards are role-gated, not
 * topic-gated. Rather than tightening (and breaking) live dashboards, we
 * declare the intended *scope* of each topic family here so a future
 * per-scope permission model (e.g. a `staff_topic_grants` table checked by the
 * RLS policy) can be introduced without re-deriving this classification.
 *
 * Activating it later means: (1) persist grants per user, (2) reference them
 * from the realtime RLS policy, (3) keep the current role check as fallback.
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

type TopicRule = {
  /** Matcher against the raw realtime topic string. */
  match: (topic: string) => boolean;
  scope: RealtimeScope;
  /** Audience enforced *today* by RLS. */
  audience: 'anon' | 'authenticated' | 'staff';
};

const prefix = (p: string) => (topic: string) => topic.startsWith(p);
const exact = (t: string) => (topic: string) => topic === t;

/**
 * Public storefront topics. Everything here is data already rendered on public
 * pages (finding `realtime_anon_read_only_catalog_topics`): no customer data,
 * no payments, no vendor data, no cost/inventory secrets, no admin surfaces.
 */
export const PUBLIC_CATALOG_TOPIC_RULES: TopicRule[] = [
  { match: prefix('rt-product'), scope: 'catalog.read', audience: 'anon' },
  { match: prefix('rt-banners-'), scope: 'catalog.read', audience: 'anon' },
  { match: prefix('rt-cms-'), scope: 'catalog.read', audience: 'anon' },
  { match: exact('categories-live'), scope: 'catalog.read', audience: 'anon' },
  { match: exact('rt-testimonials'), scope: 'catalog.read', audience: 'anon' },
  { match: exact('rt-announcements'), scope: 'catalog.read', audience: 'anon' },
  { match: exact('rt-homepage-sections'), scope: 'catalog.read', audience: 'anon' },
  { match: exact('rt-storefront-blocks'), scope: 'catalog.read', audience: 'anon' },
  { match: exact('rt-flash-deals'), scope: 'catalog.read', audience: 'anon' },
  { match: exact('store-settings-live'), scope: 'catalog.read', audience: 'anon' },
];

/** Staff topics, grouped by the scope a future model would require. */
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
  { match: prefix('mkt-'), scope: 'marketing.read', audience: 'staff' },
  { match: prefix('cust-mkt'), scope: 'marketing.read', audience: 'staff' },
  { match: prefix('customer-marketing'), scope: 'marketing.read', audience: 'staff' },
  { match: exact('support-settings-live'), scope: 'support.read', audience: 'staff' },
];

/**
 * Classify a topic for reporting/audit purposes. Returns `undefined` for
 * topics that are owner-scoped or otherwise not covered by the maps above.
 * Never use this for authorization — RLS is the only enforcement point.
 */
export function classifyRealtimeTopic(topic: string): TopicRule | undefined {
  return (
    PUBLIC_CATALOG_TOPIC_RULES.find((r) => r.match(topic)) ??
    STAFF_TOPIC_RULES.find((r) => r.match(topic))
  );
}

/** True when a topic is part of the public storefront catalog surface. */
export function isPublicCatalogTopic(topic: string): boolean {
  return PUBLIC_CATALOG_TOPIC_RULES.some((r) => r.match(topic));
}
