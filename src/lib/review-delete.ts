/**
 * Reviews v7.3 — Review deletion with precise diagnostics.
 *
 * The customer delete path previously surfaced one generic message
 * ("Couldn't delete your review. Please try again.") for every failure mode,
 * which hid the real cause — most commonly an access token that expired while
 * the PDP sat idle for a few minutes, so the RPC reached Postgres as `anon`
 * and `hard_delete_own_review` raised "Not authenticated".
 *
 * This helper:
 *  - refreshes the Supabase session up-front when the access token is expired
 *    or about to expire, so an idle tab still deletes reliably;
 *  - retries exactly once after a forced refresh when the first attempt fails
 *    with an auth/JWT error;
 *  - treats "Review not found" as success (the row is already gone);
 *  - classifies every remaining failure into an actionable message and logs
 *    the exact Postgres/Postgrest error for debugging.
 *
 * No business logic, schema, moderation or rating behaviour is changed — the
 * same `hard_delete_own_review` / `admin_*_delete_review` functions run.
 */

import { supabase } from "@/integrations/supabase/client";

export type ReviewDeleteMode = "customer" | "admin_soft" | "admin_hard";

export type ReviewDeleteOutcome =
  | { ok: true; queued: boolean; alreadyGone: boolean }
  | { ok: false; message: string; retryable: boolean };

type PgLikeError = { message?: string; code?: string; details?: string; hint?: string; status?: number };

function asError(err: unknown): PgLikeError {
  if (!err) return {};
  if (typeof err === "string") return { message: err };
  const e = err as PgLikeError & { error_description?: string };
  return { message: e.message ?? e.error_description, code: e.code, details: e.details, hint: e.hint, status: e.status };
}

function isAuthError(e: PgLikeError): boolean {
  const msg = (e.message ?? "").toLowerCase();
  if (e.status === 401 || e.code === "PGRST301" || e.code === "42501") return true;
  return (
    msg.includes("jwt") ||
    msg.includes("token is expired") ||
    msg.includes("not authenticated") ||
    msg.includes("invalid claim") ||
    msg.includes("no api key") ||
    msg.includes("unauthorized")
  );
}

function isNotFound(e: PgLikeError): boolean {
  return (e.message ?? "").toLowerCase().includes("review not found");
}

function isForbidden(e: PgLikeError): boolean {
  const msg = (e.message ?? "").toLowerCase();
  return msg.includes("not authorised") || msg.includes("not authorized") || msg.includes("row-level security");
}

function isNetwork(e: PgLikeError): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = (e.message ?? "").toLowerCase();
  return /failed to fetch|network|load failed|timeout|aborted|connection/.test(msg);
}

function isServerDown(e: PgLikeError): boolean {
  const s = e.status ?? 0;
  if (s === 500 || s === 502 || s === 503 || s === 504 || s === 408 || s === 429) return true;
  return e.code === "PGRST002" || e.code === "PGRST103" || e.code === "57014" || e.code === "55P03";
}

/** Refresh the session when the access token is missing / expired / near expiry. */
async function ensureFreshSession(force = false): Promise<{ ok: boolean; signedIn: boolean }> {
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (!session) return { ok: false, signedIn: false };
    const expiresAt = (session.expires_at ?? 0) * 1000;
    const needs = force || !expiresAt || expiresAt - Date.now() < 60_000;
    if (!needs) return { ok: true, signedIn: true };
    const refreshed = await supabase.auth.refreshSession();
    if (refreshed.error || !refreshed.data.session) {
      return { ok: false, signedIn: true };
    }
    return { ok: true, signedIn: true };
  } catch {
    return { ok: false, signedIn: true };
  }
}

function classify(e: PgLikeError): { message: string; retryable: boolean } {
  if (isNetwork(e)) return { message: "You appear to be offline. Check your connection and try again.", retryable: true };
  if (isServerDown(e)) return { message: "The server is temporarily unavailable. Please try again in a moment.", retryable: true };
  if (isAuthError(e)) return { message: "Your session expired. Please sign in again to delete this review.", retryable: false };
  if (isForbidden(e)) return { message: "You don't have permission to delete this review.", retryable: false };
  if (e.message) return { message: e.message, retryable: true };
  return { message: "Something went wrong while deleting your review. Please try again.", retryable: true };
}

async function callRpc(fn: string, args: Record<string, unknown>): Promise<PgLikeError | null> {
  try {
    const { error } = await (supabase as unknown as {
      rpc: (name: string, params: Record<string, unknown>) => Promise<{ error: unknown }>;
    }).rpc(fn, args);
    return error ? asError(error) : null;
  } catch (thrown) {
    return asError(thrown);
  }
}

/**
 * Development-only structured diagnostics. Stripped from production bundles by
 * the `import.meta.env.DEV` guard, so customers never see internal identifiers,
 * Postgres messages or user IDs in their console.
 */
