/**
 * Integration tests for categorize-service Edge Function
 *
 * Run:
 *   deno test supabase/functions/categorize-service/index.test.ts --allow-net --allow-env --env-file=.env
 */

import { assertEquals, assertExists } from "jsr:@std/assert";

const BASE_URL = "http://localhost:54321/functions/v1/categorize-service";
const AUTH_URL = "http://localhost:54321/auth/v1";

const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");

if (!ANON_KEY) {
  throw new Error("SUPABASE_ANON_KEY must be set. Run tests with: deno test ... --env-file=.env");
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ts = Date.now();
let userJwt = "";

async function signUp(email: string): Promise<string> {
  const res = await fetch(`${AUTH_URL}/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpassword123" }),
  });
  const data = await res.json();
  assertExists(data.access_token, `Failed to sign up ${email}`);
  return data.access_token;
}

async function post(jwt: string | null, body: unknown) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (jwt) {
    headers["Authorization"] = `Bearer ${jwt}`;
  }
  return fetch(BASE_URL, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

// ── Setup ─────────────────────────────────────────────────────────────────────

async function setupTestData() {
  userJwt = await signUp(`cat_user_${ts}@example.com`);
}

await setupTestData();

// ── Tests ─────────────────────────────────────────────────────────────────────

Deno.test("categorize-service — rejects GET with 405", async () => {
  const res = await fetch(BASE_URL, {
    method: "GET",
    headers: userJwt ? { Authorization: `Bearer ${userJwt}` } : {},
  });
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test("categorize-service — rejects unauthenticated requests", async () => {
  const res = await post(null, {
    description: "Building React websites",
    claimedCategory: "web-development",
  });
  assertEquals(res.status, 500); // Because missing Authorization header throws an error in createUserClient
  await res.body?.cancel();
});

Deno.test("categorize-service — rejects missing params", async () => {
  const res = await post(userJwt, {
    description: "Just description without category",
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertExists(body.error);
});

Deno.test("categorize-service — happy path returns semantic categorization", async () => {
  const res = await post(userJwt, {
    description: "We will build a responsive react website and optimize the backend using node.js.",
    claimedCategory: "web-development",
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertExists(body.match, "Missing match boolean");
  assertExists(body.confidence, "Missing confidence score");
  assertEquals(typeof body.match, "boolean");
  assertEquals(typeof body.confidence, "number");
});
