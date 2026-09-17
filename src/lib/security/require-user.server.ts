/**
 * Bearer-token sign-in check for raw HTTP route handlers (`src/routes/api/*`).
 *
 * Route handlers are not covered by `requireSupabaseAuth` function middleware,
 * so endpoints that spend money or touch private data verify the caller here.
 * Returns only whether the caller is authenticated plus their user id — never
 * tokens or profile data.
 */
import { createClient } from "@supabase/supabase-js";

export type SignedInResult = { ok: true; userId: string } | { ok: false };

export async function requireSignedInUser(request: Request): Promise<SignedInResult> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) return { ok: false };
  const token = header.slice(7).trim();
  if (!token) return { ok: false };

  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return { ok: false };

  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await client.auth.getUser(token);
    if (error || !data?.user) return { ok: false };
    return { ok: true, userId: data.user.id };
  } catch {
    return { ok: false };
  }
}
