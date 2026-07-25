import "@supabase/functions-js/edge-runtime.d.ts";
import { Redis } from "npm:@upstash/redis";
import {
  corsHeaders,
  createServiceClient,
} from "../_shared/supabase.ts";

const supabase = createServiceClient();

const ML_SERVICE_URL = Deno.env.get("ML_SERVICE_URL");
const ML_TIMEOUT_MS = positiveIntegerEnv("ML_TIMEOUT_MS", 3_000);
const REDIS_TIMEOUT_MS = positiveIntegerEnv("REDIS_TIMEOUT_MS", 500);

const redisUrl = Deno.env.get("UPSTASH_REDIS_REST_URL");
const redisToken = Deno.env.get("UPSTASH_REDIS_REST_TOKEN");
const redis = redisUrl && redisToken
  ? new Redis({ url: redisUrl, token: redisToken })
  : null;

type Prediction = {
  minPrice: number;
  maxPrice: number;
  suggestedPrice: number;
};

type DependencyStatus = "healthy" | "unavailable" | "timed_out" | "skipped";

function positiveIntegerEnv(name: string, fallback: number): number {
  const parsed = Number(Deno.env.get(name));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  dependency: string,
): Promise<T> {
  let timeoutId: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error(`${dependency} timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  return Promise.race([operation, timeout]).finally(() => {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  });
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function databasePrediction(aggregate: Record<string, unknown>): Prediction {
  const marketMin = Number(aggregate.price_min);
  const marketMax = Number(aggregate.price_max);
  const marketMedian = Number(aggregate.price_median);
  const marketAvg = Number(aggregate.price_avg);
  const suggestedPrice = marketMedian > 0 ? marketMedian : marketAvg;

  return {
    minPrice: marketMin > 0 ? marketMin : suggestedPrice,
    maxPrice: marketMax > 0 ? marketMax : suggestedPrice,
    suggestedPrice,
  };
}

function dependencyFailureStatus(error: unknown): DependencyStatus {
  return error instanceof Error && error.name === "AbortError"
    ? "timed_out"
    : "unavailable";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const { category_id, location = "", rating = 4.5 } = await req.json() as {
    category_id: string;
    location?: string;
    rating?: number;
  };

  // ── Upstash Cache Check (Cache-Aside Tier 2) ────────────────
  const cacheKey = `pricing-report:${category_id}:${location}:${rating}`;
  let cachedReport = null;
  if (category_id && redis) {
    try {
      cachedReport = await withTimeout(
        redis.get(cacheKey),
        REDIS_TIMEOUT_MS,
        "Redis read",
      );
    } catch (err) {
      console.error("Redis cache read error:", err);
    }
  }

  if (cachedReport) {
    return new Response(JSON.stringify(cachedReport), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "X-Cache": "HIT",
        "X-Prediction-Source":
          String((cachedReport as Record<string, unknown>).predictionSource ?? "unknown"),
      },
    });
  }

  // When category_id is omitted, return market-wide price distribution only.
  if (!category_id) {
    const { data: allPriceRows } = await supabase
      .from("transactions")
      .select("final_price")
      .not("completed_at", "is", null);

    const allPrices = (allPriceRows ?? []).map((r: { final_price: number }) => r.final_price);
    const distribution: { range: string; count: number; avg: number }[] = [];
    if (allPrices.length > 0) {
      const bucketSize = 50;
      const minB = Math.floor(Math.min(...allPrices) / bucketSize) * bucketSize;
      const maxB = Math.floor(Math.max(...allPrices) / bucketSize) * bucketSize;
      for (let start = minB; start <= maxB; start += bucketSize) {
        const end = start + bucketSize;
        const inBucket = allPrices.filter((p: number) => p >= start && p < end);
        if (inBucket.length > 0) {
          distribution.push({
            range: `$${start}–$${end}`,
            count: inBucket.length,
            avg: Math.round(inBucket.reduce((s: number, v: number) => s + v, 0) / inBucket.length),
          });
        }
      }
    }

    return new Response(JSON.stringify({ priceDistribution: distribution }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1. Aggregate query — uses service role so RLS doesn't restrict cross-user reads.
  const { data: aggregate, error: aggError } = await supabase
    .from("pricing_report_aggregates")
    .select("*")
    .eq("category_id", category_id)
    .single();

  if (aggError) {
    return new Response(JSON.stringify({ error: "Not enough data for this category yet." }), {
      status: 404,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Get individual prices for anomaly detection.
  const { data: priceRows } = await supabase
    .from("transactions")
    .select("final_price")
    .eq("category_id", category_id)
    .not("completed_at", "is", null);

  const prices = (priceRows ?? []).map((r: { final_price: number }) => r.final_price);

  // 3. Call ML service (optional — skipped if ML_SERVICE_URL is not configured).
  let prediction = databasePrediction(aggregate);
  let anomalies = { outlierIndices: [] as number[], scores: [] as number[] };
  let predictionSource: "ml" | "database" = "database";
  let predictionStatus: DependencyStatus = ML_SERVICE_URL
    ? "unavailable"
    : "skipped";
  let anomalyStatus: DependencyStatus = prices.length > 0 && ML_SERVICE_URL
    ? "unavailable"
    : "skipped";

  if (ML_SERVICE_URL) {
    const { data: categoryRow } = await supabase
      .from("categories")
      .select("slug")
      .eq("id", category_id)
      .maybeSingle();

    const categorySlug = categoryRow?.slug || "";
    const predictionRequest = fetchWithTimeout(
      `${ML_SERVICE_URL}/predict-price`,
      {
        method: "POST",
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({
          category: categorySlug || category_id,
          location,
          rating,
        }),
      },
      ML_TIMEOUT_MS,
    );
    const anomalyRequest = prices.length > 0
      ? fetchWithTimeout(
        `${ML_SERVICE_URL}/detect-anomalies`,
        {
          method: "POST",
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({ prices }),
        },
        ML_TIMEOUT_MS,
      )
      : null;

    const [predictionResult, anomalyResult] = await Promise.allSettled([
      predictionRequest,
      anomalyRequest,
    ]);

    if (predictionResult.status === "fulfilled") {
      if (predictionResult.value.ok) {
        prediction = await predictionResult.value.json();
        predictionSource = "ml";
        predictionStatus = "healthy";
      } else {
        predictionStatus = "unavailable";
      }
    } else {
      predictionStatus = dependencyFailureStatus(predictionResult.reason);
    }

    if (anomalyRequest === null) {
      anomalyStatus = "skipped";
    } else if (anomalyResult.status === "fulfilled") {
      if (anomalyResult.value?.ok) {
        anomalies = await anomalyResult.value.json();
        anomalyStatus = "healthy";
      } else {
        anomalyStatus = "unavailable";
      }
    } else {
      anomalyStatus = dependencyFailureStatus(anomalyResult.reason);
    }
  }

  // Build price distribution buckets from individual prices.
  const priceDistribution: { range: string; count: number; avg: number }[] = [];
  if (prices.length > 0) {
    const bucketSize = 50;
    const minBucket = Math.floor(Math.min(...prices) / bucketSize) * bucketSize;
    const maxBucket = Math.floor(Math.max(...prices) / bucketSize) * bucketSize;
    for (let start = minBucket; start <= maxBucket; start += bucketSize) {
      const end = start + bucketSize;
      const inBucket = prices.filter((p: number) => p >= start && p < end);
      if (inBucket.length > 0) {
        priceDistribution.push({
          range: `$${start}–$${end}`,
          count: inBucket.length,
          avg: Math.round(inBucket.reduce((s: number, v: number) => s + v, 0) / inBucket.length),
        });
      }
    }
  }

  // Build scatter data: price + rating for each freelancer in this category.
  const { data: scatterRows } = await supabase
    .from("listings")
    .select("id, title, pricing_models(base_price), freelancer_id")
    .eq("category_id", category_id);

  let scatterData: { name: string; price: number; rating: number; reviews: number }[] = [];
  if (scatterRows && scatterRows.length > 0) {
    const fIds = [...new Set(scatterRows.map((r: any) => r.freelancer_id).filter(Boolean))];
    const { data: ratingRows } = await supabase
      .from("freelancer_rating_aggregates")
      .select("freelancer_id, avg_overall, review_count")
      .in("freelancer_id", fIds);
    const rMap = new Map((ratingRows ?? []).map((r: any) => [r.freelancer_id, r]));

    scatterData = scatterRows
      .filter((r: any) => r.pricing_models?.length > 0)
      .map((r: any) => {
        const rat = rMap.get(r.freelancer_id) as any;
        return {
          name: r.title || "Freelancer",
          price: r.pricing_models[0].base_price,
          rating: rat?.avg_overall ?? 0,
          reviews: rat?.review_count ?? 0,
        };
      });
  }

  const report = {
    categoryId:       aggregate.category_id,
    marketMin:        aggregate.price_min,
    marketMax:        aggregate.price_max,
    marketAvg:        aggregate.price_avg,
    marketMedian:     aggregate.price_median,
    transactionCount: aggregate.transaction_count,
    priceDistribution,
    scatterData,
    prediction,
    anomalies,
    predictionSource,
    dependencies: {
      prediction: predictionStatus,
      anomalies: anomalyStatus,
    },
  };

  if (redis) {
    try {
      await withTimeout(
        redis.set(cacheKey, report, { ex: 3600 }),
        REDIS_TIMEOUT_MS,
        "Redis write",
      ); // Cache for 1 hour
    } catch (err) {
      console.error("Redis cache write error:", err);
    }
  }

  return new Response(JSON.stringify(report), {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      "X-Cache": "MISS",
      "X-Prediction-Source": predictionSource,
    },
  });
});
