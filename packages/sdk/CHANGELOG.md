# @databuddy/sdk

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
