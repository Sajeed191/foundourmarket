/**
 * Returns & Refunds v2.0 — shared validation contract for customer bank details.
 *
 * Browser-safe (no server imports) so the customer form and the server
 * function validate with exactly the same rules. Never relax these on the
 * client only — the server re-parses the same schema.
 */
import { z } from "zod";

export const ACCOUNT_TYPES = ["savings", "current"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

export const REFUND_BANK_STATUSES = [
  "requested",
  "submitted",
  "verified",
  "rejected",
  "update_requested",
  "refunded",
] as const;
export type RefundBankStatus = (typeof REFUND_BANK_STATUSES)[number];

export const REFUND_BANK_STATUS_LABEL: Record<RefundBankStatus, string> = {
  requested: "Waiting for customer",
  submitted: "Submitted",
  verified: "Verified",
  rejected: "Rejected",
  update_requested: "Update requested",
  refunded: "Refunded",
};

/** Refund routes that require manual collection of bank details. */
export const MANUAL_REFUND_METHODS = ["manual_bank", "cod", "gateway_failed"] as const;
export type RefundMethod = "gateway" | (typeof MANUAL_REFUND_METHODS)[number];

export const REFUND_METHOD_LABEL: Record<RefundMethod, string> = {
  gateway: "Automatic (original payment method)",
  manual_bank: "Manual bank transfer",
  cod: "COD order — manual transfer",
  gateway_failed: "Gateway refund failed — manual transfer",
};

export function requiresBankDetails(method: string | null | undefined): boolean {
  return (MANUAL_REFUND_METHODS as readonly string[]).includes(method ?? "");
}

/** Reject anything that looks like markup / script injection. */
const safeText = (max: number, min = 0, label = "This field") =>
  z
    .string()
    .trim()
    .min(min, `${label} is required`)
    .max(max, `Must be ${max} characters or fewer`)
    .refine((v) => !/[<>]/.test(v), "Special characters < and > are not allowed");

const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const UPI_RE = /^[a-zA-Z0-9._-]{2,64}@[a-zA-Z]{2,64}$/;
const ACCOUNT_RE = /^[0-9]{6,20}$/;

export const CURRENCY_BY_COUNTRY: Record<string, string> = {
  IN: "INR",
  US: "USD",
  GB: "GBP",
  AE: "AED",
  CA: "CAD",
  AU: "AUD",
  SG: "SGD",
  EU: "EUR",
};

export const SUPPORTED_COUNTRIES = Object.keys(CURRENCY_BY_COUNTRY);

export const refundBankInputSchema = z
  .object({
    returnId: z.string().uuid(),
    accountHolderName: safeText(120, 2, "Account holder name"),
    bankName: safeText(120, 2, "Bank name"),
    accountNumber: z
      .string()
      .trim()
      .regex(ACCOUNT_RE, "Account number must be 6–20 digits"),
    confirmAccountNumber: z.string().trim(),
    ifsc: z
      .string()
      .trim()
      .max(20)
      .transform((v) => v.toUpperCase())
      .default(""),
    branchName: safeText(120).default(""),
    upiId: z.string().trim().max(80).default(""),
    accountType: z.enum(ACCOUNT_TYPES),
    country: z
      .string()
      .trim()
      .length(2, "Select a country")
      .transform((v) => v.toUpperCase()),
    currency: z
      .string()
      .trim()
      .length(3, "Select a currency")
      .transform((v) => v.toUpperCase()),
    notes: safeText(500).default(""),
    confirmed: z.literal(true, {
      errorMap: () => ({ message: "Please confirm the details are correct" }),
    }),
  })
  .superRefine((v, ctx) => {
    if (v.accountNumber !== v.confirmAccountNumber) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmAccountNumber"],
        message: "Account numbers do not match",
      });
    }
    if (v.country === "IN" && !IFSC_RE.test(v.ifsc ?? "")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ifsc"],
        message: "Enter a valid IFSC code (e.g. HDFC0001234)",
      });
    }
    if (v.upiId && !UPI_RE.test(v.upiId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["upiId"], message: "Enter a valid UPI ID" });
    }
    if (v.upiId && v.country !== "IN") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["upiId"],
        message: "UPI is only available for Indian bank accounts",
      });
    }
    const expected = CURRENCY_BY_COUNTRY[v.country];
    if (!expected) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["country"], message: "Unsupported country" });
    } else if (expected !== v.currency) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["currency"],
        message: `${v.country} accounts must use ${expected}`,
      });
    }
  });

export type RefundBankInput = z.infer<typeof refundBankInputSchema>;

/* --------------------------------- Masking -------------------------------- */

export function maskAccount(account: string): string {
  const digits = account.replace(/\D/g, "");
  if (digits.length <= 4) return "•".repeat(digits.length);
  return `${"X".repeat(Math.min(8, digits.length - 4))}${digits.slice(-4)}`;
}

export function maskUpi(upi: string): string {
  const [user, domain] = upi.split("@");
  if (!user || !domain) return "••••";
  const head = user.slice(0, 2);
  return `${head}${"*".repeat(Math.max(2, user.length - 2))}@${domain}`;
}

export function maskHolder(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]!.toUpperCase()}${"*".repeat(Math.max(1, part.length - 1))}`)
    .join(" ");
}

export function maskIfsc(ifsc: string): string {
  if (ifsc.length < 5) return "•••••";
  return `${ifsc.slice(0, 4)}••••${ifsc.slice(-2)}`;
}
