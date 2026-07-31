import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { motion } from "framer-motion";
import {
  ArrowLeft, Loader2, ShieldCheck, Lock, CheckCircle2, AlertTriangle, Wallet, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { getMyRefundBankFn, submitRefundBankFn } from "@/lib/refund-bank.functions";
import {
  ACCOUNT_TYPES,
  CURRENCY_BY_COUNTRY,
  REFUND_BANK_STATUS_LABEL,
  SUPPORTED_COUNTRIES,
  refundBankInputSchema,
  type RefundBankStatus,
} from "@/lib/refund-bank/validation";

const SUPPORT_EMAIL = "support@foundourmarket.com";

export const Route = createFileRoute("/account_/refund-details")({
  head: () => ({
    meta: [
      { title: "Secure Refund Details — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Securely submit your bank account details so FoundOurMarket can transfer your approved refund.",
      },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  validateSearch: z.object({ return: z.string().optional() }),
  component: RefundDetailsPage,
});

type FormState = {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifsc: string;
  branchName: string;
  upiId: string;
  accountType: string;
  country: string;
  currency: string;
  notes: string;
  confirmed: boolean;
};

const EMPTY: FormState = {
  accountHolderName: "",
  bankName: "",
  accountNumber: "",
  confirmAccountNumber: "",
  ifsc: "",
  branchName: "",
  upiId: "",
  accountType: "savings",
  country: "IN",
  currency: "INR",
  notes: "",
  confirmed: false,
};

const inputCls =
  "w-full min-h-[48px] rounded-xl bg-white/[0.04] ring-1 ring-white/10 px-3.5 text-[15px] text-white/90 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/50 transition";

function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-white/45">{label}</span>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <span className="mt-1 block text-[11px] text-rose-300">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-[11px] text-white/35">{hint}</span>
      ) : null}
    </label>
  );
}

