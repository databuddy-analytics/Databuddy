# Databuddy Codebase Map

Use this file when the task spans multiple packages or when the right edit location is unclear.

## Runtime Surfaces

### `apps/dashboard`

- Theme tokens and WCAG-oriented contrast: `apps/dashboard/app/globals.css` (`:root`, `.dark`)
- Next.js dashboard application
- Default dev port: `3000`
- Talks to the backend through oRPC using [`apps/dashboard/lib/orpc.ts`](/Users/iza/Dev/Databuddy/apps/dashboard/lib/orpc.ts)
- **Status pages:** Public page lives under `app/status/[slug]`; **dashboard** edit surface is `app/(main)/monitors/status-pages/[id]/page.tsx`. For stable chrome (no tab strip pop-in), keep `Tabs` always mounted and gate **content** with `useFeatureAccess` + `FeatureLockedPanel`—do not wrap the whole `Tabs` in `FeatureAccessGate` with a list-only `loadingFallback`. Reserve `PageHeader` `right` with skeletons until `statusPage` loads; use a static `description` and breadcrumb fallback `"Status page"` so the header does not reflow on fetch.
- Typical work:
  - UI components and pages
  - client hooks
  - auth-aware frontend flows
  - query and mutation consumers
- **List** (`components/ui/composables/list.tsx`) and **Chart** (`components/ui/composables/chart.tsx`): compound shells for list pages and charts; see `design-system.mdc` for patterns. **Shared Recharts styling:** `lib/chart-presentation.ts` (also `Chart.presentation`)—surfaces (`chartSurfaceClassName`, `chartPlotRegionClassName`), axis ticks + Y widths, grid, tooltip shells, series palette, Recharts `Legend` wrappers + label helpers, `Chart.Legend` pill classes—use for bespoke charts so they match `Chart.Tooltip` / `CartesianArea`. **Layers:** (1) `Chart.SingleSeries` / `Chart.MultiSeries` / `Chart.CartesianArea` for common shapes—**prefer these**; (2) `Chart.Recharts.*` only for bespoke charts (reference bands, drag ranges, pie, stacked billing, traffic annotations). The **`recharts` npm package is imported only in `composables/chart.tsx`**. Exported **`ChartConfig`** is for AI `buildChartConfig`. `components/charts/simple-metrics-chart.tsx` is `Chart` + `Content` + `MultiSeries`. Dynamic chunks: `import("@/components/ui/composables/chart").then((m) => m.Chart.Recharts.…)` or composed `Chart.*` components.
- Agent chat: [`contexts/chat-context.tsx`](/Users/iza/Dev/Databuddy/apps/dashboard/contexts/chat-context.tsx) — `useChat` must start with `messages: []` on server **and** first client paint; restore `getMessagesFromLocal` in `useLayoutEffect` and gate `saveMessagesToLocal` until `hasRestoredFromLocal`, or SSR/hydration will disagree (empty vs persisted thread). UI: [`agent-messages.tsx`](/Users/iza/Dev/Databuddy/apps/dashboard/app/(main)/websites/[id]/agent/_components/agent-messages.tsx) merges consecutive identical tool labels (`formatToolLabel`) when the same tool+input repeats (`· 2×`); bottom `StreamingIndicator` only when no assistant text **and** no active tool label (`displayMessage`), so the in-message `ToolStep` is not duplicated by the shimmer.
- Analytics agent web search: [`web-search.ts`](/Users/iza/Dev/Databuddy/apps/api/src/ai/tools/web-search.ts) (Perplexity). Tool labels in dashboard [`tool-display.tsx`](/Users/iza/Dev/Databuddy/apps/dashboard/lib/tool-display.tsx).

### `apps/api`

