import { corsHeaders, createUserClient } from "../_shared/supabase.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: jsonHeaders });
}

function statusForDatabaseError(code?: string) {
  switch (code) {
    case "P0002":
      return 404;
    case "42501":
      return 403;
    case "22023":
      return 400;
    case "55000":
    case "23505":
      return 409;
    default:
      return 500;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method Not Allowed" }, 405);
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  try {
    const userClient = createUserClient(req);
    const { data: { user }, error: authError } = await userClient.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const { offer_id, action } = await req.json() as {
      offer_id?: string;
      action?: string;
    };

    if (!offer_id || !action || !["accept", "reject"].includes(action)) {
      return jsonResponse(
        { error: "offer_id and action (accept|reject) are required" },
        400,
      );
    }

    // PostgreSQL owns authorization, row locking, the state transition, and
    // transaction creation. The RPC is one database transaction.
    const { data, error } = await userClient.rpc("respond_to_offer", {
      p_offer_id: offer_id,
      p_action: action,
    });

    if (error) {
      return jsonResponse(
        { error: error.message, code: error.code },
        statusForDatabaseError(error.code),
      );
    }

    return jsonResponse(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return jsonResponse({ error: message }, 400);
  }
});
