const http = require("node:http");
const https = require("node:https");
const fs = require("node:fs/promises");
const path = require("node:path");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const UPSTREAM = "https://www.boomlings.com/database/getGJLevels21.php";
const SECRET = "Wmfd2893gb7";
const MAX_QUERY_LENGTH = 100;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};

function sendJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

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

function postUpstream(body) {
  return new Promise((resolve, reject) => {
    const payload = body.toString();
    const request = https.request(
      UPSTREAM,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(payload),
          // Deliberately no User-Agent: boomlings rejects normal browser UAs
          // behind Cloudflare, and Node does not add one by default.
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
    request.setTimeout(10_000, () => {
      request.destroy(new Error("Upstream request timed out"));
    });
    request.end(payload);
  });
}

async function forwardLevels(body, response) {
  try {
    const upstream = await postUpstream(body);
    if (upstream.status !== 200) {
      sendJson(response, 502, {
        error: "upstream_status",
        status: upstream.status,
        message: "The Geometry Dash server rejected the request.",
      });
      return;
    }

    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    });
    response.end(upstream.text);
  } catch (error) {
    console.error("Upstream request failed:", error.message);
    sendJson(response, 502, {
      error: "upstream_unreachable",
      message: "Could not reach the Geometry Dash server.",
    });
  }
}

function handleSearch(url, response) {
  const query = sanitizeQuery(url.searchParams.get("q"));
  if (!query) {
    sendJson(response, 400, {
      error: "missing_query",
      message: "A search query is required.",
    });
    return;
  }

  const page = clampInt(url.searchParams.get("page"), 0, 50, 0);
  const body = new URLSearchParams({
    secret: SECRET,
    type: "0",
    str: query,
    page: String(page),
  });

  if (url.searchParams.get("rated") === "1") body.set("star", "1");

  const length = clampInt(url.searchParams.get("len"), 0, 5, null);
  if (length !== null) body.set("len", String(length));

  const difficulty = clampInt(url.searchParams.get("diff"), -2, 5, null);
  if (difficulty !== null) body.set("diff", String(difficulty));

  const demonFilter = clampInt(url.searchParams.get("demonFilter"), 1, 5, null);
  if (demonFilter !== null) body.set("demonFilter", String(demonFilter));

  forwardLevels(body, response);
}

function handleLevels(url, response) {
  const ids = String(url.searchParams.get("ids") || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id))
    .slice(0, 25);

  if (ids.length === 0) {
    sendJson(response, 400, {
      error: "missing_ids",
      message: "One or more numeric level IDs are required.",
    });
    return;
  }

  const body = new URLSearchParams({
    secret: SECRET,
    type: "10",
    str: ids.join(","),
  });

  forwardLevels(body, response);
}

async function serveStatic(url, response) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendJson(response, 400, { error: "bad_path" });
    return;
  }

  if (pathname === "/") pathname = "/index.html";

  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    sendJson(response, 403, { error: "forbidden" });
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
      "Content-Length": data.length,
      "Cache-Control": "no-cache",
    });
    response.end(data);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

const server = http.createServer((request, response) => {
  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || "localhost"}`,
  );

  if (request.method !== "GET") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  if (url.pathname === "/api/gd/search") {
    handleSearch(url, response);
    return;
  }

  if (url.pathname === "/api/gd/levels") {
    handleLevels(url, response);
    return;
  }

  serveStatic(url, response);
});

server.listen(PORT, () => {
  console.log(`GD Topster running at http://localhost:${PORT}`);
});
