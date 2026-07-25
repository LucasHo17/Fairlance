# Pricing-report benchmark

This benchmark compares the complete pricing pipeline on a cache miss with the
cached response path. It records p50/p95 latency, throughput, error rate,
cache-hit ratio, and whether the response contains a non-zero ML prediction.

The local benchmark uses:

- local Supabase and the `generate-pricing-report` Edge Function;
- local FastAPI inference;
- 600 seeded completed transactions;
- `upstash-mock.mjs`, a benchmark-only in-memory implementation of the Upstash
  commands used by the Edge Function.

Start the local FastAPI service, Supabase, the Redis mock, and the Edge Function:

```sh
node benchmarks/upstash-mock.mjs
supabase functions serve generate-pricing-report \
  --env-file benchmarks/edge-benchmark.env.example
```

Export the local Supabase URL, anonymous key, and service-role key, then run:

```sh
node benchmarks/pricing-report.mjs \
  --concurrency=1,10,50 \
  --requests=50
```

## Baseline measured on 2026-07-24

| Path | Concurrency | p50 | p95 | Throughput | Errors | Cache hits |
|---|---:|---:|---:|---:|---:|---:|
| Miss | 1 | 52.80 ms | 64.13 ms | 18.24 req/s | 0% | 0% |
| Hit | 1 | 4.55 ms | 9.67 ms | 173.32 req/s | 0% | 100% |
| Miss | 10 | 559.96 ms | 760.33 ms | 17.99 req/s | 0% | 0% |
| Hit | 10 | 6.77 ms | 10.29 ms | 1,136.43 req/s | 0% | 100% |
| Miss | 50 | 1,710.63 ms | 2,143.95 ms | 23.31 req/s | 0% | 0% |
| Hit | 50 | 22.82 ms | 28.19 ms | 1,666.77 req/s | 0% | 100% |

All 300 measured requests returned HTTP 200 and all reports contained a useful
non-zero prediction.

These numbers describe a local baseline, not production capacity. In
particular, the cache is in-memory and has no network latency. Re-run the same
harness against hosted infrastructure before making production performance
claims.

## Failure-resilience tests

The dependency mock can also simulate healthy, unavailable, and delayed ML
responses, plus an unavailable Redis service. Start the Edge Function with the
short deterministic test deadlines:

```sh
supabase functions serve generate-pricing-report \
  --env-file benchmarks/edge-resilience.env.example
```

Then set `DEPENDENCY_MOCK_URL=http://127.0.0.1:8079` and run
`supabase/functions/generate-pricing-report/index.test.ts`.

The functional suite verifies that:

- healthy ML predictions are used;
- unavailable or timed-out ML calls use non-zero PostgreSQL aggregate values;
- prediction and anomaly calls have independent deadlines;
- unavailable Redis is bypassed without failing the report;
- responses identify whether their prediction came from ML or the database.

## Phase 3 measured on 2026-07-25

The healthy-path benchmark was repeated with the same methodology as the
Phase 1 baseline: local Supabase, real local FastAPI inference, the in-memory
Redis-compatible cache, 50 requests per path, and 1/10/50 concurrency.

| Path | Concurrency | Phase 1 p95 | Phase 3 p95 | Change |
|---|---:|---:|---:|---:|
| Miss | 1 | 64.13 ms | 61.30 ms | -4.4% |
| Hit | 1 | 9.67 ms | 4.48 ms | -53.7% |
| Miss | 10 | 760.33 ms | 585.15 ms | -23.0% |
| Hit | 10 | 10.29 ms | 9.88 ms | -4.0% |
| Miss | 50 | 2,143.95 ms | 2,341.26 ms | +9.2% |
| Hit | 50 | 28.19 ms | 28.15 ms | -0.1% |

All 300 healthy-path requests returned HTTP 200 with useful predictions.
Five of six p95 measurements improved or remained effectively flat. The
uncached 50-concurrency path increased by 9.2%, which is recorded as local
single-run variance rather than hidden. The critical cached 50-concurrency
path remained stable, and caching reduced Phase 3 p95 by 98.8% at that load.

Failure-path performance was measured separately with deterministic dependency
responses and the 200 ms ML test deadline:

| Scenario | Concurrency | p50 | p95 | Errors | Useful predictions | Expected outcome |
|---|---:|---:|---:|---:|---:|---:|
| ML unavailable | 1 | 7.84 ms | 11.58 ms | 0% | 100% | 100% |
| ML unavailable | 10 | 22.86 ms | 27.42 ms | 0% | 100% | 100% |
| ML unavailable | 50 | 143.39 ms | 168.39 ms | 0% | 100% | 100% |
| ML timeout | 1 | 231.46 ms | 238.64 ms | 0% | 100% | 100% |
| ML timeout | 10 | 242.09 ms | 250.70 ms | 0% | 100% | 100% |
| ML timeout | 50 | 295.90 ms | 302.04 ms | 0% | 100% | 100% |
| Redis unavailable | 1 | 8.51 ms | 10.48 ms | 0% | 100% | 100% |
| Redis unavailable | 10 | 28.68 ms | 41.38 ms | 0% | 100% | 100% |
| Redis unavailable | 50 | 163.37 ms | 181.96 ms | 0% | 100% | 100% |

Across 300 ML failure requests, the PostgreSQL fallback success rate was 100%.
Across all 600 resilience-benchmark requests, the error rate was 0% and the
expected source/status outcome rate was 100%.

The failure benchmark uses deterministic mocks so that failures are repeatable.
Its healthy mock-ML numbers are not compared with the real FastAPI Phase 1
baseline. These remain local engineering measurements, not production-capacity
claims.

## Hosted Upstash benchmark measured on 2026-07-25

The healthy-path benchmark was repeated with a real hosted Upstash Redis
database instead of the in-memory cache mock. Supabase, the Edge Function, and
FastAPI inference remained local, so this is a hybrid infrastructure benchmark,
not a full production benchmark.

| Path | Concurrency | p50 | p95 | Throughput | Errors | Cache hits |
|---|---:|---:|---:|---:|---:|---:|
| Miss | 1 | 182.45 ms | 198.85 ms | 5.20 req/s | 0% | 0% |
| Hit | 1 | 57.99 ms | 59.57 ms | 17.23 req/s | 0% | 100% |
| Miss | 10 | 473.98 ms | 589.97 ms | 20.97 req/s | 0% | 0% |
| Hit | 10 | 54.96 ms | 64.24 ms | 168.75 req/s | 0% | 100% |
| Miss | 50 | 1,979.19 ms | 2,344.44 ms | 21.21 req/s | 0% | 0% |
| Hit | 50 | 118.94 ms | 124.25 ms | 389.68 req/s | 0% | 100% |

All 300 requests returned HTTP 200 with useful non-zero predictions. Cache-hit
ratios were 0% for forced misses and 100% for warmed keys, confirming that the
benchmark exercised the intended paths.

At 50 concurrent requests, hosted caching reduced p95 latency from 2,344.44 ms
to 124.25 ms, a 94.7% reduction. The hosted cache was slower than the in-memory
mock because it includes real network, TLS, geographic, and service-processing
overhead, but it still avoided repeated PostgreSQL queries and ML inference.

The defensible conclusion from this hybrid test is:

> Hosted Redis caching reduced pricing-report p95 latency by 94.7% at 50
> concurrent requests while maintaining a 0% error rate across 300 requests.

Do not interpret the measured throughput as production capacity because the
database, Edge Function, and ML service were still running locally.
