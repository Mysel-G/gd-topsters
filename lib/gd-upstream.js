const https = require("node:https");

const UPSTREAM = "https://www.boomlings.com/database/getGJLevels21.php";
const SECRET = "Wmfd2893gb7";
const MAX_QUERY_LENGTH = 100;

const MIN_INTERVAL_MS = Math.max(
  250,
  Number(process.env.GD_UPSTREAM_MIN_INTERVAL_MS) || 550,
);
const MAX_WAIT_MS = Math.max(
  500,
  Number(process.env.GD_UPSTREAM_MAX_WAIT_MS) || 3000,
);
const CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.GD_UPSTREAM_CACHE_MS) || 60000,
);
const CACHE_MAX_ENTRIES = 200;

// Optional shared limiter for Vercel. Set either Upstash Redis or Vercel KV
// REST credentials to enforce the limit across all function instances.
const REDIS_URL = (
  process.env.UPSTASH_REDIS_REST_URL ||
  process.env.KV_REST_API_URL ||
  ""
).replace(/\/+$/, "");
const REDIS_TOKEN =
  process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";

const responseCache = new Map();
const inFlight = new Map();
let localNextSlot = 0;
let redisDisabledUntil = 0;

function sanitizeQuery(value) {
  return String(value || "")
    .replace(/['’`]/g, "")
    .replace(/[^A-Za-z0-9 ,\-]/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    responseCache.delete(key);
    return null;
  }

  // Refresh insertion order so the oldest entries are evicted first.
  responseCache.delete(key);
  responseCache.set(key, entry);
  return entry.value;
}

function cacheResponse(key, value) {
  if (CACHE_TTL_MS <= 0) return;

  responseCache.delete(key);
  responseCache.set(key, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });

  while (responseCache.size > CACHE_MAX_ENTRIES) {
    responseCache.delete(responseCache.keys().next().value);
  }
}

async function acquireRedisSlot(slot) {
  const key = `gd:upstream:slot:${slot}`;

  try {
    const response = await fetch(`${REDIS_URL}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${REDIS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify([
        ["INCR", key],
        ["PEXPIRE", key, 5000],
      ]),
      signal: AbortSignal.timeout(1500),
    });

    if (!response.ok) {
      throw new Error(`Redis returned HTTP ${response.status}`);
    }

    const payload = await response.json();
    const count = Number(payload?.[0]?.result);
    if (!Number.isFinite(count)) {
      throw new Error("Redis returned an unexpected response");
    }

    return count === 1;
  } catch (error) {
    redisDisabledUntil = Date.now() + 60000;
    console.warn(
      "Distributed upstream limiter unavailable; using per-instance limiter:",
      error.message,
    );
    return null;
  }
}

async function acquireUpstreamSlot() {
  const startedAt = Date.now();

  while (true) {
    const now = Date.now();
    const slot = Math.floor(now / MIN_INTERVAL_MS);
    let acquired = null;

    if (REDIS_URL && REDIS_TOKEN && now >= redisDisabledUntil) {
      acquired = await acquireRedisSlot(slot);
    }

    if (acquired === true) return;

    if (acquired === null && now >= localNextSlot) {
      localNextSlot = now + MIN_INTERVAL_MS;
      return;
    }

    const wait = Math.max(25, (slot + 1) * MIN_INTERVAL_MS - now + 15);
    const elapsed = Date.now() - startedAt;

    if (elapsed + wait > MAX_WAIT_MS) {
      const error = new Error(
        "The level server is receiving too many requests. Please try again shortly.",
      );
      error.code = "rate_limited";
      error.retryAfter = Math.max(
        1,
        Math.ceil((elapsed + wait - MAX_WAIT_MS) / 1000),
      );
      throw error;
    }

    await sleep(wait);
  }
}

function requestUpstream(body) {
  return new Promise((resolve, reject) => {
    const payload = body.toString();
    const request = https.request(
      UPSTREAM,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(payload),
          // No User-Agent: Boomlings rejects normal browser UAs behind Cloudflare.
        },
      },
      (upstream) => {
        let text = "";
        upstream.setEncoding("utf8");
        upstream.on("data", (chunk) => {
          text += chunk;
        });
        upstream.on("end", () => {
          resolve({ status: upstream.statusCode ?? 502, text });
        });
      },
    );

    request.on("error", reject);
    request.setTimeout(6_000, () => {
      request.destroy(new Error("Upstream request timed out"));
    });
    request.end(payload);
  });
}

async function postLevels(body) {
  const cacheKey = body.toString();
  const cached = getCached(cacheKey);
  if (cached) return cached;

  if (inFlight.has(cacheKey)) {
    return inFlight.get(cacheKey);
  }

  const task = (async () => {
    await acquireUpstreamSlot();
    const result = await requestUpstream(body);
    if (result.status === 200) cacheResponse(cacheKey, result);
    return result;
  })();

  inFlight.set(cacheKey, task);

  try {
    return await task;
  } finally {
    inFlight.delete(cacheKey);
  }
}

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Content-Length", Buffer.byteLength(body));
  response.setHeader("Cache-Control", "no-store");
  response.end(body);
}

function sendRaw(response, text) {
  response.statusCode = 200;
  response.setHeader("Content-Type", "text/plain; charset=utf-8");
  response.setHeader(
    "Cache-Control",
    "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
  );
  response.end(text);
}

function queryParam(url, name) {
  return url.searchParams.get(name);
}

module.exports = {
  SECRET,
  sanitizeQuery,
  clampInt,
  postLevels,
  sendJson,
  sendRaw,
  queryParam,
};
