# price-chart-proxy Worker

## Overview

`price-chart-proxy` is a Cloudflare Worker that serves historical Bitcoin price time series as JSON.
It is designed as a lightweight data API with built-in caching in Cloudflare KV and automatic
provider fallback.

The service accepts simple query parameters (`period`, `fiat`) and returns normalized points in
the shape:

```json
{
  "data": [{ "time": 1717027200, "value": 68042.12 }],
  "when": 1717060000000,
  "from": "coinbase"
}
```

Where:

- `data` is an array of price points.
- `time` is a Unix timestamp in seconds.
- `value` is the price value for that point.
- `when` is the cache write timestamp in milliseconds.
- `from` indicates which provider supplied the data (`coinbase` or `coingecko`).

## What The Project Solves

External market APIs differ in supported fiats, rate limits, response shape, and historical depth.
This Worker provides a single stable endpoint that:

- normalizes response format,
- hides provider-specific quirks,
- caches responses to reduce latency and upstream calls,
- automatically falls back to a secondary provider on failure,
- supports cross-origin requests from web clients.

## Architecture

### 1) Request Handling (`index.ts`)

The Worker `fetch` handler:

- handles CORS preflight (`OPTIONS`) requests,
- reads `period`, `fiat`, and optional `reset` query parameters,
- optionally clears KV storage if a valid reset token is supplied,
- decides whether to serve cached data or refresh from upstream,
- returns JSON with CORS headers on both success and error paths.

### 2) Cache Layer (`kv.ts`)

KV stores data by key pattern: `"${period}-${fiat}"`.

The module provides:

- `getDataForPeriod`: read cached payload,
- `periodNeedsUpdate`: evaluate staleness by period,
- `updateDataForPeriod`: fetch fresh data and persist it,
- `resetKVStorage`: delete all keys in the namespace.

Cache freshness policy:

- `oneHour`: refresh after 1 minute,
- `oneDay`: refresh after 1 hour,
- `oneWeek`, `oneMonth`, `oneYear`, `all`: refresh after 24 hours.

### 3) Provider Orchestration (`fetcher.ts`)

Primary provider is Coinbase. If Coinbase fails (unsupported pair, upstream error, empty data),
the service falls back to Coingecko.

Returned payload is wrapped with source metadata (`from`) and fetch timestamp (`when`) before
being cached.

### 4) Coinbase Adapter (`coinbase.ts`)

Implements period-based fetching against Coinbase candles endpoint.

Highlights:

- supported fiat subset is enforced for Coinbase pairs,
- uses granularities (`minute`, `hour`, `sixhours`, `day`) based on requested period,
- uses chunked requests for large windows to stay under Coinbase API limits,
- maps candle entries to normalized points and sorts in chronological order.

### 5) Coingecko Adapter (`coingecko.ts`)

Implements the fallback provider with market chart endpoints.

Highlights:

- supports all fiat values accepted by the project enum,
- chooses interval strategy per period,
- converts millisecond timestamps to seconds,
- enforces free-tier practical limit for `all` by returning up to last year data.

### 6) Shared Types (`types.ts`)

Defines strong contracts for:

- `Periods`: `oneHour`, `oneDay`, `oneWeek`, `oneMonth`, `oneYear`, `all`,
- `Fiats`: `EUR`, `USD`, `CHF`, `JPY`, `GBP`, `CNY`, `BRL`,
- `LivelinePoint`: `{ time, value }`,
- `KVData`: `{ data, when, from }`,
- `Env`: Cloudflare binding for KV namespace.

## API Contract

### Endpoint

- `GET /?period=<period>&fiat=<fiat>`

### Query Parameters

- `period` (optional): defaults to `oneDay`.
- `fiat` (optional): defaults to `USD`.
- `reset` (optional): if valid, clears KV namespace before responding.

### Supported Values

- `period`: `oneHour`, `oneDay`, `oneWeek`, `oneMonth`, `oneYear`, `all`
- `fiat`: `EUR`, `USD`, `CHF`, `JPY`, `GBP`, `CNY`, `BRL`

Note: Coinbase does not support every fiat above; unsupported Coinbase pairs are automatically
served by the Coingecko fallback.

### Response Headers

The Worker includes CORS headers on all responses:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Methods: GET, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type`
- `Access-Control-Max-Age: 86400`
- `Content-Type: application/json`

### Success Response

HTTP `200` with JSON payload:

```json
{
  "data": [{ "time": 1717027200, "value": 68042.12 }],
  "when": 1717060000000,
  "from": "coinbase"
}
```

### Error Response

HTTP `500` with JSON payload:

```json
{
  "error": "Internal server error"
}
```

### Preflight

`OPTIONS` requests return HTTP `204` with CORS headers.

## Local Development

Requirements:

- Node.js
- pnpm

Install dependencies:

```bash
pnpm install
```

Run locally:

```bash
pnpm dev
```

Default Wrangler local URL is usually `http://localhost:8787`.

Example request:

```bash
curl -s 'http://localhost:8787?period=oneWeek&fiat=usd'
```

Run tests:

```bash
pnpm test
```

## Deployment

Deploy to Cloudflare Workers:

```bash
pnpm deploy
```

Configuration lives in `wrangler.jsonc`, including:

- Worker name and entrypoint,
- compatibility date,
- observability settings,
- KV namespace binding (`price_chart_proxy_kv`).

## Design Notes And Trade-Offs

- KV caching dramatically lowers repeated upstream calls, at the cost of bounded staleness.
- Coinbase-first strategy favors consistent candle data when available.
- Coingecko fallback improves resilience and fiat coverage.
- `all` period behavior differs by provider due to API constraints:
  - Coinbase fetches from a fixed historical start date with pagination.
  - Coingecko free tier effectively limits to the latest year.

## Future Improvements

- Add explicit validation for unsupported `period`/`fiat` values and return `400`.
- Add rate-limit/backoff handling for upstream provider errors.
- Add endpoint versioning for long-term API compatibility.
- Expand automated tests for cache TTL and provider fallback scenarios.
