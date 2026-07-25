/**
 * Public read path for internal marketplace state.
 *
 * `public.rotation_state` and `public.site_rules` are staff-only tables (no
 * anon/public SELECT). Storefront surfaces still need two derived values:
 *  - the global rotation nonce (drives fair rotation / reshuffle)
 *  - the homepage collection rules (limits, rotation window, featured mode)
 *
 * This server function exposes ONLY those minimal derived values — never the
 * tables themselves, never any other rule key.
 */
import { createServerFn } from "@tanstack/react-start";

export type PublicMarketplaceState = {
  rotationNonce: number;
  homepageRules: unknown;
};

export const getPublicMarketplaceState = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicMarketplaceState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const [rotation, rules] = await Promise.all([
      supabaseAdmin.from("rotation_state").select("nonce").limit(1).maybeSingle(),
      supabaseAdmin
        .from("site_rules")
        .select("value")
        .eq("key", "homepage_collections")
        .maybeSingle(),
    ]);

    return {
      rotationNonce: Number((rotation.data as { nonce?: number } | null)?.nonce) || 0,
      homepageRules: (rules.data as { value?: unknown } | null)?.value ?? null,
    };
  },
);
