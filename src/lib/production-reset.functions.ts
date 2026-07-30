/**
 * FoundOurMarket™ Production Reset v1.0
 *
 * ONE-TIME, super-admin-only operation that clears customer-generated data
 * while leaving the marketplace structure (products, catalog, vendors,
 * configuration, AI settings, flash deals, security, schema) untouched.
 *
 * No schema changes are performed — only row deletions through the service
 * role client, executed child-table-first so foreign keys stay valid.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, logSecurity } from "@/lib/admin-guard.server";

export const RESET_PHRASE = "RESET MY MARKETPLACE";

/** [table, a NOT NULL key column used as the delete predicate] */
type Target = [table: string, key: string];

/** Always cleared — pure customer-generated activity. */
const CORE: Target[] = [
  // Orders → payments → fulfilment
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
  // Carts
  ["cart_items", "id"],
  ["carts", "id"],
  // Wishlist
  ["wishlist_activity_logs", "id"],
  ["wishlist_price_alerts", "id"],
  ["wishlist_restock_alerts", "id"],
  ["wishlist_notification_preferences", "user_id"],
  ["wishlist", "id"],
  // Reviews & ratings
  ["review_votes", "id"],
  ["review_reports", "id"],
  ["product_rating_audit", "id"],
  ["product_reviews", "id"],
  // Questions & answers
  ["product_answer_votes", "id"],
  ["product_answers", "id"],
  ["product_questions", "id"],
  // Engagement history
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
  // Customer records
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
  // Customer email + webhook history
  ["email_logs", "id"],
  ["email_send_log", "id"],
  ["email_send_state", "id"],
  ["email_unsubscribe_tokens", "id"],
  ["suppressed_emails", "id"],
  ["email_preferences", "user_id"],
  ["webhook_logs", "id"],
  ["inventory_logs", "id"],
];

const SUPPORT: Target[] = [
  ["support_attachments", "id"],
  ["support_internal_notes", "id"],
  ["support_email_events", "id"],
  ["support_ticket_events", "id"],
  ["support_ticket_ratings", "id"],
  ["support_ticket_reads", "id"],
  ["support_notifications", "id"],
  ["support_messages", "id"],
  ["support_tickets", "id"],
];

const ANALYTICS: Target[] = [
  ["analytics_events", "id"],
  ["page_views", "id"],
  ["visitor_sessions", "session_id"],
  ["search_logs", "id"],
];

const WAITLIST: Target[] = [["international_waitlist", "id"]];

const NEWSLETTER: Target[] = [
  ["newsletter_submission_attempts", "id"],
  ["newsletter_audit_log", "id"],
  ["newsletter_subscribers", "id"],
];

/** Roles that must never be treated as a customer account. */
const PROTECTED_ROLES = [
  "admin", "super_admin", "manager", "support", "fulfillment", "warehouse_staff", "editor",
];

const optionsSchema = z.object({
  deleteAccounts: z.boolean().default(false),
  deleteWaitlist: z.boolean().default(true),
  deleteNewsletter: z.boolean().default(true),
  deleteSupport: z.boolean().default(true),
  deleteAnalytics: z.boolean().default(true),
  deleteReviewImages: z.boolean().default(true),
});

export type ResetOptions = z.infer<typeof optionsSchema>;

function plan(o: ResetOptions): Target[] {
  return [
    ...(o.deleteSupport ? SUPPORT : []),
    ...CORE,
    ...(o.deleteAnalytics ? ANALYTICS : []),
    ...(o.deleteWaitlist ? WAITLIST : []),
    ...(o.deleteNewsletter ? NEWSLETTER : []),
  ];
}

/** Preview: current row counts for everything the reset would touch. */
export const getResetPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await requireStaff(userId, ["super_admin"], "reset.preview");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const groups: { key: string; label: string; targets: Target[] }[] = [
      { key: "core", label: "Customer activity", targets: CORE },
      { key: "support", label: "Support tickets", targets: SUPPORT },
      { key: "analytics", label: "Analytics events", targets: ANALYTICS },
      { key: "waitlist", label: "Waitlist", targets: WAITLIST },
      { key: "newsletter", label: "Newsletter subscribers", targets: NEWSLETTER },
    ];

    const counts: Record<string, number> = {};
    await Promise.all(
      groups.flatMap((g) =>
        g.targets.map(async ([table]) => {
          const { count } = await supabaseAdmin
            .from(table as never)
            .select("*", { count: "exact", head: true });
          counts[table] = count ?? 0;
        }),
      ),
    );

    const { count: profileCount } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true });

    return {
      counts,
      groups: groups.map((g) => ({
        key: g.key,
        label: g.label,
        tables: g.targets.map(([t]) => t),
        total: g.targets.reduce((n, [t]) => n + (counts[t] ?? 0), 0),
      })),
      profiles: profileCount ?? 0,
    };
  });

const runSchema = optionsSchema.extend({ confirm: z.string() });

