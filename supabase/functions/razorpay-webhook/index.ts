import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function computeHmacSha256(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return toHex(signature);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const receivedSignature = req.headers.get("x-razorpay-signature") ?? "";
  const webhookSecret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");

  if (!webhookSecret) {
    console.error("RAZORPAY_WEBHOOK_SECRET is not configured.");
    return new Response("Server Misconfigured", { status: 500 });
  }

  const expectedSignature = await computeHmacSha256(webhookSecret, rawBody);
  if (!constantTimeEqual(expectedSignature, receivedSignature)) {
    console.warn("Invalid webhook HMAC signature rejected.");
    return new Response("Invalid Signature", { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response("Database Configuration Missing", { status: 500 });
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const event = JSON.parse(rawBody);
    const eventId = event.event_id || `evt_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
    const eventType = event.event;

    // 1. Idempotency Check: Save event in webhook_events
    const { data: existingEvent } = await supabase
      .from("webhook_events")
      .select("id, processed")
      .eq("gateway", "razorpay")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingEvent?.processed) {
      // Event has already been processed safely
      return new Response("Already Processed", { status: 200 });
    }

    if (!existingEvent) {
      await supabase.from("webhook_events").insert({
        gateway: "razorpay",
        event_id: eventId,
        event_type: eventType,
        payload: event,
        processed: false
      });
    }

    // 2. Process Specific Events
    if (eventType === "payment.captured") {
      const paymentEntity = event.payload?.payment?.entity;
      if (paymentEntity?.order_id) {
        const { data: order } = await supabase
          .from("orders")
          .select("id, total_paise, order_number, status, customers(email), order_items(id, product_name_snapshot, products(drive_file_id))")
          .eq("razorpay_order_id", paymentEntity.order_id)
          .maybeSingle();

        if (
          order &&
          paymentEntity.status === "captured" &&
          paymentEntity.amount === order.total_paise &&
          paymentEntity.currency === "INR"
        ) {
          // Update Payment status
          await supabase.from("payments").update({
            gateway_payment_id: paymentEntity.id,
            status: "captured",
            verified_at: new Date().toISOString(),
            raw_status: "captured"
          }).eq("gateway_order_id", paymentEntity.order_id);

          // Update Order status
          await supabase.from("orders").update({
            status: "paid",
            updated_at: new Date().toISOString()
          }).eq("id", order.id);

          // Ensure deliveries are queued
          const email = (order.customers as any)?.email;
          const rows = (order.order_items as any[])
            .map((item) => ({
              order_item_id: item.id,
              order_id: order.id,
              customer_email: email,
              product_name: item.product_name_snapshot,
              drive_file_id: item.products?.drive_file_id ?? "",
              status: "pending"
            }))
            .filter((d) => d.drive_file_id);

          if (rows.length > 0) {
            await supabase
              .from("deliveries")
              .upsert(rows, { onConflict: "order_item_id", ignoreDuplicates: true });
          }
        }
      }
    } else if (eventType === "payment.failed") {
      const paymentEntity = event.payload?.payment?.entity;
      if (paymentEntity?.order_id) {
        await supabase.from("payments").update({
          status: "failed",
          error_code: paymentEntity.error_code || null,
          error_description: paymentEntity.error_description || null,
          raw_status: "failed"
        }).eq("gateway_order_id", paymentEntity.order_id);

        await supabase.from("orders").update({
          status: "payment_failed",
          updated_at: new Date().toISOString()
        }).eq("razorpay_order_id", paymentEntity.order_id);
      }
    } else if (eventType === "refund.processed") {
      const refundEntity = event.payload?.refund?.entity;
      if (refundEntity?.payment_id) {
        await supabase.from("refunds").update({
          status: "processed",
          processed_at: new Date().toISOString()
        }).eq("gateway_refund_id", refundEntity.id);
      }
    }

    // 3. Mark event as processed
    await supabase.from("webhook_events").update({
      processed: true
    }).eq("gateway", "razorpay").eq("event_id", eventId);

    return new Response("Event Processed Successfully", { status: 200 });

  } catch (err) {
    console.error("Webhook execution failed:", err);
    return new Response("Webhook Handler Error", { status: 500 });
  }
});
