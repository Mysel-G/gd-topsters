const {
  SECRET,
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
    if (error.code === "rate_limited") {
      response.setHeader("Retry-After", String(error.retryAfter || 1));
      sendJson(response, 429, {
        error: "rate_limited",
        message: error.message,
        retry_after: error.retryAfter || 1,
      });
      return;
    }

    console.error("Upstream request failed:", error.message);
    sendJson(response, 502, {
      error: "upstream_unreachable",
      message: "Could not reach the Geometry Dash server.",
    });
  }
};
