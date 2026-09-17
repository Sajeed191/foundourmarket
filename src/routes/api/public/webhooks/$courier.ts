import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { detectCourier } from "@/lib/courier-sync.service";
import {
  verifyCourierSignature,
  isReplay,
  parseScan,
  processCourierScan,
} from "@/lib/courier-webhook.server";
import { callerKey, consumeRateLimit, tooManyRequests } from "@/lib/security/server-rate-limit";

const MAX_WEBHOOK_BYTES = 1024 * 1024;

/**
 * Unified courier webhook receiver. Configure each courier to POST to:
 *   https://foundourmarket.com/api/public/webhooks/<courier>
 * e.g. /api/public/webhooks/delhivery, /shiprocket, /bluedart, /dhl ...
 *
 * Security: per-courier HMAC-SHA256 signature (header `x-courier-signature`),
 * optional replay-window check (`x-courier-timestamp`), webhook-level + event-level
 * idempotency, and full audit logging. Fails closed when no secret is configured.
 */
export const Route = createFileRoute("/api/public/webhooks/$courier")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const rate = consumeRateLimit(callerKey(request, "courier-webhook"), 180, 60_000);
        if (!rate.allowed) return tooManyRequests(rate, "Too many webhook requests");
        const declaredLength = Number(request.headers.get("content-length") || "0");
        if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
          return new Response("Payload too large", { status: 413 });
        }
        const spec = detectCourier(params.courier);
        const rawBody = await request.text();
        if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BYTES) {
          return new Response("Payload too large", { status: 413 });
        }
        const signature =
          request.headers.get("x-courier-signature") ??
          request.headers.get("x-webhook-signature") ??
          request.headers.get("x-delhivery-signature");
        const tsHeader = request.headers.get("x-courier-timestamp");

        let payload: unknown = null;
        try { payload = JSON.parse(rawBody); } catch { /* keep null */ }

        if (!spec) {
          return new Response("Unsupported courier", { status: 404 });
        }

        const valid = verifyCourierSignature(spec.key, rawBody, signature);
        if (!valid) return new Response("Invalid signature", { status: 401 });

        const scan = parseScan(payload);
        const externalId = scan.eventId;

        // Always audit the delivery.
        const { data: logRow } = await supabaseAdmin
          .from("courier_webhook_events")
          .insert({
            courier: spec.key,
            external_event_id: externalId,
            signature_valid: true,
            status: "received",
            tracking_number: scan.trackingNumber,
            payload: {
              event_id: scan.eventId,
              status_code: scan.statusCode,
              occurred_at: scan.occurredAt,
            } as never,
          })
          .select("id")
          .maybeSingle();

        if (isReplay(tsHeader)) {
          if (logRow?.id) await supabaseAdmin.from("courier_webhook_events")
            .update({ status: "replay_rejected" }).eq("id", logRow.id);
          return new Response("Stale request", { status: 408 });
        }

        try {
          const result = await processCourierScan(spec.key, scan);
          if (logRow?.id) {
            await supabaseAdmin.from("courier_webhook_events").update({
              status: result.ok ? (result.outcome ?? "processed") : "error",
              shipment_id: null,
              error: result.ok ? null : result.reason,
              processed_at: new Date().toISOString(),
            }).eq("id", logRow.id);
          }
          // 200 so couriers don't retry forever on business-logic outcomes.
          return Response.json(result);
        } catch (e) {
          if (logRow?.id) await supabaseAdmin.from("courier_webhook_events")
            .update({ status: "error", error: "event_processing_failed" }).eq("id", logRow.id);
          console.error("[courier webhook] handler error", {
            courier: spec.key,
            name: e instanceof Error ? e.name : "UnknownError",
          });
          return new Response("ok", { status: 200 });
        }
      },
    },
  },
});
