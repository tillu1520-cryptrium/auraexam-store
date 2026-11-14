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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const identifier = String(body.identifier || "").trim().toLowerCase();

    if (!identifier || identifier.length < 3) {
      return json({ error: "Please provide a valid email address or order reference number." }, 400);
    }

    let ordersQuery = supabase
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        created_at,
        total_paise,
        customers!inner(id, full_name, email),
        order_items(
          id,
          product_name_snapshot,
          products(id, slug, name, drive_file_id)
        )
      `)
      .order("created_at", { ascending: false });

    if (identifier.includes("@")) {
      ordersQuery = ordersQuery.eq("customers.email", identifier);
    } else {
      ordersQuery = ordersQuery.ilike("order_number", identifier);
    }

    const { data: orders, error } = await ordersQuery;

    if (error) {
      console.error("Order lookup database error:", error);
      return json({ error: "Could not retrieve order details. Please retry." }, 500);
    }

    if (!orders || orders.length === 0) {
      return json({ orders: [] });
    }

    // Format safe client response with drive links
    const formattedOrders = orders.map((o: any) => {
      const items = (o.order_items || []).map((item: any) => {
        const fileId = item.products?.drive_file_id;
        return {
          name: item.product_name_snapshot,
          slug: item.products?.slug,
          driveUrl: fileId ? `https://drive.google.com/file/d/${fileId}/view?usp=sharing` : null,
          hasDriveAccess: Boolean(fileId)
        };
      });

      return {
        orderNumber: o.order_number,
        status: o.status,
        createdAt: o.created_at,
        totalAmountPaise: o.total_paise,
        customerName: o.customers?.full_name,
        customerEmail: o.customers?.email,
        items: items
      };
    });

    return json({ orders: formattedOrders });

  } catch (err) {
    console.error("Lookup order error:", err);
    return json({ error: "Internal server error occurred." }, 500);
  }
});
