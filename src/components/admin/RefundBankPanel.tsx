import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Landmark, Loader2, ShieldCheck, ShieldX, Eye, EyeOff, Send, BellRing, PencilLine,
  CheckCircle2, Download, Hash, Lock, Clock,
} from "lucide-react";
import { toast } from "sonner";
import {
  getRefundBankFn, refundBankActionFn, refundBankAuditFn, revealRefundBankFn,
  type RefundBankRecord,
} from "@/lib/refund-bank.functions";
import { REFUND_BANK_STATUS_LABEL, type RefundBankStatus } from "@/lib/refund-bank/validation";

const STATUS_TONE: Record<RefundBankStatus, string> = {
  requested: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  submitted: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  verified: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  rejected: "text-rose-400 border-rose-400/30 bg-rose-400/10",
  update_requested: "text-violet-400 border-violet-400/30 bg-violet-400/10",
  refunded: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
};

const btn =
  "min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors";

function fmt(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function RefundBankPanel({
  returnId,
  customerName,
  refundAmount,
  currency,
  refundMethod,
  onChanged,
}: {
  returnId: string;
  customerName: string | null;
  refundAmount: number;
  currency: string | null;
  refundMethod: string;
  onChanged?: () => void;
}) {
  const fetchRecord = useServerFn(getRefundBankFn);
  const act = useServerFn(refundBankActionFn);
  const reveal = useServerFn(revealRefundBankFn);
  const fetchAudit = useServerFn(refundBankAuditFn);

  const [record, setRecord] = useState<RefundBankRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [full, setFull] = useState<Awaited<ReturnType<typeof revealRefundBankFn>> | null>(null);
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof refundBankAuditFn>> | null>(null);
  const [note, setNote] = useState("");
  const [reference, setReference] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await fetchRecord({ data: { returnId } });
      setRecord(r);
      setReference(r?.refund_reference ?? "");
    } catch {
      setRecord(null);
    } finally {
      setLoading(false);
    }
  }, [fetchRecord, returnId]);

  useEffect(() => { void load(); }, [load]);

  async function run(action: string, extra: Record<string, unknown> = {}) {
    setBusy(action);
    try {
      const res = await act({ data: { returnId, action, ...extra } as never });
      setRecord(res.record as RefundBankRecord);
      setFull(null);
      setNote("");
      toast.success("Updated");
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  async function onReveal() {
    if (full) { setFull(null); return; }
    setBusy("view");
    try {
      setFull(await reveal({ data: { returnId } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not reveal details");
    } finally {
      setBusy(null);
    }
  }

  async function onAudit() {
    if (!record) return;
    if (audit) { setAudit(null); return; }
    setBusy("audit");
    try {
      setAudit(await fetchAudit({ data: { bankId: record.id } }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not load audit");
    } finally {
      setBusy(null);
    }
  }

  function downloadAudit() {
    if (!audit) return;
    const rows = [
      ["timestamp", "action", "actor_id", "actor_role", "source_ip", "detail"],
      ...audit.map((a) => [
        a.created_at, a.action, a.actor_id ?? "", a.actor_role ?? "", a.source_ip ?? "",
        JSON.stringify(a.detail).replace(/"/g, "'"),
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c)}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `refund-bank-audit-${returnId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const status = (record?.status ?? null) as RefundBankStatus | null;
  const money = (() => {
    try {
      return new Intl.NumberFormat((currency || "INR") === "INR" ? "en-IN" : "en-US", {
        style: "currency", currency: currency || "INR", maximumFractionDigits: 2,
      }).format(refundAmount || 0);
    } catch { return `${currency ?? ""} ${refundAmount}`; }
  })();

  return (
    <section className="rounded-xl border border-border/60 bg-background/40 p-3">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
        <Landmark className="size-3.5 text-accent" /> Customer Refund Details
      </p>

      {loading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div>
              <dt className="text-muted-foreground">Customer</dt>
              <dd className="font-medium mt-0.5 break-words">{customerName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Refund Amount</dt>
              <dd className="font-semibold mt-0.5">{money}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Refund Method</dt>
              <dd className="font-medium mt-0.5 capitalize">{refundMethod.replace(/_/g, " ")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Bank Details Status</dt>
              <dd className="mt-0.5">
                <span className={`inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider px-2 py-1 rounded-full border ${status ? STATUS_TONE[status] : "text-muted-foreground border-border"}`}>
                  {status ? REFUND_BANK_STATUS_LABEL[status] : "Not requested"}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Submitted</dt>
              <dd className="font-medium mt-0.5">{fmt(record?.submitted_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Last Updated</dt>
              <dd className="font-medium mt-0.5">{fmt(record?.updated_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Verified By</dt>
              <dd className="font-mono text-[11px] mt-0.5 break-all">
                {record?.verified_by ? `${record.verified_by.slice(0, 8)} · ${fmt(record.verified_at)}` : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Refund Reference</dt>
              <dd className="font-mono text-[11px] mt-0.5 break-all">{record?.refund_reference ?? "—"}</dd>
            </div>
          </dl>

          {/* Masked details */}
          <div className="mt-3 rounded-lg border border-border/50 bg-background/60 p-3">
            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
              <Lock className="size-3 text-emerald-400" /> Bank Details (masked)
            </p>
            {record?.masked_account ? (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><dt className="text-muted-foreground">Holder</dt><dd className="font-mono mt-0.5">{full?.accountHolderName ?? record.masked_holder ?? "—"}</dd></div>
                <div><dt className="text-muted-foreground">Bank</dt><dd className="mt-0.5">{record.bank_name ?? "—"}{record.branch_name ? ` · ${record.branch_name}` : ""}</dd></div>
                <div><dt className="text-muted-foreground">Account</dt><dd className="font-mono mt-0.5">{full?.accountNumber ?? record.masked_account}</dd></div>
                <div><dt className="text-muted-foreground">IFSC</dt><dd className="font-mono mt-0.5">{full ? (full.ifsc || "—") : record.country === "IN" ? "••••••" : "—"}</dd></div>
                <div><dt className="text-muted-foreground">UPI</dt><dd className="font-mono mt-0.5">{full?.upiId || record.masked_upi || "—"}</dd></div>
                <div><dt className="text-muted-foreground">Type / Region</dt><dd className="mt-0.5 capitalize">{record.account_type ?? "—"} · {record.country ?? "—"} · {record.currency ?? "—"}</dd></div>
                {record.customer_notes && (
                  <div className="sm:col-span-2"><dt className="text-muted-foreground">Customer Notes</dt><dd className="mt-0.5 break-words">{record.customer_notes}</dd></div>
                )}
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground">
                No details submitted yet. Request bank details to notify the customer.
              </p>
            )}
          </div>

          {record?.rejection_reason && (
            <p className="mt-2 text-[11px] text-rose-400 break-words">Rejected: {record.rejection_reason}</p>
          )}

          {/* Note / reference inputs */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Note to customer (reject / update)"
              maxLength={500}
              className="bg-background border border-border rounded-md px-3 py-2 min-h-[40px] text-xs focus:outline-none focus:border-accent"
            />
            <div className="flex gap-2">
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="Refund reference"
                maxLength={80}
                className="flex-1 bg-background border border-border rounded-md px-3 py-2 min-h-[40px] text-xs font-mono focus:outline-none focus:border-accent"
              />
              <button
                type="button"
                disabled={!reference || busy != null}
                onClick={() => run("set_reference", { reference })}
                className={`${btn} border-border text-muted-foreground hover:border-accent/40`}
              >
                <Hash className="size-3.5" /> Save
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button type="button" disabled={busy != null} onClick={() => run("request", { method: refundMethod === "gateway" ? "manual_bank" : refundMethod })}
              className={`${btn} border-accent/40 text-accent hover:bg-accent/10`}>
              <Send className="size-3.5" /> Request
            </button>
            <button type="button" disabled={busy != null || !record} onClick={() => run("remind")}
              className={`${btn} border-border text-muted-foreground hover:border-accent/40`}>
              <BellRing className="size-3.5" /> Remind
            </button>
            <button type="button" disabled={busy != null || !record?.masked_account} onClick={onReveal}
              className={`${btn} border-border text-muted-foreground hover:border-accent/40`}>
              {busy === "view" ? <Loader2 className="size-3.5 animate-spin" /> : full ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
              {full ? "Hide" : "View"}
            </button>
            <button type="button" disabled={busy != null || status !== "submitted"} onClick={() => run("verify")}
              className={`${btn} border-emerald-400/30 bg-emerald-400/10 text-emerald-400 hover:bg-emerald-400/20`}>
              <ShieldCheck className="size-3.5" /> Verify
            </button>
            <button type="button" disabled={busy != null || !record?.masked_account} onClick={() => run("reject", { note: note || undefined })}
              className={`${btn} border-rose-400/30 bg-rose-400/10 text-rose-400 hover:bg-rose-400/20`}>
              <ShieldX className="size-3.5" /> Reject
            </button>
            <button type="button" disabled={busy != null || !record?.masked_account} onClick={() => run("request_update", { note: note || undefined })}
              className={`${btn} border-violet-400/30 bg-violet-400/10 text-violet-400 hover:bg-violet-400/20`}>
              <PencilLine className="size-3.5" /> Ask Update
            </button>
            <button type="button" disabled={busy != null || !(status === "verified" || status === "submitted")}
              onClick={() => run("mark_sent", { reference: reference || undefined })}
              className={`${btn} border-amber-400/30 bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 col-span-2 sm:col-span-2`}>
              <CheckCircle2 className="size-3.5" /> Mark Refund Sent
            </button>
            <button type="button" disabled={busy != null || !record} onClick={onAudit}
              className={`${btn} border-border text-muted-foreground hover:border-accent/40`}>
              {busy === "audit" ? <Loader2 className="size-3.5 animate-spin" /> : <Clock className="size-3.5" />} Audit
            </button>
          </div>

          {audit && (
            <div className="mt-3 rounded-lg border border-border/50 bg-background/60 p-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Audit Trail ({audit.length})
                </p>
                <button type="button" onClick={downloadAudit} className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-accent">
                  <Download className="size-3" /> CSV
                </button>
              </div>
              <ul className="space-y-1.5 max-h-56 overflow-y-auto">
                {audit.map((a) => (
                  <li key={a.id} className="text-[11px] text-muted-foreground break-words">
                    <span className="font-mono text-foreground">{a.action.replace("bank_details.", "")}</span>
                    {" · "}{fmt(a.created_at)}
                    {a.actor_role ? ` · ${a.actor_role}` : ""}
                    {a.source_ip ? ` · ${a.source_ip}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
