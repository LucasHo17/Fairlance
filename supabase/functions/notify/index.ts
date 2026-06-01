import { createServiceClient, corsHeaders } from "../_shared/supabase.ts";

Deno.serve(async (req: Request) => {
  // Handle CORS preflight request
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405, headers: corsHeaders });
  }

  try {
    const serviceClient = createServiceClient();
    const body = await req.json();
    const { user_id, event_type, payload } = body;

    if (!user_id || !event_type) {
      return new Response(JSON.stringify({ error: "Missing user_id or event_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Insert into notifications
    const { error } = await serviceClient
      .from("notifications")
      .insert({
        user_id,
        event_type,
        payload: payload || {},
      });

    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Error in notify function:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
