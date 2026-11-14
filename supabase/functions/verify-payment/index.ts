import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

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
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const { orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature } = await req.json();

    if (!orderId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return jsonResponse({ error: "Required payment signature fields missing." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");

    if (!supabaseUrl || !supabaseServiceKey || !keyId || !keySecret) {
      throw new Error("Server payment environment configuration is missing.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch Order and items
    const { data: order, error: orderFetchErr } = await supabase
      .from("orders")
      .select("id, order_number, total_paise, razorpay_order_id, status, customers(email, full_name), order_items(id, product_name_snapshot, products(id, drive_file_id))")
      .eq("id", orderId)
      .single();

    if (orderFetchErr || !order) {
      return jsonResponse({ error: "Order reference could not be located." }, 404);
    }

    if (order.razorpay_order_id !== razorpay_order_id) {
      return jsonResponse({ error: "Order identifier does not match transaction records." }, 400);
    }

    // 2. Validate HMAC SHA256 Signature
    const expectedSignature = await computeHmacSha256(keySecret, `${order.razorpay_order_id}|${razorpay_payment_id}`);
    if (!constantTimeEqual(expectedSignature, razorpay_signature)) {
      return jsonResponse({ error: "Payment verification signature mismatch." }, 400);
    }

    // 3. Double-check directly with Razorpay API for captured status
    const basicAuth = btoa(`${keyId}:${keySecret}`);
    const rzpRes = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`, {
      headers: { Authorization: `Basic ${basicAuth}` }
    });
    const paymentData = await rzpRes.json();

    if (!rzpRes.ok) {
      return jsonResponse({ error: "Unable to confirm payment status with gateway API." }, 502);
    }

    if (
      paymentData.order_id !== order.razorpay_order_id ||
      paymentData.amount !== order.total_paise ||
      paymentData.currency !== "INR" ||
      paymentData.status !== "captured"
    ) {
      return jsonResponse({
        error: "Payment is uncaptured or the transaction amount does not correspond with order value."
      }, 409);
    }

    // 4. Update Payment record
    await supabase.from("payments").update({
      gateway_payment_id: razorpay_payment_id,
      status: "captured",
      method: paymentData.method || null,
      bank: paymentData.bank || null,
      wallet: paymentData.wallet || null,
      vpa: paymentData.vpa || null,
      verified_at: new Date().toISOString(),
      raw_status: paymentData.status
    }).eq("gateway_order_id", order.razorpay_order_id);

    // 5. Update Order record to 'paid'
    await supabase.from("orders").update({
      status: "paid",
      updated_at: new Date().toISOString()
    }).eq("id", order.id);

    // 6. Build Idempotent Deliveries for primary products
    const customerEmail = (order.customers as any)?.email;
    const deliveryRows: any[] = [];

    for (const item of (order.order_items as any[])) {
      if (item.products?.drive_file_id) {
        deliveryRows.push({
          order_item_id: item.id,
          order_id: order.id,
          customer_email: customerEmail,
          product_name: item.product_name_snapshot,
          drive_file_id: item.products.drive_file_id,
          status: "pending"
        });
      }
    }

    if (deliveryRows.length > 0) {
      await supabase
        .from("deliveries")
        .upsert(deliveryRows, { onConflict: "order_item_id", ignoreDuplicates: true });
    }

    // 7. Audit log
    await supabase.from("audit_logs").insert({
      actor: "verify-payment-endpoint",
      action: "payment_captured",
      entity_type: "order",
      entity_id: order.id,
      safe_metadata: {
        order_number: order.order_number,
        payment_id: razorpay_payment_id,
        amount_paise: order.total_paise,
        items_count: deliveryRows.length
      }
    });

    // 8. Trigger Google Apps Script Webhook directly if configured
    const appsScriptUrl = Deno.env.get("GOOGLE_APPS_SCRIPT_WEBHOOK_URL");
    const appsScriptSecret = Deno.env.get("APPS_SCRIPT_SECRET_TOKEN");
    if (appsScriptUrl) {
      try {
        await fetch(appsScriptUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Delivery-Token": appsScriptSecret || ""
          },
          body: JSON.stringify({
            orderNumber: order.order_number,
            orderId: order.id,
            customerEmail: customerEmail
          })
        });
      } catch (scriptErr) {
        console.warn("Direct Apps Script trigger deferred to background schedule:", scriptErr);
      }
    }

    return jsonResponse({
      verified: true,
      orderNumber: order.order_number,
      message: "Payment successfully verified. PDF access permissions are being provisioned."
    });

  } catch (err) {
    console.error("verify-payment execution error:", err);
    return jsonResponse({
      error: "Payment verification could not be finalized. Please refrain from re-paying and contact support."
    }, 500);
  }
});
