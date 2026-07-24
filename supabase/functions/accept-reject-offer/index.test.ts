/**
 * Integration tests for accept-reject-offer
 *
 * Prerequisites:
 *   - `supabase start` running
 *   - `supabase functions serve --env-file=.env` running
 *
 * Run:
 *   deno test supabase/functions/accept-reject-offer/index.test.ts --allow-net --allow-env --env-file=.env
 */

import assert from "node:assert/strict";

function assertEquals(actual: unknown, expected: unknown, message?: string) {
  assert.deepEqual(actual, expected, message);
}

function assertExists<T>(
  value: T,
  message?: string,
): asserts value is NonNullable<T> {
  assert.notEqual(value, null, message);
  assert.notEqual(value, undefined, message);
}

const BASE_URL = "http://localhost:54321/functions/v1/accept-reject-offer";
const AUTH_URL = "http://localhost:54321/auth/v1";
const REST_URL = "http://localhost:54321/rest/v1";

function requiredEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(
      `${name} must be set. Run tests with: deno test ... --env-file=.env`,
    );
  }
  return value;
}

const ANON_KEY = requiredEnv("SUPABASE_ANON_KEY");
const SERVICE_KEY = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");

const ts = Date.now();
let CATEGORY_ID: string;

async function signUp(email: string): Promise<{ jwt: string; userId: string }> {
  const res = await fetch(`${AUTH_URL}/signup`, {
    method: "POST",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "testpassword123" }),
  });
  const data = await res.json();
  assertExists(data.access_token, `Failed to sign up ${email}`);
  return { jwt: data.access_token, userId: data.user.id };
}

async function setRole(userId: string, role: "customer" | "freelancer") {
  await fetch(`${REST_URL}/users?id=eq.${userId}`, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role }),
  });
}

async function signUpAsFreelancer(
  email: string,
): Promise<{ jwt: string; userId: string }> {
  const user = await signUp(email);
  await setRole(user.userId, "freelancer");
  return user;
}

