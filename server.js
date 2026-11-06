const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const searchHandler = require("./api/gd/search");
const levelsHandler = require("./api/gd/levels");

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;

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

  // Mount the same handlers that Vercel exposes under /api/gd.
  if (url.pathname === "/api/gd/search") {
    searchHandler(request, response);
    return;
  }

  if (url.pathname === "/api/gd/levels") {
    levelsHandler(request, response);
    return;
  }

  serveStatic(url, response);
});

server.listen(PORT, () => {
  console.log(`GD Topster running at http://localhost:${PORT}`);
});
