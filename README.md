# GD Topster

Topster-style charts for Geometry Dash levels.

## Local development

```sh
npm run dev
```

Open http://localhost:3000. The local server mounts the same handlers as the
Vercel functions in `api/gd/`, so search and pagination behave the same locally
and in production.

`vercel dev` can fail on Windows without Developer Mode because the Vercel CLI
tries to create symlinks in its cache. That is a local CLI issue; use
`npm run dev` locally and deploy through Git or `vercel --prod`.

## Deploying to Vercel

The project is a static site plus Node functions:

- Static files: `index.html`, `styles.css`, `script.js`, `fetch-lvl.js`
- API:
  - `GET /api/gd/search?q=...&page=...&rated=...`
  - `GET /api/gd/levels?ids=...`

No build step or `vercel.json` is required. Vercel detects `api/gd/*.js` as
functions and serves the root static files.

## Upstream rate limiting

Geometry Dash's level endpoint is behind Cloudflare and is sensitive to bursts.
`lib/gd-upstream.js` now:

- Allows at most one upstream request per `550ms` (about 1.8/sec).
- Caches successful upstream responses for `60s`.
- Deduplicates identical requests while one is in flight.
- Returns HTTP `429` with `Retry-After` when the queue is too long.

By default the queue is per warm process/function instance. For a strict global
limit across all Vercel instances, add an Upstash Redis or Vercel KV store and
set one of these environment-variable pairs:

```text
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
```

or:

```text
KV_REST_API_URL
KV_REST_API_TOKEN
```

Optional tuning:

```text
GD_UPSTREAM_MIN_INTERVAL_MS=550
GD_UPSTREAM_MAX_WAIT_MS=3000
GD_UPSTREAM_CACHE_MS=60000
```

Thumbnails are loaded directly from `levelthumbs.prevter.me`; the GD API limiter
does not proxy or throttle those image requests.
