import { performance } from "node:perf_hooks";

const DEFAULT_CONCURRENCY = [1, 10, 50];
const DEFAULT_REQUESTS = 50;
const DEFAULT_RATING = 4.5;

function parseArgs(argv) {
  const values = new Map();
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [key, ...rest] = arg.slice(2).split("=");
    values.set(key, rest.join("=") || "true");
  }
  return values;
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value.replace(/\/$/, "");
}

function percentile(sortedValues, percentileValue) {
  if (sortedValues.length === 0) return 0;
  const index = Math.max(
    0,
    Math.ceil((percentileValue / 100) * sortedValues.length) - 1,
  );
  return sortedValues[index];
}

function round(value, decimals = 2) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

async function discoverCategoryId(baseUrl, serviceKey) {
  const url = new URL("/rest/v1/pricing_report_aggregates", baseUrl);
  url.searchParams.set("select", "category_id,transaction_count");
  url.searchParams.set("order", "transaction_count.desc");
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Could not discover a benchmark category (${response.status}): ${
        await response.text()
      }`,
    );
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || !rows[0]?.category_id) {
    throw new Error(
      "No completed transaction aggregates found. Seed local Supabase before benchmarking.",
    );
  }
  return rows[0].category_id;
}

async function deleteRedisKeys(keys) {
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, "");
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!redisUrl || !redisToken || keys.length === 0) return false;

  for (let start = 0; start < keys.length; start += 100) {
    const commands = keys
      .slice(start, start + 100)
      .map((key) => ["DEL", key]);
    const response = await fetch(`${redisUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${redisToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(commands),
    });
    if (!response.ok) {
      throw new Error(
        `Redis cleanup failed (${response.status}): ${await response.text()}`,
      );
    }
  }
  return true;
}

async function invokePricingReport({
  endpoint,
  anonKey,
  categoryId,
  location,
  rating,
}) {
  const startedAt = performance.now();
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        category_id: categoryId,
        location,
        rating,
      }),
    });
    const durationMs = performance.now() - startedAt;
    const rawBody = await response.text();
    let body = null;
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = { raw: rawBody };
    }

    return {
      ok: response.ok,
      status: response.status,
      durationMs,
      cache: response.headers.get("x-cache") ?? "NONE",
      usefulPrediction:
        Number(body?.prediction?.suggestedPrice ?? 0) > 0,
      error: response.ok ? null : body?.error ?? rawBody,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      durationMs: performance.now() - startedAt,
      cache: "NONE",
      usefulPrediction: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runWithConcurrency(tasks, concurrency) {
  let nextTask = 0;
  const results = new Array(tasks.length);
  const startedAt = performance.now();

  async function worker() {
    while (true) {
      const index = nextTask++;
      if (index >= tasks.length) return;
      results[index] = await tasks[index]();
    }
  }

  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, tasks.length) },
      () => worker(),
    ),
  );

  return {
    results,
    wallTimeMs: performance.now() - startedAt,
  };
}

function summarize(mode, concurrency, results, wallTimeMs) {
  const durations = results
    .map((result) => result.durationMs)
    .sort((a, b) => a - b);
  const successes = results.filter((result) => result.ok);
  const cacheHits = results.filter((result) => result.cache === "HIT");
  const usefulPredictions = results.filter(
    (result) => result.usefulPrediction,
  );
  const statuses = Object.fromEntries(
    [...new Set(results.map((result) => result.status))]
      .sort((a, b) => a - b)
      .map((status) => [
        status,
        results.filter((result) => result.status === status).length,
      ]),
  );

  return {
    mode,
    concurrency,
    requests: results.length,
    p50Ms: round(percentile(durations, 50)),
    p95Ms: round(percentile(durations, 95)),
    throughputRps: round(results.length / (wallTimeMs / 1000)),
    errorRatePct: round(
      ((results.length - successes.length) / results.length) * 100,
    ),
    cacheHitRatioPct: round((cacheHits.length / results.length) * 100),
    usefulPredictionPct: round(
      (usefulPredictions.length / results.length) * 100,
    ),
    statuses,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const endpoint = new URL(
    "/functions/v1/generate-pricing-report",
    baseUrl,
  ).toString();
  const concurrencyLevels = (
    args.get("concurrency") ?? DEFAULT_CONCURRENCY.join(",")
  )
    .split(",")
    .map(Number)
    .filter((value) => Number.isInteger(value) && value > 0);
  const requests = Number(args.get("requests") ?? DEFAULT_REQUESTS);
  const rating = Number(args.get("rating") ?? DEFAULT_RATING);
  const categoryId = args.get("category") ??
    process.env.BENCHMARK_CATEGORY_ID ??
    await discoverCategoryId(baseUrl, serviceKey);
  const runId = `${Date.now()}-${process.pid}`;
  const createdKeys = [];
  const summaries = [];

  if (concurrencyLevels.length === 0) {
    throw new Error("At least one valid concurrency level is required");
  }
  if (!Number.isInteger(requests) || requests < 1) {
    throw new Error("--requests must be a positive integer");
  }

  console.log(
    `Benchmarking ${endpoint} with category ${categoryId}, ${requests} requests per scenario`,
  );

  try {
    for (const concurrency of concurrencyLevels) {
      const missTasks = Array.from({ length: requests }, (_, index) => {
        const location = `benchmark-miss-${runId}-${concurrency}-${index}`;
        const cacheKey =
          `pricing-report:${categoryId}:${location}:${rating}`;
        createdKeys.push(cacheKey);
        return () =>
          invokePricingReport({
            endpoint,
            anonKey,
            categoryId,
            location,
            rating,
          });
      });

      const missRun = await runWithConcurrency(missTasks, concurrency);
      summaries.push(
        summarize(
          "MISS",
          concurrency,
          missRun.results,
          missRun.wallTimeMs,
        ),
      );

      const hitLocation = `benchmark-hit-${runId}-${concurrency}`;
      const hitKey = `pricing-report:${categoryId}:${hitLocation}:${rating}`;
      createdKeys.push(hitKey);

      const warmup = await invokePricingReport({
        endpoint,
        anonKey,
        categoryId,
        location: hitLocation,
        rating,
      });
      if (!warmup.ok) {
        throw new Error(
          `Cache warmup failed (${warmup.status}): ${warmup.error}`,
        );
      }

      const hitTasks = Array.from(
        { length: requests },
        () => () =>
          invokePricingReport({
            endpoint,
            anonKey,
            categoryId,
            location: hitLocation,
            rating,
          }),
      );
      const hitRun = await runWithConcurrency(hitTasks, concurrency);
      summaries.push(
        summarize("HIT", concurrency, hitRun.results, hitRun.wallTimeMs),
      );
    }
  } finally {
    try {
      const cleaned = await deleteRedisKeys([...new Set(createdKeys)]);
      if (!cleaned) {
        console.warn(
          "Redis credentials were not available to clean benchmark keys.",
        );
      }
    } catch (error) {
      console.warn(
        `Could not clean benchmark keys: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  console.table(
    summaries.map(({ statuses: _statuses, ...summary }) => summary),
  );
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    categoryId,
    requestsPerScenario: requests,
    summaries,
  }, null, 2));

  const hitScenarios = summaries.filter((summary) => summary.mode === "HIT");
  if (
    hitScenarios.some((summary) =>
      summary.cacheHitRatioPct < 90 || summary.errorRatePct > 0
    )
  ) {
    console.warn(
      "One or more HIT scenarios had a low hit ratio or request errors. Verify Edge Function Redis configuration.",
    );
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
