/**
 * FoundOurMarket™ Factory Reset — deletion target tables.
 *
 * Pure data module (no server imports) so the server-function file stays a
 * thin wrapper. Ordered child-table-first so foreign keys stay valid.
 *
 * NOTHING here touches marketplace structure: products, catalog, variants,
 * images, intelligence, flash deal config, coupons, CMS, SEO, shipping, tax,
 * payment gateways, site rules, themes, storage buckets and schema are all
 * intentionally absent from every list below.
 */

/** [table, a NOT NULL key column used as the delete predicate] */
export type Target = [table: string, key: string];

/** Customer-generated activity (orders, carts, reviews, engagement). */
export const CORE: Target[] = [
  ["order_items", "id"],
  ["order_attributions", "order_id"],
  ["refunds", "id"],
  ["return_items", "id"],
  ["returns", "id"],
  ["shipment_events", "id"],
  ["shipments", "id"],
  ["courier_webhook_events", "id"],
  ["tokenization_logs", "id"],
  ["payments", "id"],
  ["orders", "id"],
  ["cart_items", "id"],
  ["carts", "id"],
  ["wishlist_activity_logs", "id"],
  ["wishlist_price_alerts", "id"],
  ["wishlist_restock_alerts", "id"],
  ["wishlist_notification_preferences", "user_id"],
  ["wishlist", "id"],
  ["review_votes", "id"],
  ["review_reports", "id"],
  ["product_rating_audit", "id"],
  ["product_reviews", "id"],
  ["product_answer_votes", "id"],
  ["product_answers", "id"],
  ["product_questions", "id"],
  ["notifications", "id"],
  ["badge_events", "id"],
  ["flash_deal_events", "id"],
  ["recommendation_events", "id"],
  ["recommendation_scores", "user_id"],
  ["personalized_feed_cache", "user_id"],
  ["ai_recommendation_feedback", "id"],
  ["experiment_assignments", "id"],
  ["attribution_touches", "id"],
  ["campaign_events", "id"],
  ["addresses", "id"],
  ["saved_payment_methods", "id"],
  ["razorpay_customers", "id"],
  ["account_locks", "id"],
  ["customer_notes", "id"],
  ["customer_tags", "id"],
  ["region_change_requests", "id"],
  ["region_assignment_history", "id"],
  ["fraud_actions", "id"],
  ["fraud_alerts", "id"],
  ["email_logs", "id"],
  ["email_send_log", "id"],
  ["email_send_state", "id"],
  ["email_unsubscribe_tokens", "id"],
  ["suppressed_emails", "id"],
  ["email_preferences", "user_id"],
  ["webhook_logs", "id"],
  ["inventory_logs", "id"],
];

export const SUPPORT: Target[] = [
  ["support_attachments", "id"],
  ["support_internal_notes", "id"],
  ["support_email_events", "id"],
  ["support_ticket_events", "id"],
  ["support_ticket_ratings", "id"],
  ["support_ticket_reads", "id"],
  ["support_notifications", "id"],
  ["support_messages", "id"],
  ["support_tickets", "id"],
  ["support_agent_presence", "user_id"],
];

export const ANALYTICS: Target[] = [
  ["analytics_events", "id"],
  ["page_views", "id"],
  ["visitor_sessions", "session_id"],
  ["search_logs", "id"],
];

export const WAITLIST: Target[] = [["international_waitlist", "id"]];

export const NEWSLETTER: Target[] = [
  ["newsletter_submission_attempts", "id"],
  ["newsletter_audit_log", "id"],
  ["newsletter_subscribers", "id"],
];

/** Vendor / seller accounts and their derived records. */
export const VENDORS: Target[] = [
  ["vendor_support_tickets", "id"],
  ["vendor_analytics", "id"],
  ["vendor_commissions", "id"],
  ["vendor_payouts", "id"],
  ["vendor_products", "id"],
  ["vendors", "id"],
];

/** Operational history & audit trails (schema and config untouched). */
export const LOGS: Target[] = [
  ["admin_activity_logs", "id"],
  ["admin_notification_prefs", "user_id"],
  ["media_audit_logs", "id"],
  ["duplicate_detection_events", "id"],
  ["flash_deal_audit_log", "id"],
  ["automation_executions", "id"],
  ["marketing_campaign_alerts", "id"],
  ["editor_drafts", "id"],
  ["seed_runs", "id"],
  ["role_change_logs", "id"],
];

/** Identity: every profile and role assignment. */
export const IDENTITY: Target[] = [
  ["user_roles", "user_id"],
  ["profiles", "id"],
];

export const ALL_GROUPS: { key: string; label: string; targets: Target[] }[] = [
  { key: "core", label: "Customer activity", targets: CORE },
  { key: "support", label: "Support & messages", targets: SUPPORT },
  { key: "analytics", label: "Analytics & sessions", targets: ANALYTICS },
  { key: "waitlist", label: "Waitlist", targets: WAITLIST },
  { key: "newsletter", label: "Newsletter", targets: NEWSLETTER },
  { key: "vendors", label: "Vendors & sellers", targets: VENDORS },
  { key: "logs", label: "Activity & audit logs", targets: LOGS },
  { key: "identity", label: "Profiles & roles", targets: IDENTITY },
];

/** Full ordered deletion plan. */
export const FACTORY_PLAN: Target[] = [
  ...SUPPORT,
  ...CORE,
  ...ANALYTICS,
  ...WAITLIST,
  ...NEWSLETTER,
  ...VENDORS,
  ...LOGS,
  ...IDENTITY,
];

export const FACTORY_PHRASE = "DELETE ALL ADMINS AND RESET MARKETPLACE";

/** Preserved surfaces, shown in the UI. */
export const PRESERVED = [
  "Products", "Categories", "Brands", "Variants", "Inventory", "Product images",
  "Product AI analysis", "Catalog Intelligence", "Marketplace Intelligence",
  "Image Intelligence", "Recommendation Engine", "AI models", "Flash Deal config",
  "Coupons", "Marketplace settings", "Site Rules", "Themes", "CMS pages", "SEO",
  "Shipping config", "Tax config", "Payment gateways", "Security config",
  "RLS policies", "Schema, functions & triggers", "Storage buckets",
];
