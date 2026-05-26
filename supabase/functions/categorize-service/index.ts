import "@supabase/functions-js/edge-runtime.d.ts";
import { createUserClient, corsHeaders } from "../_shared/supabase.ts";

const ML_SERVICE_URL = Deno.env.get("ML_SERVICE_URL");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status);
}

Deno.serve(async (req) => {
  // 1. Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // 2. Only allow POST requests
  if (req.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    // 3. Extract and authenticate User Client
    const supabase = createUserClient(req);
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return errorResponse("Unauthorized", 401);
    }

    // 4. Parse request payload
    const { description, claimedCategory } = await req.json() as {
      description?: string;
      claimedCategory?: string;
    };

    if (!description || !claimedCategory) {
      return errorResponse("Both description and claimedCategory are required.");
    }

    // 5. Call private ML Service if configured
    if (!ML_SERVICE_URL) {
      return errorResponse("ML Service is not configured.", 500);
    }

    const mlResponse = await fetch(`${ML_SERVICE_URL}/categorize-service`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, claimedCategory }),
    });

    if (!mlResponse.ok) {
      const mlErrText = await mlResponse.text();
      return errorResponse(`ML service error: ${mlResponse.status} - ${mlErrText}`, 502);
    }

    const data = await mlResponse.json();
    return jsonResponse(data);
  } catch (err) {
    return errorResponse(err.message, 500);
  }
});
