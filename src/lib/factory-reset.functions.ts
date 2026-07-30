/**
 * FoundOurMarket™ Factory Reset v1.0 — server functions (thin wrappers).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const runSchema = z.object({
  confirm: z.string(),
  password: z.string().min(1),
  keepEmergencyAdmin: z.boolean().default(true),
  deleteReviewImages: z.boolean().default(true),
});

export const getFactoryPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    const { requireStaff } = await import("@/lib/admin-guard.server");
    await requireStaff(userId, ["super_admin"], "factory_reset.preview");
    const { buildPreview } = await import("@/lib/factory-reset.server");
    return buildPreview();
  });

export const runFactoryReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => runSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as { userId: string; claims: { email?: string } };
    const { requireStaff, logSecurity } = await import("@/lib/admin-guard.server");
    const { primaryRole } = await requireStaff(userId, ["super_admin"], "factory_reset.execute");

    const { FACTORY_PHRASE } = await import("@/lib/factory-reset.tables");
    const { verifyPassword, executeFactoryReset } = await import("@/lib/factory-reset.server");

    if (data.confirm.trim() !== FACTORY_PHRASE) {
      await logSecurity({
        actorId: userId, actorRole: primaryRole, action: "factory_reset.execute",
        success: false, detail: { reason: "bad_confirmation" },
      });
      throw new Error("Confirmation phrase does not match.");
    }

    const email = claims?.email ?? null;
    if (!email) throw new Error("Could not resolve your account email for re-authentication.");
    const ok = await verifyPassword(email, data.password);
    if (!ok) {
      await logSecurity({
        actorId: userId, actorRole: primaryRole, action: "factory_reset.execute",
        success: false, detail: { reason: "bad_password" },
      });
      throw new Error("Password is incorrect.");
    }

    return executeFactoryReset(userId, email, primaryRole, {
      keepEmergencyAdmin: data.keepEmergencyAdmin,
      deleteReviewImages: data.deleteReviewImages,
    });
  });
