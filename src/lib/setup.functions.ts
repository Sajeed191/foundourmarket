/**
 * First-Time Setup — server functions (thin wrappers). Public by design:
 * they are only usable while zero super admins exist.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const createSchema = z.object({
  email: z.string().min(3),
  password: z.string().min(1),
  redirectTo: z.string().min(1),
});

export const getSetupState = createServerFn({ method: "GET" }).handler(async () => {
  const { readSetupState } = await import("@/lib/setup.server");
  return readSetupState();
});

export const createSuperAdminAccount = createServerFn({ method: "POST" })
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data }) => {
    const { createFirstSuperAdmin } = await import("@/lib/setup.server");
    return createFirstSuperAdmin(data.email, data.password, data.redirectTo);
  });
