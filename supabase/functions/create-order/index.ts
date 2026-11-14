import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: corsHeaders });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidMobile(mobile: string): boolean {
  return /^[6-9]\d{9}$/.test(mobile);
}

function isValidUpi(upi: string): boolean {
  return /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z0-9.-]{2,64}$/.test(upi);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const body = await req.json();
    const fullName = String(body.fullName ?? "").trim();
    const rollNumber = String(body.rollNumber ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase();
    const mobile = String(body.mobile ?? "").replace(/\s+/g, "");
    const refundUpiId = String(body.refundUpiId ?? "").trim();
    const rawProducts = Array.isArray(body.products) ? body.products : [];
    const slugs = [...new Set(rawProducts.map((s: unknown) => String(s).trim().toLowerCase()))];

    // Strict Input Validation
    if (fullName.length < 2 || fullName.length > 120) {
      return jsonResponse({ error: "Enter a valid full name between 2 and 120 characters." }, 400);
    }
    if (!rollNumber || rollNumber.length > 60) {
      return jsonResponse({ error: "Enter a valid academic roll or registration number." }, 400);
    }
    if (!isValidEmail(email)) {
      return jsonResponse({ error: "Enter a valid email address for delivery." }, 400);
    }
    if (!isValidMobile(mobile)) {
      return jsonResponse({ error: "Enter a valid 10-digit Indian mobile number." }, 400);
    }
    if (!isValidUpi(refundUpiId)) {
      return jsonResponse({ error: "Enter a valid UPI ID (e.g. name@bank) for potential 75% refund credits." }, 400);
    }
    if (slugs.length === 0 || slugs.length > 20) {
      return jsonResponse({ error: "Select at least one subject bundle." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Supabase server environment is not configured.");
    }
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Fetch active products strictly from trusted backend database
    const { data: products, error: productError } = await supabase
      .from("products")
      .select("id, slug, name, price_paise, active")
      .in("slug", slugs)
      .eq("active", true);

    if (productError || !products || products.length !== slugs.length) {
      return jsonResponse({ error: "One or more selected subject bundles are currently unavailable." }, 400);
    }

    // 2. Compute trusted total in integer paise
    const totalPaise = products.reduce((sum, p) => sum + Number(p.price_paise), 0);
    if (!Number.isSafeInteger(totalPaise) || totalPaise <= 0) {
      return jsonResponse({ error: "Error calculating order subtotal." }, 400);
    }

    // 3. Upsert Customer Record (Deduplicate by email to maintain customer history)
    let customerId: string;
    const { data: existingCustomer } = await supabase
      .from("customers")
      .select("id, total_orders_count")
      .eq("email", email)
      .maybeSingle();

    if (existingCustomer) {
      customerId = existingCustomer.id;
      await supabase
        .from("customers")
        .update({
          full_name: fullName,
          roll_number: rollNumber,
          mobile: mobile,
          refund_upi_id: refundUpiId,
          total_orders_count: (existingCustomer.total_orders_count || 0) + 1,
          updated_at: new Date().toISOString()
        })
        .eq("id", customerId);
    } else {
      const { data: newCustomer, error: createCustErr } = await supabase
        .from("customers")
        .insert({
          full_name: fullName,
          roll_number: rollNumber,
          email: email,
          mobile: mobile,
          refund_upi_id: refundUpiId,
          total_orders_count: 1
        })
        .select("id")
        .single();

      if (createCustErr || !newCustomer) throw (createCustErr || new Error("Failed to create customer record."));
      customerId = newCustomer.id;
    }

    // 4. Generate Unique Order Number
    const orderNumber = `EP-${Date.now()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;

    // 5. Insert Order
    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        customer_id: customerId,
        subtotal_paise: totalPaise,
        discount_paise: 0,
        total_paise: totalPaise,
        currency: "INR",
        status: "payment_pending",
        notes: {
          client_ip: req.headers.get("x-forwarded-for") ?? "unknown",
          user_agent: req.headers.get("user-agent") ?? "unknown"
        }
      })
      .select("id, order_number, total_paise")
      .single();

    if (orderError || !order) throw (orderError || new Error("Failed to create order."));

    // 6. Insert Order Items (one item per 10-set bundle)
    const itemRows = products.map((p) => ({
      order_id: order.id,
      product_id: p.id,
      product_name_snapshot: p.name,
      unit_price_paise: p.price_paise,
      quantity: 1
    }));

    const { error: itemsError } = await supabase.from("order_items").insert(itemRows);
    if (itemsError) throw itemsError;

    // 7. Create Razorpay Order
    const keyId = Deno.env.get("RAZORPAY_KEY_ID");
    const keySecret = Deno.env.get("RAZORPAY_KEY_SECRET");
    if (!keyId || !keySecret) {
      throw new Error("Payment gateway credentials not set in Edge Function secrets.");
    }

    const authHeader = btoa(`${keyId}:${keySecret}`);
    const rzpResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: totalPaise,
        currency: "INR",
        receipt: orderNumber,
        notes: {
          internal_order_id: order.id,
          order_number: orderNumber,
          customer_email: email
        }
      })
    });

    const rzpOrder = await rzpResponse.json();
    if (!rzpResponse.ok) {
      throw new Error(`Razorpay API Error: ${rzpOrder.error?.description || "Order creation failed"}`);
    }

    // 8. Update Order with gateway reference & create pending Payment row
    await supabase.from("orders").update({ razorpay_order_id: rzpOrder.id }).eq("id", order.id);
    await supabase.from("payments").insert({
      order_id: order.id,
      gateway: "razorpay",
      gateway_order_id: rzpOrder.id,
      amount_paise: totalPaise,
      currency: "INR",
      status: "created"
    });

    // 9. Audit Log
    await supabase.from("audit_logs").insert({
      actor: "system-create-order",
      action: "order_created",
      entity_type: "order",
      entity_id: order.id,
      safe_metadata: {
        order_number: orderNumber,
        total_paise: totalPaise,
        products: slugs
      }
    });

    return jsonResponse({
      orderId: order.id,
      orderNumber: orderNumber,
      razorpayOrderId: rzpOrder.id,
      amount: totalPaise,
      currency: "INR",
      keyId: keyId
    });

  } catch (err) {
    console.error("create-order execution error:", err);
    return jsonResponse({
      error: "Unable to initialize checkout. Please retry or contact support if the problem persists."
    }, 500);
  }
});
