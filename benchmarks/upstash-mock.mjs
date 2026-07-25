#!/usr/bin/env node

import http from "node:http";

const port = Number(process.env.PORT ?? 8079);
const entries = new Map();
const modes = {
  ml: "healthy",
  redis: "healthy",
};

function readEntry(key) {
  const entry = entries.get(key);
  if (!entry) return null;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    entries.delete(key);
    return null;
  }
  return entry.value;
}

function execute(command) {
  const [rawName, ...args] = command;
  const name = String(rawName).toUpperCase();

  if (name === "GET") return readEntry(String(args[0]));

  if (name === "SET") {
    const key = String(args[0]);
    const value = args[1];
    const exIndex = args.findIndex(
      (argument) => String(argument).toUpperCase() === "EX",
    );
    const ttlSeconds = exIndex >= 0 ? Number(args[exIndex + 1]) : null;
    entries.set(key, {
      value,
      expiresAt:
        Number.isFinite(ttlSeconds) && ttlSeconds > 0
          ? Date.now() + ttlSeconds * 1_000
          : null,
    });
    return "OK";
  }

  if (name === "DEL") {
    return args.reduce(
      (deleted, key) => deleted + Number(entries.delete(String(key))),
      0,
    );
  }

  if (name === "PING") return "PONG";

  throw new Error(`Unsupported mock Redis command: ${name}`);
}

function encodeResult(result, encoding) {
  if (encoding !== "base64" || typeof result !== "string") return result;
  return Buffer.from(result, "utf8").toString("base64");
}

const server = http.createServer((request, response) => {
  const chunks = [];
  request.on("data", (chunk) => chunks.push(chunk));
  request.on("end", async () => {
    try {
      const rawBody = Buffer.concat(chunks).toString("utf8");

      if (request.url === "/__control") {
        const requestedModes = JSON.parse(rawBody || "{}");
        if (requestedModes.ml) modes.ml = requestedModes.ml;
        if (requestedModes.redis) modes.redis = requestedModes.redis;
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(modes));
        return;
      }

      if (
        request.url === "/predict-price" ||
        request.url === "/detect-anomalies"
      ) {
        if (modes.ml === "timed_out") {
          await new Promise((resolve) => setTimeout(resolve, 2_000));
        }
        if (modes.ml === "unavailable") {
          response.writeHead(503, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "ML service unavailable" }));
          return;
        }

        const result = request.url === "/predict-price"
          ? { minPrice: 120, maxPrice: 180, suggestedPrice: 150 }
          : { outlierIndices: [], scores: [] };
        response.writeHead(200, { "content-type": "application/json" });
        response.end(JSON.stringify(result));
        return;
      }

      if (modes.redis === "unavailable") {
        response.writeHead(503, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "Redis unavailable" }));
        return;
      }

      const body = JSON.parse(rawBody);
      const encoding = request.headers["upstash-encoding"];
      const isPipeline = request.url === "/pipeline";
      const commands = isPipeline ? body : [body];
      const results = commands.map((command) => ({
        result: encodeResult(execute(command), encoding),
      }));

      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify(isPipeline ? results : results[0]));
    } catch (error) {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: error.message }));
    }
  });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Benchmark dependency mock listening on http://0.0.0.0:${port}`);
});
