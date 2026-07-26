/**
 * Q&A v7.4 — development-only diagnostics for question / answer / reply
 * mutations.
 *
 * Mirrors `src/lib/review-delete.ts` so every Review and Q&A failure produces
 * the same collapsed console group with the identifiers needed to reproduce it.
 * The whole body is behind `import.meta.env.DEV`, so production bundles emit
 * nothing and customers never see internal IDs or Postgres messages.
 */

import { supabase } from "@/integrations/supabase/client";

type PgLike = { message?: string; code?: string; details?: string; hint?: string; status?: number };

export type QaDiagnosticsContext = {
  action: string;
  rpc: string;
  questionId?: string | null;
  answerId?: string | null;
  replyId?: string | null;
  productId?: string | null;
  ownerUserId?: string | null;
  currentUserId?: string | null;
  retryCount?: number;
  startedAt: number;
  error: unknown;
};

export async function logQaDiagnostics(ctx: QaDiagnosticsContext): Promise<void> {
  if (!import.meta.env.DEV) return;
  const e = (ctx.error ?? {}) as PgLike;
  let authUserId: string | null = null;
  let sessionState = "none";
  let expiresIn: number | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    const session = data.session;
    if (session) {
      authUserId = session.user?.id ?? null;
      const expiresAt = (session.expires_at ?? 0) * 1000;
      expiresIn = expiresAt ? Math.round((expiresAt - Date.now()) / 1000) : null;
      sessionState = expiresAt && expiresAt <= Date.now() ? "expired" : "active";
    }
  } catch {
    sessionState = "unavailable";
  }
  const owner = ctx.ownerUserId ?? null;
  console.groupCollapsed(`[qa:${ctx.action}] failed — ${ctx.rpc}`);
  console.table({
    questionId: ctx.questionId ?? "(n/a)",
    answerId: ctx.answerId ?? "(n/a)",
    replyId: ctx.replyId ?? "(n/a)",
    productId: ctx.productId ?? "(n/a)",
    ownerUserId: owner ?? "(unknown)",
    currentUserId: ctx.currentUserId ?? authUserId ?? "(anon)",
    authenticatedUserId: authUserId ?? "(anon)",
    ownerMatch: owner ? String(owner === authUserId) : "(unknown)",
    sessionState,
    tokenExpiresInSec: expiresIn ?? "(unknown)",
    rpc: ctx.rpc,
    errorCode: e.code ?? "(none)",
    httpStatus: e.status ?? "(none)",
    postgresMessage: e.message ?? "(none)",
    hint: e.hint ?? "(none)",
    details: e.details ?? "(none)",
    retryCount: ctx.retryCount ?? 0,
    durationMs: Date.now() - ctx.startedAt,
  });
  console.groupEnd();
}
