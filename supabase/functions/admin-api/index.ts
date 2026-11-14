import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Verify Authorization Bearer Header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization credentials" }, 401);

    const token = authHeader.replace("Bearer ", "").trim();
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Invalid administrator session" }, 401);

    // 2. Verify Admin Role in admin_users
    const { data: adminRecord } = await supabase
      .from("admin_users")
      .select("id, email, role, active")
      .eq("supabase_auth_id", user.id)
      .eq("active", true)
      .maybeSingle();

    if (!adminRecord) {
      return json({ error: "Access denied. Insufficient administrative privileges." }, 403);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get("action");

    // Action: stats
    if (req.method === "GET" && action === "stats") {
      const { data: orders } = await supabase.from("orders").select("total_paise, status");
      const { count: deliveriesCount } = await supabase.from("deliveries").select("*", { count: "exact", head: true }).eq("status", "delivered");
      const { count: refundsCount } = await supabase.from("refunds").select("*", { count: "exact", head: true }).in("status", ["requested", "under_review"]);

      const totalRevenue = (orders || []).filter(o => o.status === "paid").reduce((s, o) => s + (o.total_paise || 0), 0);
      const totalOrders = (orders || []).length;
      const paidOrders = (orders || []).filter(o => o.status === "paid").length;

      return json({
        totalRevenuePaise: totalRevenue,
        totalOrders,
        paidOrders,
        deliveredCount: deliveriesCount || 0,
        pendingRefundsCount: refundsCount || 0,
        admin: { email: adminRecord.email, role: adminRecord.role }
      });
    }

    // Action: review-refund
    if (req.method === "POST" && action === "review-refund") {
      const body = await req.json();
      const { refundId, decision, decisionNotes } = body;

      if (!refundId || !["eligible", "rejected"].includes(decision)) {
        return json({ error: "Invalid refund decision parameters" }, 400);
      }

      const newStatus = decision === "eligible" ? "eligible" : "rejected";
      const { data: updatedRefund, error: refErr } = await supabase
        .from("refunds")
        .update({
          status: newStatus,
          reviewed_by: adminRecord.id,
          decision_notes: String(decisionNotes || "").slice(0, 1000),
          reviewed_at: new Date().toISOString()
        })
        .eq("id", refundId)
        .select()
        .single();

      if (refErr) throw refErr;

      // Audit log
      await supabase.from("audit_logs").insert({
        actor: `admin:${adminRecord.email}`,
        action: `refund_${decision}`,
        entity_type: "refund",
        entity_id: refundId,
        safe_metadata: { decision, notes: decisionNotes }
      });

      return json({ success: true, refund: updatedRefund });
    }

    return json({ error: "Invalid administrative action requested" }, 400);

  } catch (err) {
    console.error("admin-api error", err);
    return json({ error: "Internal administrative processing error" }, 500);
  }
});
