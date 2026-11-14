import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const { orderNumber, email, subjectSlug, examDate, refundUpiId, evidenceUrl, reason } = await req.json();

    if (!orderNumber || !email || !subjectSlug || !examDate || !refundUpiId || !evidenceUrl) {
      return json({ error: "Missing required claim submission fields." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch Order and verify Customer
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, order_number, status, customer_id, customers(email), order_items(id, product_name_snapshot, unit_price_paise, products(slug))")
      .eq("order_number", orderNumber.trim())
      .single();

    if (orderErr || !order) {
      return json({ error: "Order not found. Please check your order reference number." }, 404);
    }

    const customerEmail = (order.customers as any)?.email;
    if (customerEmail?.toLowerCase() !== email.trim().toLowerCase()) {
      return json({ error: "The provided email does not match the purchasing customer record." }, 403);
    }

    if (order.status !== "paid") {
      return json({ error: `Cannot request a refund for an order with status: ${order.status}. Only paid orders are eligible.` }, 400);
    }

    // 2. Locate the specific purchased order item
    const targetItem = (order.order_items as any[]).find(
      (item) => item.products?.slug?.toLowerCase() === subjectSlug.toLowerCase()
    );

    if (!targetItem) {
      return json({ error: `The subject bundle '${subjectSlug}' was not part of order ${orderNumber}.` }, 400);
    }

    // 3. Check for existing claim
    const { data: existingRefund } = await supabase
      .from("refunds")
      .select("id, status")
      .eq("order_item_id", targetItem.id)
      .maybeSingle();

    if (existingRefund) {
      return json({ error: `A claim has already been registered for this subject (Current Status: ${existingRefund.status}).` }, 409);
    }

    // 4. Calculate exact 75% refund amount in integer paise
    const originalPricePaise = targetItem.unit_price_paise;
    const refundRatio = 0.75;
    const calculatedRefundPaise = Math.round(originalPricePaise * refundRatio);

    // 5. Insert Refund Claim
    const { data: newRefund, error: insertErr } = await supabase
      .from("refunds")
      .insert({
        order_id: order.id,
        order_item_id: targetItem.id,
        customer_id: order.customer_id,
        subject_name: targetItem.product_name_snapshot,
        exam_date: examDate,
        original_amount_paise: originalPricePaise,
        refund_ratio: refundRatio,
        calculated_refund_paise: calculatedRefundPaise,
        status: "requested",
        reason: String(reason || "").slice(0, 1000),
        evidence_url: evidenceUrl,
        customer_upi_id: refundUpiId
      })
      .select("id")
      .single();

    if (insertErr || !newRefund) throw (insertErr || new Error("Failed to register refund claim."));

    // 6. Audit Log
    await supabase.from("audit_logs").insert({
      actor: `customer:${email}`,
      action: "refund_claim_submitted",
      entity_type: "refund",
      entity_id: newRefund.id,
      safe_metadata: {
        order_number: orderNumber,
        subject: targetItem.product_name_snapshot,
        calculated_refund_paise: calculatedRefundPaise
      }
    });

    return json({
      success: true,
      claimId: newRefund.id,
      refundAmountRupees: calculatedRefundPaise / 100,
      status: "requested"
    });

  } catch (err) {
    console.error("submit-refund error:", err);
    return json({ error: "Internal error processing refund request. Please contact support directly." }, 500);
  }
});

