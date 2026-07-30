/**
 * First-Time Setup — server-only implementation.
 *
 * After a factory reset there are zero super admins, so the marketplace is
 * locked out of Admin until exactly one is created here.
 */
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logSecurity } from "@/lib/admin-guard.server";

export type SetupState = {
  needsSetup: boolean;
  superAdmins: number;
  pendingEmail: string | null;
};

export async function readSetupState(): Promise<SetupState> {
  const { data } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "super_admin");
  const superAdmins = (data ?? []).length;
  let pendingEmail: string | null = null;
  if (superAdmins === 0) {
    const { data: boot } = await supabaseAdmin
      .from("super_admin_bootstrap")
      .select("email")
      .order("created_at", { ascending: false })
      .limit(1);
    pendingEmail = (boot?.[0]?.email as string | undefined) ?? null;
  }
  return { needsSetup: superAdmins === 0, superAdmins, pendingEmail };
}

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 12) issues.push("At least 12 characters");
  if (!/[a-z]/.test(password)) issues.push("A lowercase letter");
  if (!/[A-Z]/.test(password)) issues.push("An uppercase letter");
  if (!/\d/.test(password)) issues.push("A number");
  if (!/[^A-Za-z0-9]/.test(password)) issues.push("A symbol");
  return issues;
}

/**
 * Create the first super admin. Only possible while zero super admins exist.
 * The account is created through normal sign-up so Supabase sends the email
 * verification link; the bootstrap allow-list trigger grants `super_admin`.
 */
export async function createFirstSuperAdmin(
  email: string,
  password: string,
  redirectTo: string,
): Promise<{ ok: true; email: string }> {
  const state = await readSetupState();
  if (!state.needsSetup) {
    throw new Error("Setup already completed — a super admin already exists.");
  }
  const issues = passwordIssues(password);
  if (issues.length) throw new Error(`Password is too weak. Required: ${issues.join(", ")}.`);

  const clean = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(clean)) throw new Error("Enter a valid email address.");

  // Allow-list the address so the signup trigger assigns super_admin.
  await supabaseAdmin.from("super_admin_bootstrap").upsert({ email: clean });

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

  const { error } = await client.auth.signUp({
    email: clean,
    password,
    options: { emailRedirectTo: redirectTo },
  });
  if (error) throw new Error(error.message);

  await logSecurity({
    actorId: null,
    actorRole: null,
    action: "setup.super_admin_created",
    target: clean,
    success: true,
    detail: { source: "first-time-setup" },
  });

  return { ok: true, email: clean };
}
