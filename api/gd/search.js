const {
  SECRET,
  sanitizeQuery,
  clampInt,
  postLevels,
  sendJson,
  sendRaw,
} = require("../../lib/gd-upstream");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  const url = new URL(
    request.url || "/",
    `http://${request.headers.host || "localhost"}`,
  );

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

  try {
    const upstream = await postLevels(body);
    if (upstream.status !== 200) {
      sendJson(response, 502, {
        error: "upstream_status",
        status: upstream.status,
        message: "The Geometry Dash server rejected the request.",
      });
      return;
    }

    sendRaw(response, upstream.text);
  } catch (error) {
    console.error("Upstream request failed:", error.message);
    sendJson(response, 502, {
      error: "upstream_unreachable",
      message: "Could not reach the Geometry Dash server.",
    });
  }
};