function RefundDetailsPage() {
  const search = useSearch({ from: "/account_/refund-details" });
  const navigate = useNavigate();
  const load = useServerFn(getMyRefundBankFn);
  const submit = useServerFn(submitRefundBankFn);

  const returnId = search.return ?? "";
  const [state, setState] = useState<Awaited<ReturnType<typeof getMyRefundBankFn>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    if (!returnId) { setLoading(false); return; }
    (async () => {
      try {
        const res = await load({ data: { returnId } });
        if (!alive) return;
        setState(res);
        if (res.record) {
          setForm((f) => ({
            ...f,
            bankName: res.record?.bank_name ?? "",
            branchName: res.record?.branch_name ?? "",
            accountType: res.record?.account_type ?? "savings",
            country: res.record?.country ?? "IN",
            currency: res.record?.currency ?? "INR",
            notes: res.record?.customer_notes ?? "",
          }));
        }
      } catch (e) {
        if (alive) toast.error(e instanceof Error ? e.message : "Could not load refund request");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [returnId, load]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "country") next.currency = CURRENCY_BY_COUNTRY[v as string] ?? next.currency;
      return next;
    });

  const status = (state?.record?.status ?? null) as RefundBankStatus | null;
  const editable = state?.editable ?? false;
  const amount = state?.return.refund_amount ?? 0;
  const currency = state?.return.currency ?? "INR";

  const amountLabel = useMemo(() => {
    try {
      return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      return `${currency} ${amount}`;
    }
  }, [amount, currency]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});
    const parsed = refundBankInputSchema.safeParse({ ...form, returnId });
    if (!parsed.success) {
      const map: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        if (!map[key]) map[key] = issue.message;
      }
      setErrors(map);
      toast.error("Please fix the highlighted fields");
      return;
    }
    setSaving(true);
    try {
      await submit({ data: parsed.data });
      toast.success("Bank details submitted securely");
      const res = await load({ data: { returnId } });
      setState(res);
      setForm((f) => ({ ...f, accountNumber: "", confirmAccountNumber: "", ifsc: "", upiId: "", confirmed: false }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit details");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen px-4 pb-24 pt-6 sm:px-6 max-w-xl mx-auto">
      <button
        type="button"
        onClick={() => navigate({ to: "/account/returns" })}
        className="inline-flex items-center gap-1.5 text-[12px] text-white/50 hover:text-white/80 transition min-h-[44px]"
      >
        <ArrowLeft className="size-4" /> Resolution Center
      </button>

      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-2"
      >
        <h1 className="text-[22px] font-semibold tracking-tight">Secure refund details</h1>
        <p className="mt-1.5 text-[13px] text-white/50 leading-relaxed">
          Your refund has been approved. Please submit your bank account details so we can transfer
          your refund. Your information is encrypted and only visible to authorised refund staff.
        </p>
      </motion.header>

      {loading ? (
        <div className="mt-10 flex justify-center"><Loader2 className="size-5 animate-spin text-white/40" /></div>
      ) : !returnId || !state ? (
        <p className="mt-8 text-sm text-white/50">
          We couldn't find this refund request.{" "}
          <Link to="/account/returns" className="text-accent-hi underline">Back to Resolution Center</Link>
        </p>
      ) : (
        <>
          {/* Summary */}
          <div className="mt-5 rounded-2xl ring-1 ring-white/[0.07] bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-white/45">
                Refund amount
              </span>
              <span className="text-lg font-semibold">{amountLabel}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-white/45">Status</span>
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-1 rounded-full ring-1 ring-primary/30 bg-primary/10 text-accent-hi">
                <Wallet className="size-3" />
                {status ? REFUND_BANK_STATUS_LABEL[status] : "Waiting for customer"}
              </span>
            </div>
            <p className="mt-2 text-[11px] font-mono uppercase tracking-[0.14em] text-white/35">
              REQ #{state.return.id.slice(0, 8)} · ORD #{state.return.order_id.slice(0, 8)}
            </p>
          </div>

          {state.record?.rejection_reason && editable && (
            <div className="mt-3 flex items-start gap-2 rounded-xl ring-1 ring-amber-400/25 bg-amber-400/10 p-3 text-[12px] text-amber-200">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{state.record.rejection_reason}</span>
            </div>
          )}

          {!editable ? (
            <div className="mt-5 rounded-2xl ring-1 ring-white/[0.07] bg-white/[0.03] p-5 text-center">
              <CheckCircle2 className="size-7 mx-auto text-emerald-300" />
              <p className="mt-2.5 text-sm font-medium">
                {status === "refunded"
                  ? "Your refund has been sent."
                  : status
                    ? `Your details are ${REFUND_BANK_STATUS_LABEL[status].toLowerCase()}.`
                    : "This refund is processed automatically to your original payment method."}
              </p>
              {state.record?.masked_account && (
                <p className="mt-1.5 text-[12px] font-mono text-white/50">
                  {state.record.bank_name} · {state.record.masked_account}
                </p>
              )}
              {state.record?.refund_reference && (
                <p className="mt-1 text-[11px] font-mono text-white/40">
                  Reference: {state.record.refund_reference}
                </p>
              )}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="mt-4 inline-flex items-center gap-1.5 text-[12px] text-accent-hi min-h-[44px]"
              >
                <Mail className="size-3.5" /> {SUPPORT_EMAIL}
              </a>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-5 space-y-4" autoComplete="on">
              <Field label="Account holder name" error={errors.accountHolderName}>
                <input
                  className={inputCls}
                  value={form.accountHolderName}
                  onChange={(e) => set("accountHolderName", e.target.value)}
                  autoComplete="name"
                  inputMode="text"
                  maxLength={120}
                  required
                />
              </Field>

              <Field label="Bank name" error={errors.bankName}>
                <input
                  className={inputCls}
                  value={form.bankName}
                  onChange={(e) => set("bankName", e.target.value)}
                  maxLength={120}
                  required
                />
              </Field>

              <Field label="Account number" error={errors.accountNumber}>
                <input
                  className={cn(inputCls, "font-mono tracking-wider")}
                  value={form.accountNumber}
                  onChange={(e) => set("accountNumber", e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={20}
                  required
                />
              </Field>

              <Field label="Confirm account number" error={errors.confirmAccountNumber}>
                <input
                  className={cn(inputCls, "font-mono tracking-wider")}
                  value={form.confirmAccountNumber}
                  onChange={(e) => set("confirmAccountNumber", e.target.value.replace(/\D/g, ""))}
                  inputMode="numeric"
                  autoComplete="off"
                  onPaste={(e) => e.preventDefault()}
                  maxLength={20}
                  required
                />
              </Field>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field
                  label={form.country === "IN" ? "IFSC code" : "IFSC / SWIFT (optional)"}
                  error={errors.ifsc}
                  hint={form.country === "IN" ? "e.g. HDFC0001234" : undefined}
                >
                  <input
                    className={cn(inputCls, "font-mono uppercase")}
                    value={form.ifsc}
                    onChange={(e) => set("ifsc", e.target.value.toUpperCase())}
                    maxLength={20}
                    autoComplete="off"
                  />
                </Field>
                <Field label="Branch name (optional)" error={errors.branchName}>
                  <input
                    className={inputCls}
                    value={form.branchName}
                    onChange={(e) => set("branchName", e.target.value)}
                    maxLength={120}
                  />
                </Field>
              </div>

              {form.country === "IN" && (
                <Field label="UPI ID (optional)" error={errors.upiId} hint="Faster transfers where supported">
                  <input
                    className={inputCls}
                    value={form.upiId}
                    onChange={(e) => set("upiId", e.target.value)}
                    inputMode="email"
                    maxLength={80}
                    autoComplete="off"
                  />
                </Field>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Account type" error={errors.accountType}>
                  <select
                    className={cn(inputCls, "capitalize")}
                    value={form.accountType}
                    onChange={(e) => set("accountType", e.target.value)}
                  >
                    {ACCOUNT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Country" error={errors.country}>
                  <select
                    className={inputCls}
                    value={form.country}
                    onChange={(e) => set("country", e.target.value)}
                  >
                    {SUPPORTED_COUNTRIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Currency" error={errors.currency}>
                  <input className={cn(inputCls, "font-mono")} value={form.currency} readOnly />
                </Field>
              </div>

              <Field label="Notes (optional)" error={errors.notes}>
                <textarea
                  className={cn(inputCls, "min-h-[88px] py-3 resize-none")}
                  value={form.notes}
                  onChange={(e) => set("notes", e.target.value)}
                  maxLength={500}
                />
              </Field>

              <label className="flex items-start gap-3 rounded-xl ring-1 ring-white/[0.07] bg-white/[0.03] p-3.5 min-h-[52px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.confirmed}
                  onChange={(e) => set("confirmed", e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--color-primary,#ff7a00)]"
                />
                <span className="text-[13px] text-white/75 leading-snug">
                  I confirm these bank details are correct.
                  {errors.confirmed && (
                    <span className="block text-[11px] text-rose-300 mt-1">{errors.confirmed}</span>
                  )}
                </span>
              </label>

              <div className="flex items-center gap-2 text-[11px] text-white/40">
                <Lock className="size-3.5 text-emerald-300" />
                Encrypted at rest · masked everywhere · visible only to authorised refund staff.
              </div>

              <button
                type="submit"
                disabled={saving}
                className="w-full min-h-[52px] rounded-xl bg-primary text-black font-semibold text-[15px] inline-flex items-center justify-center gap-2 disabled:opacity-60 transition active:scale-[0.99]"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
                Submit securely
              </button>
            </form>
          )}
        </>
      )}
    </div>
  );
}