async function servicePost(table: string, body: unknown) {
  const res = await fetch(`${REST_URL}/${table}`, {
    method: "POST",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  return Array.isArray(data) ? data[0] : data;
}

async function serviceGet(path: string) {
  const res = await fetch(`${REST_URL}/${path}`, {
    headers: {
      apikey: SERVICE_KEY!,
      Authorization: `Bearer ${SERVICE_KEY}`,
    },
  });
  assertEquals(res.status, 200, `Service query failed: ${path}`);
  return res.json();
}

async function createListing(freelancerId: string): Promise<string> {
  const listing = await servicePost("listings", {
    freelancer_id: freelancerId,
    category_id: CATEGORY_ID,
    title: "Test Listing",
    description: "For testing",
    is_active: true,
  });
  assertExists(listing.id, "Failed to create test listing");
  return listing.id;
}

async function createOffer(
  customerId: string,
  freelancerId: string,
  listingId: string,
  status = "pending",
): Promise<string> {
  const offer = await servicePost("offers", {
    customer_id: customerId,
    freelancer_id: freelancerId,
    listing_id: listingId,
    amount: 150,
    status,
  });
  assertExists(offer.id, "Failed to create test offer");
  return offer.id;
}

async function post(jwt: string, body: unknown) {
  return fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

// Create a fresh category once before all tests run
const categoryRow = await servicePost("categories", {
  name: `ARO Category ${ts}`,
  slug: `aro-cat-${ts}`,
});
assertExists(categoryRow.id, "Failed to create test category");
CATEGORY_ID = categoryRow.id;

Deno.test("accept-reject-offer — rejects GET with 405", async () => {
  const { jwt } = await signUp(`aro_get_${ts}@example.com`);
  const res = await fetch(BASE_URL, {
    method: "GET",
    headers: { Authorization: `Bearer ${jwt}` },
  });
  assertEquals(res.status, 405);
  await res.body?.cancel();
});

Deno.test("accept-reject-offer — rejects missing Authorization header", async () => {
  const res = await fetch(BASE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offer_id: "anything", action: "accept" }),
  });
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("accept-reject-offer — rejects missing offer_id", async () => {
  const { jwt } = await signUp(`aro_missing_${ts}@example.com`);
  const res = await post(jwt, { action: "accept" });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertExists(body.error);
});

Deno.test("accept-reject-offer — rejects invalid action value", async () => {
  const { jwt } = await signUp(`aro_badaction_${ts}@example.com`);
  const res = await post(jwt, {
    offer_id: "00000000-0000-0000-0000-000000000000",
    action: "approve",
  });
  assertEquals(res.status, 400);
  const body = await res.json();
  assertExists(body.error);
});

Deno.test("accept-reject-offer — returns 404 for non-existent offer", async () => {
  const { jwt } = await signUp(`aro_notfound_${ts}@example.com`);
  const res = await post(jwt, {
    offer_id: "00000000-0000-0000-0000-000000000000",
    action: "accept",
  });
  assertEquals(res.status, 404);
  const body = await res.json();
  assertExists(body.error);
});

Deno.test("accept-reject-offer — customer cannot accept their own offer (403)", async () => {
  const { jwt: customerJwt, userId: customerId } = await signUp(
    `aro_cust_${ts}@example.com`,
  );
  const { userId: freelancerId } = await signUpAsFreelancer(
    `aro_free_${ts}@example.com`,
  );
  const listingId = await createListing(freelancerId);
  const offerId = await createOffer(customerId, freelancerId, listingId);
  const res = await post(customerJwt, { offer_id: offerId, action: "accept" });
  assertEquals(res.status, 403);
  const body = await res.json();
  assertExists(body.error);
});

Deno.test("accept-reject-offer — freelancer can reject a pending offer", async () => {
  const { userId: customerId } = await signUp(`aro_cust2_${ts}@example.com`);
  const { jwt: freelancerJwt, userId: freelancerId } = await signUpAsFreelancer(
    `aro_free2_${ts}@example.com`,
  );
  const listingId = await createListing(freelancerId);
  const offerId = await createOffer(customerId, freelancerId, listingId);
  const res = await post(freelancerJwt, {
    offer_id: offerId,
    action: "reject",
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.status, "rejected");
});

Deno.test("accept-reject-offer — freelancer can accept a pending offer and transaction is created", async () => {
  const { userId: customerId } = await signUp(`aro_cust3_${ts}@example.com`);
  const { jwt: freelancerJwt, userId: freelancerId } = await signUpAsFreelancer(
    `aro_free3_${ts}@example.com`,
  );
  const listingId = await createListing(freelancerId);
  const offerId = await createOffer(customerId, freelancerId, listingId);
  const res = await post(freelancerJwt, {
    offer_id: offerId,
    action: "accept",
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.status, "active");
  assertExists(body.transaction, "Transaction should be created on accept");
  assertExists(body.transaction.id, "Transaction should have an id");
  assertEquals(body.transaction.offer_id, offerId);
  assertEquals(body.idempotent, false);
});

Deno.test("accept-reject-offer — cannot act on an already-active offer (409)", async () => {
  const { userId: customerId } = await signUp(`aro_cust4_${ts}@example.com`);
  const { jwt: freelancerJwt, userId: freelancerId } = await signUpAsFreelancer(
    `aro_free4_${ts}@example.com`,
  );
  const listingId = await createListing(freelancerId);
  const offerId = await createOffer(
    customerId,
    freelancerId,
    listingId,
    "active",
  );
  const res = await post(freelancerJwt, {
    offer_id: offerId,
    action: "accept",
  });
  assertEquals(res.status, 409);
  const body = await res.json();
  assertExists(body.error);
});

Deno.test("accept-reject-offer — repeating a rejection is idempotent", async () => {
  const { userId: customerId } = await signUp(`aro_cust5_${ts}@example.com`);
  const { jwt: freelancerJwt, userId: freelancerId } = await signUpAsFreelancer(
    `aro_free5_${ts}@example.com`,
  );
  const listingId = await createListing(freelancerId);
  const offerId = await createOffer(
    customerId,
    freelancerId,
    listingId,
    "rejected",
  );
  const res = await post(freelancerJwt, {
    offer_id: offerId,
    action: "reject",
  });
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.success, true);
  assertEquals(body.status, "rejected");
  assertEquals(body.idempotent, true);
});

Deno.test("accept-reject-offer — repeating acceptance returns the original transaction", async () => {
  const { userId: customerId } = await signUp(
    `aro_retry_cust_${ts}@example.com`,
  );
  const { jwt: freelancerJwt, userId: freelancerId } = await signUpAsFreelancer(
    `aro_retry_free_${ts}@example.com`,
  );
  const listingId = await createListing(freelancerId);
  const offerId = await createOffer(customerId, freelancerId, listingId);

  const firstRes = await post(freelancerJwt, {
    offer_id: offerId,
    action: "accept",
  });
  assertEquals(firstRes.status, 200);
  const firstBody = await firstRes.json();
  assertEquals(firstBody.idempotent, false);

  const retryRes = await post(freelancerJwt, {
    offer_id: offerId,
    action: "accept",
  });
  assertEquals(retryRes.status, 200);
  const retryBody = await retryRes.json();
  assertEquals(retryBody.idempotent, true);
  assertEquals(retryBody.transaction.id, firstBody.transaction.id);

  const transactions = await serviceGet(
    `transactions?offer_id=eq.${offerId}&select=id,offer_id`,
  );
  assertEquals(transactions.length, 1);
});

Deno.test("accept-reject-offer — 50 concurrent accepts create exactly one transaction", async () => {
  const { userId: customerId } = await signUp(
    `aro_concurrent_cust_${ts}@example.com`,
  );
  const { jwt: freelancerJwt, userId: freelancerId } = await signUpAsFreelancer(
    `aro_concurrent_free_${ts}@example.com`,
  );
  const listingId = await createListing(freelancerId);
  const offerId = await createOffer(customerId, freelancerId, listingId);

  const responses = await Promise.all(
    Array.from(
      { length: 50 },
      () => post(freelancerJwt, { offer_id: offerId, action: "accept" }),
    ),
  );

  assertEquals(responses.every((response) => response.status === 200), true);

  const bodies = await Promise.all(responses.map((response) => response.json()));
  assertEquals(
    new Set(bodies.map((body) => body.transaction.id)).size,
    1,
  );
  assertEquals(bodies.filter((body) => body.idempotent === false).length, 1);
  assertEquals(bodies.filter((body) => body.idempotent === true).length, 49);

  const transactions = await serviceGet(
    `transactions?offer_id=eq.${offerId}&select=id,offer_id`,
  );
  assertEquals(transactions.length, 1);

  const offers = await serviceGet(
    `offers?id=eq.${offerId}&select=id,status`,
  );
  assertEquals(offers.length, 1);
  assertEquals(offers[0].status, "active");
});

Deno.test("accept-reject-offer — concurrent accept and reject cannot create a contradictory state", async () => {
  const { userId: customerId } = await signUp(
    `aro_conflict_cust_${ts}@example.com`,
  );
  const { jwt: freelancerJwt, userId: freelancerId } = await signUpAsFreelancer(
    `aro_conflict_free_${ts}@example.com`,
  );
  const listingId = await createListing(freelancerId);
  const offerId = await createOffer(customerId, freelancerId, listingId);

  const [acceptRes, rejectRes] = await Promise.all([
    post(freelancerJwt, { offer_id: offerId, action: "accept" }),
    post(freelancerJwt, { offer_id: offerId, action: "reject" }),
  ]);

  assertEquals(
    [acceptRes.status, rejectRes.status].sort((a, b) => a - b),
    [200, 409],
  );

  await acceptRes.body?.cancel();
  await rejectRes.body?.cancel();

  const offers = await serviceGet(
    `offers?id=eq.${offerId}&select=id,status`,
  );
  const transactions = await serviceGet(
    `transactions?offer_id=eq.${offerId}&select=id,offer_id`,
  );

  assertEquals(offers.length, 1);
  if (offers[0].status === "active") {
    assertEquals(transactions.length, 1);
  } else {
    assertEquals(offers[0].status, "rejected");
    assertEquals(transactions.length, 0);
  }
});
