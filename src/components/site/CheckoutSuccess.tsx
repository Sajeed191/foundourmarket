/**
 * Payment Success screen (v2.0) — displays the REAL persisted order.
 *
 * Presentation + data-binding only: it re-reads the order row that checkout
 * already created (totals, items, payment record, shipment) and renders those
 * exact stored values. No price is ever recomputed here, and no placeholder,
 * mock or hardcoded amount is rendered. While the order row is not readable
 * yet (replication / verification lag) it retries silently and shows a
 * reassuring verifying state instead of ₹0.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Loader2,
  Truck,
  Download,
  ShieldCheck,
  Package,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

type SuccessItem = {
  id: string;
  name: string | null;
  quantity: number;
  image: string | null;
  unit_price: number;
  line_total: number;
  variant_name: string | null;
  variant_size: string | null;
  variant_color: string | null;
};

type SuccessOrder = {
  id: string;
  status: string;
  payment_status: string | null;
  payment_method: string | null;
  payment_provider: string | null;
  razorpay_payment_id: string | null;
  razorpay_order_id: string | null;
  currency: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  promo_code: string | null;
  carrier: string | null;
  tracking_number: string | null;
  created_at: string;
  paid_at: string | null;
  shipping_address: {
    name?: string;
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  } | null;
  order_items: SuccessItem[];
};

type PaymentRec = {
  id: string;
  method: string | null;
  status: string | null;
  amount: number;
  transaction_id: string | null;
  razorpay_payment_id: string | null;
  created_at: string;
};

const ORDER_SELECT =
  "id,status,payment_status,payment_method,payment_provider,razorpay_payment_id,razorpay_order_id,currency,subtotal,discount,shipping,tax,total,promo_code,carrier,tracking_number,created_at,paid_at,shipping_address," +
  "order_items(id,name,quantity,image,unit_price,line_total,variant_name,variant_size,variant_color)";

function money(currency: string | null | undefined, n: number) {
  const v = Number(n) || 0;
  const cur = (currency || "INR").toUpperCase();
  try {
    return new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: cur === "INR" ? 0 : 2,
    }).format(v);
  } catch {
    return `${cur} ${v.toFixed(2)}`;
  }
}

function when(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function CheckoutSuccess({
  orderId,
  method,
  eta,
}: {
  orderId: string | null;
  method: "razorpay" | "cod" | "demo";
  eta: string;
}) {
  const nav = useNavigate();
  const [order, setOrder] = useState<SuccessOrder | null>(null);
  const [payment, setPayment] = useState<PaymentRec | null>(null);
  const [downloading, setDownloading] = useState(false);
  const attempts = useRef(0);

  const load = useCallback(async () => {
    if (!orderId) return false;
    const { data } = await supabase
      .from("orders")
      .select(ORDER_SELECT)
      .eq("id", orderId)
      .maybeSingle();
    if (!data) return false;
    setOrder(data as unknown as SuccessOrder);
    const { data: pay } = await supabase
      .from("payments")
      .select("id,method,status,amount,transaction_id,razorpay_payment_id,created_at")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1);
    setPayment(((pay as PaymentRec[]) ?? [])[0] ?? null);
    return true;
  }, [orderId]);

  // Retry until the order is readable — never render a zero/placeholder total.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      const ok = await load().catch(() => false);
      if (cancelled || ok) return;
      attempts.current += 1;
      const delay = Math.min(800 * 2 ** (attempts.current - 1), 8000);
      timer = setTimeout(tick, delay);
    };
    void tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  if (!order) {
    return (
      <div className="relative min-h-[70vh] grid place-items-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-strong border border-white/10 rounded-3xl p-8 sm:p-10 max-w-md w-full text-center"
        >
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full bg-emerald-500/10 border border-emerald-500/30">
            <Loader2 className="size-6 text-emerald-400 animate-spin" />
          </div>
          <h1 className="text-xl font-display font-semibold mb-2">
            We're verifying your payment
          </h1>
          <p className="text-sm text-muted-foreground">
            Your order has been created successfully. This page will update the moment
            your order details are confirmed.
          </p>
          {orderId && (
            <p className="mt-4 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
              Ref #{orderId.slice(0, 8)}
            </p>
          )}
        </motion.div>
      </div>
    );
  }

  const cur = order.currency;
  const paidVia =
    order.payment_provider === "razorpay" || order.payment_method === "razorpay"
      ? "Razorpay"
      : order.payment_method === "cod"
        ? "Cash on Delivery"
        : method === "demo"
          ? "Global Beta (Demo)"
          : (order.payment_method ?? "—");
  const isCod = (order.payment_method ?? "") === "cod";
  const paymentId = order.razorpay_payment_id ?? payment?.razorpay_payment_id ?? null;
  const txnId = payment?.transaction_id ?? order.razorpay_order_id ?? null;
  const paidAt = when(order.paid_at ?? payment?.created_at ?? null);
  const addr = order.shipping_address;
  const addrLine = [
    addr?.line1,
    addr?.line2,
    [addr?.city, addr?.region, addr?.postal_code].filter(Boolean).join(", "),
    addr?.country,
  ]
    .filter(Boolean)
    .join(" · ");

  const rows: Array<{ label: string; value: string; negative?: boolean }> = [];
  rows.push({ label: "Subtotal", value: money(cur, order.subtotal) });
  if (Number(order.discount) > 0)
    rows.push({
      label: order.promo_code ? `Coupon (${order.promo_code})` : "Discount",
      value: `- ${money(cur, order.discount)}`,
      negative: true,
    });
  if (Number(order.shipping) > 0)
    rows.push({ label: "Shipping", value: money(cur, order.shipping) });
  if (Number(order.tax) > 0)
    rows.push({ label: "Tax / GST", value: money(cur, order.tax) });

  return (
    <div className="relative min-h-[70vh] px-4 sm:px-6 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="mx-auto w-full max-w-xl space-y-4"
      >
        {/* Header */}
        <div className="glass-strong border border-white/10 rounded-3xl p-8 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.1 }}
            className="size-16 mx-auto mb-5 grid place-items-center rounded-full bg-emerald-500/10 border border-emerald-500/30"
          >
            <CheckCircle2 className="size-7 text-emerald-400" />
          </motion.div>
          <h1 className="text-2xl font-display font-semibold mb-1.5">
            {isCod ? "Order confirmed" : "Payment successful"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {isCod
              ? "Pay in cash when your order arrives."
              : "Your payment has been verified and your order is being prepared."}
          </p>
          <p className="mt-4 text-3xl font-display font-semibold tabular-nums">
            {money(cur, order.total)}
          </p>
        </div>

        {/* Order summary */}
        <section className="glass border border-white/10 rounded-2xl p-5 space-y-2">
          <h2 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
            Order summary
          </h2>
          <Row label="Order ID" value={`#${order.id.slice(0, 8).toUpperCase()}`} />
          <Row label="Payment status" value={order.payment_status ?? order.status} />
          <Row label="Payment method" value={paidVia} />
          <Row label="Order date" value={when(order.created_at) ?? "—"} />
          <Row label="Est. delivery" value={eta} />
        </section>

        {/* Price breakdown */}
        <section className="glass border border-white/10 rounded-2xl p-5">
          <h2 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
            Price breakdown
          </h2>
          <div className="space-y-2">
            {rows.map((r) => (
              <div key={r.label} className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{r.label}</span>
                <span
                  className={`font-mono tabular-nums ${r.negative ? "text-emerald-400" : ""}`}
                >
                  {r.value}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest">
              {isCod ? "Amount due" : "Total paid"}
            </span>
            <span className="font-display text-lg font-semibold tabular-nums">
              {money(cur, order.total)}
            </span>
          </div>
        </section>

        {/* Payment verification */}
        {!isCod && (
          <section className="glass border border-emerald-500/20 rounded-2xl p-5 space-y-2">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="size-4 text-emerald-400" />
              <h2 className="text-xs uppercase tracking-widest text-emerald-400">
                Payment successful
              </h2>
            </div>
            <Row label="Paid via" value={paidVia} />
            {paymentId && <Row label="Payment ID" value={paymentId} />}
            {txnId && <Row label="Transaction ID" value={txnId} />}
            {paidAt && <Row label="Payment time" value={paidAt} />}
          </section>
        )}

        {/* Items */}
        {order.order_items?.length > 0 && (
          <section className="glass border border-white/10 rounded-2xl p-5">
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground mb-3">
              Items
            </h2>
            <ul className="space-y-3">
              {order.order_items.map((it) => {
                const variant = [it.variant_color, it.variant_size]
                  .filter(Boolean)
                  .join(" / ") || it.variant_name || null;
                return (
                  <li key={it.id} className="flex items-center gap-3">
                    <div className="size-14 shrink-0 rounded-xl overflow-hidden border border-white/10 bg-white/[0.03] grid place-items-center">
                      {it.image ? (
                        <img
                          src={it.image}
                          alt={it.name ?? "Product"}
                          loading="lazy"
                          className="size-full object-cover"
                        />
                      ) : (
                        <Package className="size-5 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{it.name}</p>
                      {variant && (
                        <p className="text-[11px] text-muted-foreground truncate">{variant}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground font-mono tabular-nums">
                        {money(cur, it.unit_price)} × {it.quantity}
                      </p>
                    </div>
                    <span className="font-mono text-sm tabular-nums">
                      {money(cur, it.line_total)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* Delivery */}
        <section className="glass border border-white/10 rounded-2xl p-5 space-y-2">
          <div className="flex items-center gap-2 mb-2">
            <MapPin className="size-4 text-accent" />
            <h2 className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Delivery
            </h2>
          </div>
          <Row label="Estimated delivery" value={eta} />
          {addr?.name && <Row label="Recipient" value={addr.name} />}
          {addrLine && <Row label="Address" value={addrLine} />}
          {order.carrier && <Row label="Courier" value={order.carrier} />}
          {order.tracking_number && (
            <Row label="Tracking number" value={order.tracking_number} />
          )}
        </section>

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-1">
          <button
            onClick={() => nav({ to: "/orders/$id", params: { id: order.id } })}
            className="w-full inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110"
          >
            <Truck className="size-3.5" /> Track your order
          </button>
          <button
            onClick={async () => {
              setDownloading(true);
              const ok = await (await import("@/lib/invoice")).downloadInvoice(order.id);
              if (!ok) toast.error("Couldn't generate invoice. Please try from your order page.");
              setDownloading(false);
            }}
            disabled={downloading}
            className="w-full inline-flex items-center justify-center gap-2 glass border border-white/10 text-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:border-accent/40 disabled:opacity-60"
          >
            {downloading ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Download className="size-3.5" />
            )}
            {downloading ? "Preparing…" : "Download invoice"}
          </button>
          <Link
            to="/"
            className="text-center text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground py-2"
          >
            Continue shopping
          </Link>
        </div>
      </motion.div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground text-xs uppercase tracking-widest shrink-0">
        {label}
      </span>
      <span className="font-mono text-right break-all">{value}</span>
    </div>
  );
}
