/**
 * FoundOurMarket™ Factory Reset v1.0 — server-only implementation.
 *
 * DEVELOPMENT-ONLY full wipe: removes every user (customers, vendors, staff,
 * admins, super admins) plus all user-generated data, while leaving products,
 * catalog, intelligence, configuration, storage buckets and schema untouched.
 *
 * No schema changes are performed — row deletions and Auth Admin API calls only.
 */
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logSecurity } from "@/lib/admin-guard.server";
import {
  ALL_GROUPS,
  FACTORY_PHRASE,
  FACTORY_PLAN,
  type Target,
} from "@/lib/factory-reset.tables";

export type FactoryOptions = {
  keepEmergencyAdmin: boolean;
  deleteReviewImages: boolean;
};

export type FactoryReport = {
  startedAt: string;
  finishedAt: string;
  options: FactoryOptions;
  deleted: Record<string, number>;
  totalDeleted: number;
  removedAccounts: number;
  keptAccount: string | null;
  removedMedia: number;
  productsReset: number;
  failures: { table: string; error: string }[];
  validation: Record<string, number | boolean>;
};

async function countRows(table: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from(table as never)
    .select("*", { count: "exact", head: true });
  return count ?? 0;
}

export async function buildPreview() {
  const counts: Record<string, number> = {};
  await Promise.all(
    ALL_GROUPS.flatMap((g) =>
      g.targets.map(async ([table]) => {
        counts[table] = await countRows(table);
      }),
    ),
  );

  let authUsers = 0;
  let page = 1;
  for (;;) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    const users = data?.users ?? [];
    authUsers += users.length;
    if (users.length < 1000) break;
    page += 1;
  }

  const { data: roleRows } = await supabaseAdmin.from("user_roles").select("role");
  const superAdmins = (roleRows ?? []).filter((r) => r.role === "super_admin").length;

  return {
    counts,
    groups: ALL_GROUPS.map((g) => ({
      key: g.key,
      label: g.label,
      tables: g.targets.map(([t]) => t),
      total: g.targets.reduce((n, [t]) => n + (counts[t] ?? 0), 0),
    })),
    authUsers,
    superAdmins,
    products: await countRows("products"),
  };
}

/** Re-authenticate the caller with their password (step 2 of the safety gate). */
export async function verifyPassword(email: string, password: string): Promise<boolean> {
  const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
  const client = createClient(process.env.SUPABASE_URL!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { error } = await client.auth.signInWithPassword({ email, password });
  return !error;
}

async function deleteAllAuthUsers(keepId: string | null) {
  let removed = 0;
  const failures: { table: string; error: string }[] = [];
  for (;;) {
    const { data } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const users = (data?.users ?? []).filter((u) => u.id !== keepId);
    if (users.length === 0) break;
    for (const u of users) {
      const { error } = await supabaseAdmin.auth.admin.deleteUser(u.id);
      if (error) failures.push({ table: `auth.users:${u.id}`, error: error.message });
      else removed += 1;
    }
    if (users.length < 1000) break;
  }
  return { removed, failures };
}

export async function executeFactoryReset(
  actorId: string,
  actorEmail: string | null,
  actorRole: string,
  options: FactoryOptions,
): Promise<FactoryReport> {
  const startedAt = new Date().toISOString();
  const targets: Target[] = FACTORY_PLAN;

  // --- Backup manifest (abort on failure) ------------------------------
  const before: Record<string, number> = {};
  for (const [table] of targets) {
    const { count, error } = await supabaseAdmin
      .from(table as never)
      .select("*", { count: "exact", head: true });
    if (error) throw new Error(`Backup manifest failed on ${table}: ${error.message}`);
    before[table] = count ?? 0;
  }
  const { error: manifestError } = await supabaseAdmin.from("security_audit_log").insert({
    actor_id: actorId,
    actor_role: actorRole,
    action: "factory_reset.manifest",
    target: `factory-reset:${startedAt}`,
    success: true,
    detail: { phrase: FACTORY_PHRASE, options, before, actorEmail } as never,
  });
  if (manifestError) {
    throw new Error(
      `Backup manifest could not be stored — factory reset aborted, nothing was deleted. ${manifestError.message}`,
    );
  }

  const failures: { table: string; error: string }[] = [];
  const deleted: Record<string, number> = {};

  // --- Auth accounts first (cascades clear dependent auth rows) --------
  const keepId = options.keepEmergencyAdmin ? actorId : null;
  const authResult = await deleteAllAuthUsers(keepId);
  failures.push(...authResult.failures);

  // --- Row deletion, child-table-first ---------------------------------
  for (const [table, key] of targets) {
    let q = supabaseAdmin.from(table as never).delete().not(key, "is", null);
    if (keepId && table === "profiles") q = q.neq("id", keepId);
    if (keepId && table === "user_roles") q = q.neq("user_id", keepId);
    const { error } = await q;
    if (error) failures.push({ table, error: error.message });
    else deleted[table] = before[table] ?? 0;
  }

  // --- Review media ------------------------------------------------------
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

  // --- Derived product counters back to their admin baselines -----------
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

  // --- Validation --------------------------------------------------------
  const { data: remaining } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const validation: Record<string, number | boolean> = {
    authUsers: (remaining?.users ?? []).length,
    profiles: await countRows("profiles"),
    userRoles: await countRows("user_roles"),
    orders: await countRows("orders"),
    reviews: await countRows("product_reviews"),
    payments: await countRows("payments"),
    notifications: await countRows("notifications"),
    productsPreserved: (productRows ?? []).length,
    categoriesPreserved: await countRows("categories"),
    productImagesPreserved: await countRows("product_images"),
    integrityOk: failures.length === 0,
  };

  const report: FactoryReport = {
    startedAt,
    finishedAt: new Date().toISOString(),
    options,
    deleted,
    totalDeleted: Object.values(deleted).reduce((a, b) => a + b, 0),
    removedAccounts: authResult.removed,
    keptAccount: keepId ? actorEmail : null,
    removedMedia,
    productsReset: (productRows ?? []).length,
    failures,
    validation,
  };

  // Final reset record — written after the audit trail was cleared, so it is
  // the only surviving audit entry, exactly as specified.
  await logSecurity({
    actorId,
    actorRole,
    action: "factory_reset.execute",
    target: `factory-reset:${startedAt}`,
    success: failures.length === 0,
    detail: report as unknown as Record<string, unknown>,
  });

  return report;
}