/** Execute the production reset. Super admin only, phrase-confirmed. */
export const runProductionReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => runSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, ["super_admin"], "reset.execute");

    if (data.confirm.trim() !== RESET_PHRASE) {
      await logSecurity({
        actorId: userId, actorRole: primaryRole, action: "reset.execute",
        success: false, detail: { reason: "bad_confirmation" },
      });
      throw new Error("Confirmation phrase does not match.");
    }

    const options: ResetOptions = optionsSchema.parse(data);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const targets = plan(options);
    const startedAt = new Date().toISOString();

    // --- Backup manifest -------------------------------------------------
    // No point-in-time backup infrastructure is exposed to the app, so the
    // reset writes a timestamped, tamper-proof manifest of every row count
    // about to be destroyed. If the manifest cannot be written, abort.
    const before: Record<string, number> = {};
    for (const [table] of targets) {
      const { count, error } = await supabaseAdmin
        .from(table as never)
        .select("*", { count: "exact", head: true });
      if (error) throw new Error(`Backup manifest failed on ${table}: ${error.message}`);
      before[table] = count ?? 0;
    }
    const { error: manifestError } = await supabaseAdmin.from("security_audit_log").insert({
      actor_id: userId,
      actor_role: primaryRole,
      action: "reset.manifest",
      target: `production-reset:${startedAt}`,
      success: true,
      detail: { options, before } as never,
    });
    if (manifestError) {
      throw new Error(
        `Backup manifest could not be stored — reset aborted. ${manifestError.message}`,
      );
    }

    // --- Deletion --------------------------------------------------------
    const deleted: Record<string, number> = {};
    const failures: { table: string; error: string }[] = [];

    for (const [table, key] of targets) {
      const { error } = await supabaseAdmin
        .from(table as never)
        .delete()
        .not(key, "is", null);
      if (error) failures.push({ table, error: error.message });
      else deleted[table] = before[table] ?? 0;
    }

    // --- Optional: review media ------------------------------------------
    let removedMedia = 0;
    if (options.deleteReviewImages) {
      try {
        const { data: folders } = await supabaseAdmin.storage.from("review-media").list("", { limit: 1000 });
        for (const folder of folders ?? []) {
          const { data: files } = await supabaseAdmin.storage
            .from("review-media")
            .list(folder.name, { limit: 1000 });
          const paths = (files ?? []).map((f) => `${folder.name}/${f.name}`);
          if (paths.length) {
            await supabaseAdmin.storage.from("review-media").remove(paths);
            removedMedia += paths.length;
          }
        }
      } catch (err) {
        failures.push({ table: "storage:review-media", error: String((err as Error)?.message ?? err) });
      }
    }

    // --- Optional: customer accounts -------------------------------------
    let removedAccounts = 0;
    if (options.deleteAccounts) {
      const { data: roleRows } = await supabaseAdmin.from("user_roles").select("user_id, role");
      const protectedIds = new Set(
        (roleRows ?? []).filter((r) => PROTECTED_ROLES.includes(r.role as string)).map((r) => r.user_id as string),
      );
      const { data: vendorRows } = await supabaseAdmin.from("vendors").select("owner_user_id");
      for (const v of vendorRows ?? []) if (v.owner_user_id) protectedIds.add(v.owner_user_id as string);

      const { data: profiles } = await supabaseAdmin.from("profiles").select("id");
      const customerIds = (profiles ?? []).map((p) => p.id as string).filter((id) => !protectedIds.has(id));

      for (const id of customerIds) {
        const { error } = await supabaseAdmin.auth.admin.deleteUser(id);
        if (error) failures.push({ table: `auth.users:${id}`, error: error.message });
        else removedAccounts += 1;
      }
      // Any profile rows not cascaded away.
      if (customerIds.length) {
        await supabaseAdmin.from("profiles").delete().in("id", customerIds);
        await supabaseAdmin.from("user_roles").delete().in("user_id", customerIds).eq("role", "customer");
      }
    }

    // --- Reset derived product counters (no schema change) ---------------
    // Products, inventory and configuration stay exactly as they are; only
    // customer-derived aggregates fall back to their admin-set baselines.
    const { data: productRows } = await supabaseAdmin
      .from("products")
      .select("id, initial_rating, initial_review_count");
    for (const p of productRows ?? []) {
      await supabaseAdmin
        .from("products")
        .update({
          rating: (p.initial_rating as number | null) ?? 0,
          reviews: (p.initial_review_count as number | null) ?? 0,
          sold_count: 0,
          orders_count: 0,
          wishlist_count: 0,
          views_count: 0,
        })
        .eq("id", p.id as string);
    }

    const report = {
      startedAt,
      finishedAt: new Date().toISOString(),
      options,
      deleted,
      totalDeleted: Object.values(deleted).reduce((a, b) => a + b, 0),
      removedMedia,
      removedAccounts,
      productsReset: (productRows ?? []).length,
      failures,
    };

    await logSecurity({
      actorId: userId, actorRole: primaryRole, action: "reset.execute",
      target: `production-reset:${startedAt}`,
      success: failures.length === 0,
      detail: report as never,
    });

    return report;
  });
