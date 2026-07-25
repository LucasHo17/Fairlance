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
