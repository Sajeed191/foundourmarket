/**
 * Region & Currency Diagnostics (staff-only).
 *
 * Read-only: explains exactly how the platform would resolve a customer's
 * market region and currency right now, which signal decided it, and whether
 * Razorpay will expose UPI for that order. Never writes, never charges.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, type StaffRole } from "./admin-guard.server";
import { resolveMarketRegion, type RegionDecision } from "./region-resolution";

const DIAG_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

const inputSchema = z
  .object({
    /** Optional what-if overrides so staff can reproduce a customer's case. */
    shippingCountry: z.string().trim().max(60).optional().nullable(),
    billingCountry: z.string().trim().max(60).optional().nullable(),
    profileRegion: z.enum(["india", "international"]).optional().nullable(),
    edgeCountry: z.string().trim().max(10).optional().nullable(),
    locale: z.string().trim().max(35).optional().nullable(),
    timezone: z.string().trim().max(60).optional().nullable(),
  })
  .optional()
  .nullable();

export type RegionDiagnostics = {
  decision: RegionDecision;
  /** Raw geo headers as the edge actually delivered them for this request. */
  headers: { cfIpCountry: string | null; vercelCountry: string | null; edgeTimezone: string | null };
  simulated: boolean;
};

export const getRegionDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }): Promise<RegionDiagnostics> => {
    const { supabase, userId } = context as { supabase: any; userId: string };
    await requireStaff(userId, DIAG_STAFF, "payments.region.diagnostics");

    const cfIpCountry = getRequestHeader("cf-ipcountry") ?? null;
    const vercelCountry = getRequestHeader("x-vercel-ip-country") ?? null;
    const edgeTimezone =
      getRequestHeader("x-vercel-ip-timezone") ?? getRequestHeader("cf-timezone") ?? null;

    const { data: profile } = await supabase
      .from("profiles")
      .select("market_region")
      .eq("id", userId)
      .maybeSingle();

    const overrides = data ?? {};
    const simulated = Object.values(overrides).some((v) => v != null && v !== "");

    const lockedRegion =
      overrides.profileRegion ??
      (profile?.market_region === "india" || profile?.market_region === "international"
        ? profile.market_region
        : null);

    const decision = resolveMarketRegion({
      selectedRegion: lockedRegion,
      selectedRegionTrusted: true,
      shippingCountry: overrides.shippingCountry ?? null,
      profileRegion: lockedRegion,
      billingCountry: overrides.billingCountry ?? null,
      edgeCountry: overrides.edgeCountry ?? cfIpCountry ?? vercelCountry ?? null,
      locale: overrides.locale ?? null,
      timezone: overrides.timezone ?? edgeTimezone ?? null,
    });

    return { decision, headers: { cfIpCountry, vercelCountry, edgeTimezone }, simulated };
  });
