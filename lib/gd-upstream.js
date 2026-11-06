const https = require("node:https");

const UPSTREAM = "https://www.boomlings.com/database/getGJLevels21.php";
const SECRET = "Wmfd2893gb7";
const MAX_QUERY_LENGTH = 100;

function sanitizeQuery(value) {
  return String(value || "")
    .replace(/['’`]/g, "")
    .replace(/[^A-Za-z0-9 ,\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

function clampInt(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function postLevels(body) {
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
    request.setTimeout(8_000, () => {
      request.destroy(new Error("Upstream request timed out"));
    });
    request.end(payload);
  });
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
  response.setHeader("Cache-Control", "public, max-age=60, s-maxage=60");
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