- Elysia API service
- Default dev port: `3001`
- **Autumn (`autumn-js/fetch`)**: Do not `mount(autumnHandler(...))` with a single argument — Elysia treats that as a catch‑all `/*` and Autumn returns `{"code":"not_found",...}` for every non‑Autumn path (breaks OpenAPI docs at `/` and `/spec.json`). Mount at `/api/autumn` and pass requests through `withAutumnApiPath` so routed paths stay under `/api/autumn` (see [`apps/api/src/lib/autumn-mount.ts`](/Users/iza/Dev/Databuddy/apps/api/src/lib/autumn-mount.ts)).
- AI insights: [`apps/api/src/routes/insights.ts`](/Users/iza/Dev/Databuddy/apps/api/src/routes/insights.ts) — Top Pages rows include a **Human label** (opaque path segments → “Demo page”, etc.); system prompt asks for risk/watch insights in good weeks and data-grounded suggestions. Dashboard [`insight-card`](/Users/iza/Dev/Databuddy/apps/dashboard/app/(main)/insights/_components/insight-card.tsx): **Ask agent** + path-aware **View events** (`/events/stream?path=…` when a path is parsed from copy). Dedupes on cooldown-window DB keys `(websiteId|type|direction)`; failed insert returns no new insights. Funnel/MRR/retention insights require those metrics in query data—do not invent in prompts alone.
- Handles routes such as public endpoints, webhooks, health, query, MCP, and agent-related APIs
- Typical work:
  - route handlers
  - wiring server context into shared RPC logic
  - service-level health and webhook behavior

### `apps/basket`

- Analytics ingest and LLM tracking service
- Default runtime port in source: `4000`
- Important for:
  - event ingestion
  - request validation and anti-abuse checks
  - billing and quota checks
  - ClickHouse writes and fallback behavior
  - LLM observability ingestion
- Start at [`apps/basket/src/index.ts`](/Users/iza/Dev/Databuddy/apps/basket/src/index.ts)

### `apps/links`

- Elysia redirect/link handling service
- Likely owns link redirects and expired-link behavior

### `apps/docs`

- Next.js docs site using Fumadocs
- Default dev port: `3005`
- Good place for product docs, guides, and marketing-adjacent content with app integrations
- Pricing for agents: `public/pricing.md`; `GET /api/pricing` (JSON or markdown via `Accept`); middleware rewrites `/pricing` → `/api/pricing` when markdown wins.
- Cookie cost calculator: [`apps/docs/app/(home)/calculator/`](/Users/iza/Dev/Databuddy/apps/docs/app/(home)/calculator/) — uses **visitor data loss rate** (consent / analytics visibility), not “banner bounce”; literature band 40–70% in `calculator-engine.ts`.

### `apps/uptime`

- Elysia service for uptime monitoring and related notifications
- Integrates with email and services packages

## Shared Packages

### `packages/db`

- Central data layer
- Exports:
  - Drizzle ORM types and helpers
  - Postgres client `db`
  - Postgres schema and relations
  - ClickHouse client and schema
- Key files:
  - [`packages/db/src/drizzle/schema.ts`](/Users/iza/Dev/Databuddy/packages/db/src/drizzle/schema.ts)
  - [`packages/db/src/drizzle/relations.ts`](/Users/iza/Dev/Databuddy/packages/db/src/drizzle/relations.ts)
  - [`packages/db/src/client.ts`](/Users/iza/Dev/Databuddy/packages/db/src/client.ts) — strips `sslrootcert=system` from `DATABASE_URL` before `pg` Pool: libpq uses it for the OS trust store, but node-postgres treats `sslrootcert` as a file path and throws `ENOENT` on path `"system"`.
  - [`packages/db/src/clickhouse/client.ts`](/Users/iza/Dev/Databuddy/packages/db/src/clickhouse/client.ts)

### `packages/rpc`

- Shared oRPC contract layer between dashboard and backend
- Exposes `appRouter`, `createRPCContext`, auth-aware procedures, workspace guards, billing helpers, and export logic
- If a dashboard mutation or query changes shape, this package is usually part of the change
- **Autumn (`autumn-js` ≥1.2.4, workspace catalog)**: Use `getAutumn()` from [`packages/rpc/src/lib/autumn-client.ts`](/Users/iza/Dev/Databuddy/packages/rpc/src/lib/autumn-client.ts) (also re-exported from `@databuddy/rpc`). `check({ customerId, featureId, sendEvent?, properties? })` returns `CheckResponse` with **nested `balance`** (`usage`, `granted`, `remaining`, `unlimited`, `overageAllowed`) — not `{ data, error }` and not snake_case params. `customers.get` is gone; use `customers.getOrCreate({ customerId })`. Active plan: `customer.subscriptions` (not `products`).

