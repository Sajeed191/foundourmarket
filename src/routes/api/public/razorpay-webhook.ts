import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyWebhookSignature } from "@/lib/razorpay.server";
import { enqueueOrderEmail } from "@/lib/order-emails.server";
import { callerKey, consumeRateLimit, tooManyRequests } from "@/lib/security/server-rate-limit";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

function auditPayload(event: string, payload: any) {
  const payment = payload?.payload?.payment?.entity;
  const refund = payload?.payload?.refund?.entity;
  const order = payload?.payload?.order?.entity;
  const token = payload?.payload?.token?.entity;
  return {
    event,
    payment_id: payment?.id ?? null,
    order_id: payment?.order_id ?? order?.id ?? null,
    refund_id: refund?.id ?? null,
    token_id: token?.id ?? null,
  };
}

/**
 * Razorpay webhook receiver. Configure this URL in the Razorpay dashboard:
 *   https://foundourmarket.com/api/public/razorpay-webhook
 * and set the same secret you saved as RAZORPAY_WEBHOOK_SECRET.
 *
 * Handles: payment.captured, payment.failed, refund.processed, order.paid
 */
export const Route = createFileRoute("/api/public/razorpay-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rate = consumeRateLimit(callerKey(request, "razorpay-webhook"), 300, 60_000);
        if (!rate.allowed) return tooManyRequests(rate, "Too many webhook requests");
        const declaredLength = Number(request.headers.get("content-length") || "0");
        if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
          return new Response("Payload too large", { status: 413 });
        }
        const signature = request.headers.get("x-razorpay-signature") ?? "";
        const rawBody = await request.text();
        if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
          return new Response("Payload too large", { status: 413 });
        }

        const valid = verifyWebhookSignature(rawBody, signature);

        let payload: any = null;
        try {
          payload = JSON.parse(rawBody);
        } catch {
          /* keep null */
        }
        const event: string = payload?.event ?? "unknown";

        if (!valid) {
          return new Response("Invalid signature", { status: 401 });
        }

        // Persist only identifiers required for operational audit, never the
        // provider's full payment payload (which may contain customer PII).
        const { data: logRow } = await supabaseAdmin
          .from("webhook_logs")
          .insert({
            provider: "razorpay",
            event,
            payload: auditPayload(event, payload),
            signature_valid: true,
            status: "received",
          })
          .select("id")
          .single();

        try {
          await handleEvent(event, payload);
          if (logRow?.id) {
            await supabaseAdmin
              .from("webhook_logs")
              .update({ status: "processed", processed_at: new Date().toISOString() })
              .eq("id", logRow.id);
          }
        } catch (e: any) {
          if (logRow?.id) {
            await supabaseAdmin
              .from("webhook_logs")
              .update({ status: "error", error: "event_processing_failed" })
              .eq("id", logRow.id);
          }
          console.error("razorpay webhook handler error", {
            event,
            name: e instanceof Error ? e.name : "UnknownError",
          });
          // Return 200 so Razorpay doesn't retry forever on logic errors we logged
          return new Response("ok", { status: 200 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});

async function findOrderByRzpOrderId(rzpOrderId?: string) {
  if (!rzpOrderId) return null;
  const { data } = await supabaseAdmin
    .from("orders")
    .select("id,user_id,total,currency,payment_status")
    .eq("razorpay_order_id", rzpOrderId)
    .maybeSingle();
  return data;
}

// For each purchased product that has an active flash deal, log a 'purchase'
// event so the admin can compute deal conversion rates.
async function recordFlashDealPurchases(orderId: string) {
  try {
    const { data: items } = await supabaseAdmin
      .from("order_items")
      .select("product_slug")
      .eq("order_id", orderId);
    const slugs = [...new Set((items ?? []).map((i: any) => i.product_slug).filter(Boolean))];
    if (slugs.length === 0) return;
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id,slug")
      .in("slug", slugs);
    const ids = (products ?? []).map((p: any) => p.id);
    if (ids.length === 0) return;
    const { data: deals } = await supabaseAdmin
      .from("flash_deals")
      .select("id,product_id")
      .eq("active", true)
      .in("product_id", ids);
    if (!deals || deals.length === 0) return;
    await supabaseAdmin.from("flash_deal_events").insert(
      deals.map((d: any) => ({ event_type: "purchase", deal_id: d.id, product_id: d.product_id })),
    );
  } catch {
    // Analytics must never break the payment webhook.
  }
}

async function handleEvent(event: string, payload: any) {
  const paymentEntity = payload?.payload?.payment?.entity;
  const refundEntity = payload?.payload?.refund?.entity;
  const orderEntity = payload?.payload?.order?.entity;

  switch (event) {
    case "payment.captured": {
      const order = await findOrderByRzpOrderId(paymentEntity?.order_id);
      if (!order) return;
      if (order.payment_status !== "succeeded") {
        // Commit reserved stock permanently (idempotent), then mark paid.
        await supabaseAdmin.rpc("commit_order_stock", { _order_id: order.id });
        await supabaseAdmin
          .from("orders")
          .update({
            status: "paid",
            payment_status: "succeeded",
            razorpay_payment_id: paymentEntity?.id ?? null,
          })
          .eq("id", order.id);

        // Record flash-deal purchase events for conversion analytics.
        await recordFlashDealPurchases(order.id);
      }
      // Upsert payment record idempotently
      const { data: existing } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("razorpay_payment_id", paymentEntity?.id)
        .maybeSingle();
      if (!existing) {
        await supabaseAdmin.from("payments").insert({
          order_id: order.id,
          user_id: order.user_id,
          method: paymentEntity?.method ?? "razorpay",
          status: "succeeded",
          amount: (paymentEntity?.amount ?? 0) / 100,
          currency: paymentEntity?.currency ?? order.currency,
          transaction_id: paymentEntity?.id ?? "",
          razorpay_order_id: paymentEntity?.order_id ?? null,
          razorpay_payment_id: paymentEntity?.id ?? null,
          fee: (paymentEntity?.fee ?? 0) / 100,
          gateway_tax: (paymentEntity?.tax ?? 0) / 100,
          demo: false,
          meta: { source: "webhook.payment.captured" },
        });
      } else {
        await supabaseAdmin
          .from("payments")
          .update({
            status: "succeeded",
            method: paymentEntity?.method ?? "razorpay",
            fee: (paymentEntity?.fee ?? 0) / 100,
            gateway_tax: (paymentEntity?.tax ?? 0) / 100,
          })
          .eq("id", existing.id);
      }
      try {
        await enqueueOrderEmail(order.id, "order-confirmed");
        await enqueueOrderEmail(order.id, "payment-verified");
      } catch (emailErr: any) {
        console.error("[razorpay-webhook] order email dispatch failed", {
          orderId: order.id,
          error: String(emailErr?.message ?? emailErr),
        });
      }
      break;
    }

    case "payment.failed": {
      const order = await findOrderByRzpOrderId(paymentEntity?.order_id);
      if (!order) return;
      if (order.payment_status !== "succeeded") {
        // Give the reserved stock back (idempotent), then mark failed.
        await supabaseAdmin.rpc("release_order_stock", {
          _order_id: order.id,
          _reason: "webhook_payment_failed",
        });
        await supabaseAdmin
          .from("orders")
          .update({ status: "payment_failed", payment_status: "failed" })
          .eq("id", order.id);
      }
      const { data: existing } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("razorpay_payment_id", paymentEntity?.id)
        .maybeSingle();
      if (!existing && paymentEntity?.id) {
        await supabaseAdmin.from("payments").insert({
          order_id: order.id,
          user_id: order.user_id,
          method: paymentEntity?.method ?? "razorpay",
          status: "failed",
          amount: (paymentEntity?.amount ?? 0) / 100,
          currency: paymentEntity?.currency ?? order.currency,
          transaction_id: paymentEntity?.id ?? "",
          razorpay_order_id: paymentEntity?.order_id ?? null,
          razorpay_payment_id: paymentEntity?.id ?? null,
          demo: false,
          meta: {
            source: "webhook.payment.failed",
            error_description: paymentEntity?.error_description ?? null,
          },
        });
      }
      break;
    }

    case "order.paid": {
      const order = await findOrderByRzpOrderId(orderEntity?.id);
      if (order && order.payment_status !== "succeeded") {
        await supabaseAdmin
          .from("orders")
          .update({ status: "paid", payment_status: "succeeded" })
          .eq("id", order.id);
      }
      break;
    }

    case "refund.processed": {
      const rzpPaymentId = refundEntity?.payment_id;
      const { data: pay } = await supabaseAdmin
        .from("payments")
        .select("id,order_id")
        .eq("razorpay_payment_id", rzpPaymentId)
        .maybeSingle();

      const { data: existingRefund } = await supabaseAdmin
        .from("refunds")
        .select("id")
        .eq("razorpay_refund_id", refundEntity?.id)
        .maybeSingle();

      if (!existingRefund && refundEntity?.id && pay?.order_id) {
        await supabaseAdmin.from("refunds").insert({
          order_id: pay.order_id,
          payment_id: pay.id,
          razorpay_refund_id: refundEntity?.id,
          razorpay_payment_id: rzpPaymentId,
          amount: (refundEntity?.amount ?? 0) / 100,
          currency: refundEntity?.currency ?? "INR",
          status: "processed",
          notes: { source: "webhook.refund.processed" },
        });
      } else if (existingRefund) {
        await supabaseAdmin
          .from("refunds")
          .update({ status: "processed" })
          .eq("id", (existingRefund as { id: string }).id);
      }


      if (pay?.order_id) {
        await supabaseAdmin
          .from("orders")
          .update({ status: "refunded", payment_status: "refunded" })
          .eq("id", pay.order_id);

        try {
          await enqueueOrderEmail(pay.order_id, "refund-processed", {
            refundAmount: (refundEntity?.amount ?? 0) / 100,
            refundCurrency: refundEntity?.currency ?? "INR",
          });
        } catch (emailErr: any) {
          console.error("[razorpay-webhook] refund email dispatch failed", {
            orderId: pay.order_id,
            error: String(emailErr?.message ?? emailErr),
          });
        }
      }
      break;
    }

    case "token.created": {
      await handleTokenCreated(payload);
      break;
    }

    case "token.deleted": {
      await handleTokenDeleted(payload);
      break;
    }

    default:
      // Unhandled event — already logged
      break;
  }
}

/** Map a Razorpay customer id to our platform user id. */
async function userForCustomer(customerId?: string) {
  if (!customerId) return null;
  const { data } = await supabaseAdmin
    .from("razorpay_customers")
    .select("user_id")
    .eq("razorpay_customer_id", customerId)
    .maybeSingle();
  return data?.user_id ?? null;
}

async function handleTokenCreated(payload: any) {
  const token = payload?.payload?.token?.entity;
  const customerId: string | undefined = token?.customer_id;
  const userId = await userForCustomer(customerId);
  if (!token?.id || !customerId || !userId) return;

  const isUpi = token.method === "upi" || !!token.vpa;
  const upiVpa = token.vpa
    ? [token.vpa.username, token.vpa.handle].filter(Boolean).join("@")
    : null;

  const { data: existing } = await supabaseAdmin
    .from("saved_payment_methods")
    .select("id")
    .eq("user_id", userId);

  await supabaseAdmin.from("saved_payment_methods").upsert(
    {
      user_id: userId,
      razorpay_customer_id: customerId,
      razorpay_token_id: token.id,
      provider: "razorpay",
      payment_type: isUpi ? "upi" : "card",
      brand: token.card?.network ?? null,
      last4: token.card?.last4 ?? null,
      expiry_month: token.card?.expiry_month ?? null,
      expiry_year: token.card?.expiry_year ?? null,
      upi_vpa: upiVpa,
      is_default: !existing?.length,
    },
    { onConflict: "user_id,razorpay_token_id" },
  );

  await supabaseAdmin.from("tokenization_logs").insert({
    user_id: userId,
    razorpay_customer_id: customerId,
    razorpay_token_id: token.id,
    payment_type: isUpi ? "upi" : "card",
    status: "saved",
    metadata: { source: "webhook.token.created" },
  });
}

async function handleTokenDeleted(payload: any) {
  const token = payload?.payload?.token?.entity;
  if (!token?.id) return;
  await supabaseAdmin
    .from("saved_payment_methods")
    .delete()
    .eq("razorpay_token_id", token.id);
}
