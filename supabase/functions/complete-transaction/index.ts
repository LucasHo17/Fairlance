import { createUserClient, createServiceClient, corsHeaders } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Verify the caller's identity via their JWT.
  const userClient = createUserClient(req);
  const { data: { user }, error: authError } = await userClient.auth.getUser(
    authHeader.replace("Bearer ", ""),
  );
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { transaction_id } = await req.json() as { transaction_id: string };
  if (!transaction_id) {
    return new Response(JSON.stringify({ error: "transaction_id is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fetch the transaction and verify the caller is the customer.
  const { data: tx, error: txError } = await userClient
    .from("transactions")
    .select("*")
    .eq("id", transaction_id)
    .single();

  if (txError || !tx) {
    return new Response(JSON.stringify({ error: "Transaction not found" }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (tx.customer_id !== user.id) {
    return new Response(JSON.stringify({ error: "Only the customer may mark a transaction complete" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (tx.completed_at !== null) {
    return new Response(JSON.stringify({ error: "Transaction is already completed" }), {
      status: 409,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Use the service-role client to set completed_at (bypasses RLS).
  const serviceClient = createServiceClient();
  const { data: updated, error: updateError } = await serviceClient
    .from("transactions")
    .update({ completed_at: new Date().toISOString() })
    .eq("id", transaction_id)
    .select()
    .single();

  if (updateError) {
    return new Response(JSON.stringify({ error: updateError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // ── Trigger ML Retraining on 50-Transaction Batches (Option C) ──
  try {
    const { count, error: countError } = await serviceClient
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .not("completed_at", "is", null);

    if (!countError && count && count % 50 === 0) {
      const ML_SERVICE_URL = Deno.env.get("ML_SERVICE_URL");
      if (ML_SERVICE_URL) {
        console.log(`Completed transaction threshold hit (${count}). Triggering ML retraining...`);
        fetch(`${ML_SERVICE_URL}/predict-price/train`, { method: "POST" })
          .then((res) => res.json())
          .then((data) => console.log("Retraining successfully queued:", data))
          .catch((err) => console.error("Failed to queue ML retraining:", err));
      }
    }
  } catch (triggerErr) {
    console.error("Failed to check ML retraining trigger:", triggerErr);
  }

  return new Response(
    JSON.stringify({ success: true, transaction: updated }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