### `packages/auth`

- Better Auth integration
- Drizzle adapter setup, SSO, organization and access-control plugins, client auth entrypoint
- Important for sign-in, invitation, organization, session, and permission behavior

### `packages/env`

- Central env validation
- Per-app modules such as `dashboard.ts`, `api.ts`, `basket.ts`, and `docs.ts`
- Update the matching module when adding or changing environment variables

### `packages/shared`

- Shared types and utility layer
- Includes analytics-oriented types, feature flags, IDs, country codes, bot detection, and OpenRouter helpers

### `packages/sdk`

- Published Databuddy SDK
- Supports React, Vue, and Node entrypoints
- Good starting point for external-facing analytics API changes
- Flags architecture:
  - `BaseFlagsManager` (abstract) → `BrowserFlagsManager` (client) / `ServerFlagsManager` (node)
  - Promise-based cache with TTL + SWR revalidation, request batching via `RequestBatcher`
  - `BrowserFlagStorage` — single-blob localStorage under `db-flags` key
  - React: `FlagsProvider` + `useFlag` + `useFlags` (no `useFeature`/`useVariant`/`useFlagValue`)
  - Vue: `createFlagsPlugin` + `useFlag` + `useFlags`
  - Node: `createServerFlagsManager` (no `InMemory` alias)
  - `subscribe()`/`getSnapshot()` for `useSyncExternalStore` integration

### `packages/tracker`

- Internal tracker script package used to build the CDN-served browser bundle
- Separate from the published SDK package
- Use when the task is about the raw tracker script, plugin initialization, or release diff/deploy tooling

### Other packages

- `packages/ai`: LLM observability SDK wrappers for OpenAI, Anthropic, and Vercel AI SDK
- `packages/notifications`: multi-channel notifications and uptime templates
- `packages/cache`: Drizzle cache implementation
- `packages/redis`: Redis helpers and cache/pub-sub utilities
- `packages/services`: domain service helpers such as websites
- `packages/validation`: shared Zod validation
- `packages/api-keys`: API key resolution and scopes
- `packages/mapper`: mapping/import utility package
- `packages/email`: React Email templates and preview config

## Common Cross-Cuts

### Dashboard feature with backend data

1. Find the dashboard consumer in `apps/dashboard`
2. Trace to `apps/dashboard/lib/orpc.ts`
3. Edit or inspect the procedure in `packages/rpc`
4. Confirm API wiring in `apps/api` only if needed

### Analytics event issue

1. Check `packages/sdk` or `packages/tracker`
2. Trace request handling into `apps/basket`
3. Follow validation, billing, geo, and producer logic
4. Inspect `packages/db` for storage schema or ClickHouse behavior

### Auth or org-permission bug

1. Start in `packages/auth`
2. Check workspace and permission procedures in `packages/rpc`
3. Verify dashboard session/client integration only after the server contract is clear

### New environment variable

1. Add it to the relevant `packages/env/src/*.ts` module
2. Update the consuming app or package
3. Prefer existing env-loading patterns instead of reading raw `process.env` in many places

## Useful Commands

At repo root:

```bash
bun run dev
bun run dev:dashboard
bun run lint
bun run format
bun run test
bun run check-types
bun run db:push
bun run db:migrate
bun run clickhouse:init
```

Targeted package examples:

```bash
cd apps/api && bun test
cd apps/basket && bun test
cd packages/sdk && bun test
cd packages/tracker && bun run test:unit
cd packages/db && bun run db:seed
```

## Search Patterns

```bash
rg "appRouter|createRPCContext|sessionProcedure" packages/rpc apps/api
rg "orpc\\." apps/dashboard
rg "betterAuth|organization|permission" packages/auth packages/rpc apps/dashboard
rg "clickHouse|ClickHouse|TABLE_NAMES|drizzle" packages/db apps/basket apps/api
rg "trackRoute|basketRouter|llmRouter|request-validation|structured-errors" apps/basket
rg "createEnv|NEXT_PUBLIC_API_URL|DATABASE_URL" packages/env apps/*
```
