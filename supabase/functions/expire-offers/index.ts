import "@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { data, error } = await supabaseAdmin.rpc("expire_stale_offers");

    if (error) {
      throw error;
    }

    return new Response(JSON.stringify({ success: true, rows_affected: data }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Failed to expire stale offers:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