async function logDiagnostics(ctx: {
  fn: string;
  reviewId: string;
  productId?: string | null;
  ownerUserId?: string | null;
  mode: ReviewDeleteMode;
  retryCount: number;
  startedAt: number;
  err: PgLikeError;
  outcome: string;
}) {
  if (!import.meta.env.DEV) return;
  let authUserId: string | null = null;
  let sessionStatus = "none";
  let expiresIn: number | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (session) {
      authUserId = session.user?.id ?? null;
      const expiresAt = (session.expires_at ?? 0) * 1000;
      expiresIn = expiresAt ? Math.round((expiresAt - Date.now()) / 1000) : null;
      sessionStatus = expiresAt && expiresAt <= Date.now() ? "expired" : "active";
    }
  } catch {
    sessionStatus = "unavailable";
  }
  console.groupCollapsed(`[reviews:delete] ${ctx.outcome} — ${ctx.fn}`);
  console.table({
    reviewId: ctx.reviewId,
    productId: ctx.productId ?? "(not provided)",
    reviewOwnerUserId: ctx.ownerUserId ?? "(unknown)",
    authenticatedUserId: authUserId ?? "(anon)",
    ownerMatchesSession: ctx.ownerUserId ? String(ctx.ownerUserId === authUserId) : "(unknown)",
    sessionStatus,
    accessTokenExpiresInSec: expiresIn ?? "(unknown)",
    mode: ctx.mode,
    rpc: ctx.fn,
    supabaseErrorCode: ctx.err.code ?? "(none)",
    httpStatus: ctx.err.status ?? "(none)",
    postgresMessage: ctx.err.message ?? "(none)",
    details: ctx.err.details ?? "(none)",
    hint: ctx.err.hint ?? "(none)",
    retryCount: ctx.retryCount,
    durationMs: Date.now() - ctx.startedAt,
  });
  console.groupEnd();
}

/**
 * Root cause of "delete review fails after posting":
 * `hard_delete_own_review` used to `DELETE FROM storage.objects` to clean up
 * the review's uploaded photos/videos. The platform blocks direct writes to
 * storage tables (SQLSTATE 42501 — "Direct deletion from storage tables is not
 * allowed. Use the Storage API instead."), which aborted the whole transaction,
 * so any review WITH media could never be deleted while media-free reviews
 * deleted fine.
 *
 * The database function now only removes the review row (votes/reports cascade,
 * rating recalculates). Media cleanup moves here, through the Storage API,
 * where the owner-scoped bucket policy allows it. Best-effort: a storage
 * failure must never block the review deletion itself.
 */
const REVIEW_BUCKET = "review-media";

function storagePathFromUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw) return null;
  const marker = `/storage/v1/object/`;
  const i = raw.indexOf(marker);
  let path = raw;
  if (i >= 0) {
    path = raw.slice(i + marker.length).replace(/^(public|sign)\//, "");
    if (!path.startsWith(`${REVIEW_BUCKET}/`)) return null;
    path = path.slice(REVIEW_BUCKET.length + 1);
  } else if (raw.startsWith("http")) {
    return null;
  }
  path = path.split("?")[0];
  return path || null;
}

async function cleanupReviewMedia(reviewId: string): Promise<void> {
  try {
    const { data } = await supabase
      .from("product_reviews")
      .select("media")
      .eq("id", reviewId)
      .maybeSingle();
    const media = (data as { media?: unknown } | null)?.media;
    if (!Array.isArray(media) || media.length === 0) return;
    const paths = media
      .map((m) => {
        const item = m as { url?: unknown; src?: unknown; path?: unknown };
        return storagePathFromUrl(item?.url ?? item?.src ?? item?.path);
      })
      .filter((p): p is string => !!p);
    if (paths.length === 0) return;
    await supabase.storage.from(REVIEW_BUCKET).remove(paths);
  } catch {
    /* best effort — never block the review deletion */
  }
}

export async function deleteReview(input: {
  id: string;
  mode: ReviewDeleteMode;
  reason?: string | null;
  /** Diagnostics only — never sent to the database. */
  productId?: string | null;
  ownerUserId?: string | null;
}): Promise<ReviewDeleteOutcome> {
  const { id, mode } = input;
  const startedAt = Date.now();
  let retryCount = 0;

  const fn =
    mode === "admin_hard" ? "admin_hard_delete_review"
    : mode === "admin_soft" ? "admin_soft_delete_review"
    : "hard_delete_own_review";
  const args =
    mode === "admin_soft" ? { p_id: id, p_reason: input.reason?.trim() || null } : { p_id: id };

  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { ok: false, message: "You appear to be offline. Check your connection and try again.", retryable: true };
  }

  // 1. Make sure the request carries a valid, non-expired bearer token. This is
  //    the fix for "delete fails a few minutes after posting" — an idle tab can
  //    hold an expired token whose auto-refresh timer was throttled.
  const pre = await ensureFreshSession();
  if (!pre.signedIn) {
    return { ok: false, message: "Your session expired. Please sign in again to delete this review.", retryable: false };
  }

  // 2. First attempt.
  let err = await callRpc(fn, args);
  if (!err) return { ok: true, queued: false, alreadyGone: false };
  if (isNotFound(err)) return { ok: true, queued: false, alreadyGone: true };

  // 3. One forced-refresh retry for auth failures only.
  if (isAuthError(err)) {
    await logDiagnostics({ fn, reviewId: id, productId: input.productId, ownerUserId: input.ownerUserId, mode, retryCount, startedAt, err, outcome: "auth failure — refreshing session and retrying" });
    const refreshed = await ensureFreshSession(true);
    if (refreshed.ok) {
      retryCount += 1;
      err = await callRpc(fn, args);
      if (!err) return { ok: true, queued: false, alreadyGone: false };
      if (isNotFound(err)) return { ok: true, queued: false, alreadyGone: true };
    }
  }

  // 4. Offline / transient → queue the delete for replay instead of failing.
  if (isNetwork(err) || isServerDown(err)) {
    try {
      const { resilientRpc } = await import("@/lib/infra/supabase-resilient");
      const queued = await resilientRpc("review.submit", fn, args, `review.${fn}:${id}`);
      if (queued.ok && queued.queued) return { ok: true, queued: true, alreadyGone: false };
    } catch {
      /* fall through to the classified error */
    }
  }

  await logDiagnostics({ fn, reviewId: id, productId: input.productId, ownerUserId: input.ownerUserId, mode, retryCount, startedAt, err, outcome: "failed" });

  return { ok: false, ...classify(err) };
}
