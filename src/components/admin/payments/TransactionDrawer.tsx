import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, X, Receipt, User, Globe, CreditCard } from "lucide-react";
import { getPaymentDetailFn, type PaymentDetail } from "@/lib/payments-center-v3.functions";
import { EmptyState, StatusBadge, money, when, maskId } from "./ui";

const TONE: Record<string, string> = {
  good: "bg-emerald-400",
  info: "bg-sky-400",
  warn: "bg-amber-400",
  bad: "bg-destructive",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="text-[11px] font-mono text-right min-w-0 truncate">{value}</span>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-3">
      <h4 className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground mb-2">
        {icon}{title}
      </h4>
      {children}
    </section>
  );
}

/** Read-only transaction drawer. Card data is never stored or shown; IDs are masked. */
export function TransactionDrawer({ paymentId, onClose }: { paymentId: string | null; onClose: () => void }) {
  const detailFn = useServerFn(getPaymentDetailFn);
  const [data, setData] = useState<PaymentDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!paymentId) { setData(null); return; }
    let alive = true;
    setLoading(true);
    detailFn({ data: { paymentId } })
      .then((res) => { if (alive) setData(res ?? null); })
      .catch(() => { if (alive) setData(null); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [paymentId, detailFn]);

  useEffect(() => {
    if (!paymentId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [paymentId, onClose]);

  if (!paymentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button aria-label="Close" onClick={onClose} className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
      <aside className="relative h-full w-full sm:max-w-md glass border-l border-white/10 overflow-y-auto overscroll-contain">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-background/80 backdrop-blur-xl">
          <div className="min-w-0">
            <h3 className="text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Transaction</h3>
            <p className="text-sm font-semibold truncate">{data ? money(data.amount, data.currency) : "…"}</p>
          </div>
          <button onClick={onClose} className="rounded-full border border-white/10 p-2 hover:bg-white/5 min-h-9 min-w-9 grid place-items-center">
            <X className="size-4" />
          </button>
        </header>

        {loading && <div className="p-10 grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>}
        {!loading && !data && <div className="p-4"><EmptyState title="Transaction not found." /></div>}

        {data && (
          <div className="p-4 space-y-3">
            <Section title="Payment" icon={<CreditCard className="size-3 text-accent" />}>
              <Row label="Status" value={<StatusBadge status={data.payment_status} />} />
              <Row label="Amount" value={money(data.amount, data.currency)} />
              <Row label="Method" value={data.method ?? "—"} />
              <Row label="Gateway" value={data.gateway} />
              <Row label="Payment ID" value={maskId(data.transaction_id)} />
              <Row label="Gateway order" value={maskId(data.gateway_order_id)} />
              <Row label="Created" value={when(data.created_at)} />
            </Section>

            <Section title="Order" icon={<Receipt className="size-3 text-accent" />}>
              <Row label="Order" value={data.order_id ? maskId(data.order_id) : "—"} />
              <Row label="Order status" value={data.order_status ?? "—"} />
              <Row label="Subtotal" value={data.totals.subtotal == null ? "No data" : money(data.totals.subtotal, data.currency)} />
              <Row label="Discount" value={data.totals.discount == null ? "No data" : money(data.totals.discount, data.currency)} />
              <Row label="Shipping" value={data.totals.shipping == null ? "No data" : money(data.totals.shipping, data.currency)} />
              <Row label="Tax" value={data.totals.tax == null ? "No data" : money(data.totals.tax, data.currency)} />
              <Row label="Total" value={data.totals.total == null ? "No data" : money(data.totals.total, data.currency)} />
              <Row label="Invoice ref" value={data.invoice_ref ? maskId(data.invoice_ref) : "No data"} />
            </Section>

            <Section title="Customer" icon={<User className="size-3 text-accent" />}>
              <Row label="Name" value={data.customer.name} />
              <Row label="Email" value={data.customer.email ?? "—"} />
              <Row label="Phone" value={data.customer.phone ?? "—"} />
              <Row label="Location" value={[data.customer.city, data.customer.state, data.customer.country].filter(Boolean).join(", ") || "—"} />
            </Section>

            <Section title="Payment timeline" icon={<Globe className="size-3 text-accent" />}>
              {data.timeline.length ? (
                <ol className="space-y-2">
                  {data.timeline.map((t, i) => (
                    <li key={`${t.at}-${i}`} className="flex items-start gap-2.5">
                      <span className={`mt-1.5 size-1.5 rounded-full shrink-0 ${TONE[t.tone]}`} />
                      <div className="min-w-0">
                        <p className="text-[11px]">{t.label}</p>
                        <p className="text-[10px] text-muted-foreground">{when(t.at)}{t.detail ? ` · ${t.detail}` : ""}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <EmptyState title="No timeline events recorded." />
              )}
            </Section>

            <Section title="Transaction history">
              {data.transactions.length ? (
                <ul className="space-y-1.5">
                  {data.transactions.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono truncate">{money(t.amount, t.currency)}</span>
                      <span className="text-muted-foreground truncate">{t.method ?? "—"}</span>
                      <StatusBadge status={t.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No other attempts on this order." />
              )}
            </Section>

            <Section title="Refund timeline">
              {data.refunds.length ? (
                <ul className="space-y-1.5">
                  {data.refunds.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono">{money(r.amount, r.currency)}</span>
                      <span className="truncate text-muted-foreground">{r.reason ?? "—"}</span>
                      <StatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No refunds on this payment." />
              )}
            </Section>

            <Section title="Settlement">
              <EmptyState
                title="No settlement data available yet."
                hint="Settlement references appear when a gateway settlement feed is connected."
              />
            </Section>
          </div>
        )}
      </aside>
    </div>
  );
}
