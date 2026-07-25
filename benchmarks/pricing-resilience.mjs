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
      `Could not discover a category (${response.status}): ${
        await response.text()
      }`,
    );
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || !rows[0]?.category_id) {
    throw new Error("No completed transaction aggregates found");
  }
  return rows[0].category_id;
}

async function setDependencyModes(controlUrl, modes) {
  const response = await fetch(`${controlUrl}/__control`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(modes),
  });
  if (!response.ok) {
    throw new Error(
      `Could not configure dependency mock (${response.status}): ${
        await response.text()
      }`,
    );
  }
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
    const body = await response.json();
    return {
      ok: response.ok,
      status: response.status,
      durationMs: performance.now() - startedAt,
      cache: response.headers.get("x-cache") ?? "NONE",
      predictionSource: body?.predictionSource ?? "unknown",
      predictionStatus: body?.dependencies?.prediction ?? "unknown",
      usefulPrediction: Number(body?.prediction?.suggestedPrice ?? 0) > 0,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      durationMs: performance.now() - startedAt,
      cache: "NONE",
      predictionSource: "unknown",
      predictionStatus: "unknown",
      usefulPrediction: false,
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

function summarize(scenario, concurrency, results, wallTimeMs) {
  const durations = results
    .map((result) => result.durationMs)
    .sort((a, b) => a - b);
  const successful = results.filter((result) => result.ok);
  const useful = results.filter((result) => result.usefulPrediction);
  const expected = results.filter((result) =>
    result.predictionSource === scenario.expectedSource &&
    result.predictionStatus === scenario.expectedStatus
  );

  return {
    scenario: scenario.name,
    concurrency,
    requests: results.length,
    p50Ms: round(percentile(durations, 50)),
    p95Ms: round(percentile(durations, 95)),
    throughputRps: round(results.length / (wallTimeMs / 1000)),
    errorRatePct: round(
      ((results.length - successful.length) / results.length) * 100,
    ),
    usefulPredictionPct: round((useful.length / results.length) * 100),
    expectedOutcomePct: round((expected.length / results.length) * 100),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = requiredEnv("SUPABASE_URL");
  const anonKey = requiredEnv("SUPABASE_ANON_KEY");
  const serviceKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const controlUrl = requiredEnv("DEPENDENCY_MOCK_URL");
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
  const summaries = [];
  const scenarios = [
    {
      name: "HEALTHY",
      modes: { ml: "healthy", redis: "healthy" },
      expectedSource: "ml",
      expectedStatus: "healthy",
    },
    {
      name: "ML_UNAVAILABLE",
      modes: { ml: "unavailable", redis: "healthy" },
      expectedSource: "database",
      expectedStatus: "unavailable",
    },
    {
      name: "ML_TIMEOUT",
      modes: { ml: "timed_out", redis: "healthy" },
      expectedSource: "database",
      expectedStatus: "timed_out",
    },
    {
      name: "REDIS_UNAVAILABLE",
      modes: { ml: "healthy", redis: "unavailable" },
      expectedSource: "ml",
      expectedStatus: "healthy",
    },
  ];

  if (concurrencyLevels.length === 0) {
    throw new Error("At least one valid concurrency level is required");
  }
  if (!Number.isInteger(requests) || requests < 1) {
    throw new Error("--requests must be a positive integer");
  }

  for (const scenario of scenarios) {
    await setDependencyModes(controlUrl, scenario.modes);
    for (const concurrency of concurrencyLevels) {
      const tasks = Array.from({ length: requests }, (_, index) => () =>
        invokePricingReport({
          endpoint,
          anonKey,
          categoryId,
          location:
            `resilience-${runId}-${scenario.name}-${concurrency}-${index}`,
          rating,
        }));
      const run = await runWithConcurrency(tasks, concurrency);
      summaries.push(
        summarize(scenario, concurrency, run.results, run.wallTimeMs),
      );
    }
  }

  await setDependencyModes(controlUrl, { ml: "healthy", redis: "healthy" });

  console.table(summaries);
  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    categoryId,
    requestsPerScenario: requests,
    summaries,
  }, null, 2));

  if (
    summaries.some((summary) =>
      summary.errorRatePct > 0 ||
      summary.usefulPredictionPct < 100 ||
      summary.expectedOutcomePct < 100
    )
  ) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
