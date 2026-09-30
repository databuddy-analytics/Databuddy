# @databuddy/sdk

## 3.0.1

### Patch Changes

- 937c4f2: `trackAgents` now reports agent browsers that send a regular Chrome user agent but sign their requests with a `Signature-Agent` header, such as ChatGPT agent, and sends the request's `Accept` header so you can see which agents ask for markdown. Clients that aren't browsers and ask for markdown first are reported too, so AI tools with generic user agents show up as unidentified agents. The user agent, `Accept` and referrer are capped to the lengths Databuddy accepts, so an unusually long user agent no longer drops the request. `trackAgents` never throws or rejects, even on a malformed URL or in a runtime without `fetch`, and the drop-in `proxy` works when the runtime passes no `waitUntil`, so tracking can never break a request or crash a Node server.
- React's `FlagsProvider` and the Vue flags plugin no longer send flag requests from renders that React throws away. Creating the flags manager no longer fetches or adds a visibility listener; the provider starts it after mounting, and flags read before then report loading instead of queuing a request. A burst of discarded renders (StrictMode, Suspense, concurrent rendering) now sends one request instead of one per render. Stored flags still load on the first render, so returning visitors don't see flags flash off.

## 3.0.0

### Major Changes

- eef2207: Adds `@databuddy/sdk/agents` for AI agent traffic. Call `trackAgents(request)` from an existing Next.js proxy or middleware, or re-export the ready-made `proxy`. No API key is needed: the website comes from the `websiteId` option or the `NEXT_PUBLIC_DATABUDDY_CLIENT_ID`, `NUXT_PUBLIC_DATABUDDY_CLIENT_ID` or `DATABUDDY_WEBSITE_ID` environment variable, and nothing is sent without one. `AI_AGENT_USER_AGENT` is exported for matching.

  Feature flags back off after a failed request and honor `Retry-After` instead of refetching, keep flag state separate per identity, and record evaluations served from cache. `FlagsRequestError` is exported from the React, Vue and Node entries, and the React flags state includes `lastError`.

  Breaking changes:

  - The deprecated `trackPerformance` option is removed. Use `trackWebVitals`.
  - `clientSecret` is removed from the config types and the Vue `<Databuddy>` props.
  - `fid` is removed from the web vitals types. First Input Delay was replaced by Interaction to Next Paint.
  - `@databuddy/sdk/node` imports `node:crypto`, so edge runtimes need Node.js compatibility enabled (for example `nodejs_compat` on Cloudflare Workers).
  - In `@databuddy/sdk/node`, a full queue rejects new events with `QUEUE_FULL` instead of forcing a flush, and the flush timer no longer keeps the process alive. Call `await client.flush()` before a short-lived process exits.

### Patch Changes

- 5bdf92c: `getAnonymousId` and `getSessionId` now return `null` instead of throwing when `localStorage` or `sessionStorage` access raises a `DOMException`. Follows the same try/catch pattern already used by `getProfileId`. URL params continue to take priority without touching storage.

## 3.0.0

### Major Changes

- d0034c6: Adds `@databuddy/sdk/agents` for AI agent traffic. Call `trackAgents(request)` from an existing Next.js proxy or middleware, or re-export the ready-made `proxy`. No API key is needed: the website comes from the `websiteId` option or the `NEXT_PUBLIC_DATABUDDY_CLIENT_ID`, `NUXT_PUBLIC_DATABUDDY_CLIENT_ID` or `DATABUDDY_WEBSITE_ID` environment variable, and nothing is sent without one. `AI_AGENT_USER_AGENT` is exported for matching.

  Feature flags back off after a failed request and honor `Retry-After` instead of refetching, keep flag state separate per identity, and record evaluations served from cache. `FlagsRequestError` is exported from the React, Vue and Node entries, and the React flags state includes `lastError`.

  Breaking changes:

  - The deprecated `trackPerformance` option is removed. Use `trackWebVitals`.
  - `clientSecret` is removed from the config types and the Vue `<Databuddy>` props.
  - `fid` is removed from the web vitals types. First Input Delay was replaced by Interaction to Next Paint.
  - `@databuddy/sdk/node` imports `node:crypto`, so edge runtimes need Node.js compatibility enabled (for example `nodejs_compat` on Cloudflare Workers).
  - In `@databuddy/sdk/node`, a full queue rejects new events with `QUEUE_FULL` instead of forcing a flush, and the flush timer no longer keeps the process alive. Call `await client.flush()` before a short-lived process exits.

### Patch Changes

- 5bdf92c: `getAnonymousId` and `getSessionId` now return `null` instead of throwing when `localStorage` or `sessionStorage` access raises a `DOMException`. Follows the same try/catch pattern already used by `getProfileId`. URL params continue to take priority without touching storage.
