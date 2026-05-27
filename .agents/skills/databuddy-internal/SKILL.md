---
name: databuddy-internal
description: Work inside the Databuddy monorepo for internal implementation, debugging, review, and refactoring. Use only for repository code changes across dashboard, api, basket, links, docs, uptime, SDK, tracker, auth, RPC, database schema, ClickHouse, or shared packages. Do not use for external SDK, API, CDN, feature flag, or LLM observability integration guidance; use databuddy instead.
---

# Databuddy Internal

Databuddy is a Bun + Turborepo TypeScript monorepo. Start by locating the user request in one product surface, then trace its shared dependencies before editing.

For **external** integrations (SDK, CDN, public APIs), use the **`databuddy`** skill; this skill is for **this repository**.

## Skill maintenance (required)

When a mistake could have been avoided with better repo context (wrong app, package, port, or pattern), or when the user corrects you or asks you to fix something you got wrong, **update this skill** (`SKILL.md` or `references/codebase-map.md`) in the same turn when practical.

Keep additions **minimal**: one bullet, a new `rg` hint, or a routing note—enough that the next session does not repeat it. If the lesson is for SDK/API customers, add it under `.agents/skills/databuddy/` instead.

## Quick Map

- Prod infrastructure repo is local at `/Users/iza/Documents/GitHub/databuddy-infra` (`databuddy-analytics/infra`); ClickHouse cluster inventory is `clickhouse/ansible/inventory.yml`, not `/Users/iza/Dev/Databuddy/infra` or `DatabuddyOPS`.
- Never use production/customer data as tests, fixtures, snapshots, examples, or copied output. Tests must use placeholders/mocks only (example.com, example IDs). If production ClickHouse is queried for investigation, summarize anonymized aggregates and do not paste customer domains, client IDs, emails, or other identifiers into code or responses.
- `apps/dashboard`: Next.js app on port `3000` (per-website **agent** chat: `@ai-sdk/react` `useChat` via `contexts/chat-context.tsx` — not the separate `chat-sdk` package; overlapping sends while streaming are queued client-side to mirror a “queue latest” strategy.)
- Dashboard Playwright webServer commands run under CI PATH from setup-bun; avoid `bash -lc` because login shells can drop Bun from PATH. Build dist-only workspace packages such as `@databuddy/sdk` and `@databuddy/devtools` before starting the API/dashboard. Client `NEXT_PUBLIC_*` flags must use direct env access so Next can inline them. `readBooleanEnv` only treats the literal string `"true"` as enabled, so CI E2E booleans must use `"true"`/`"false"`, not `"1"`/`"0"`.
- Local E2E dashboard smokes that need `/api/test/e2e/*` should start the API/dashboard directly (or through Playwright's webServer command), not via `bun run dev:dashboard`; Turbo runs in strict env mode and drops `DATABUDDY_E2E_MODE`/`DATABUDDY_E2E_TEST_KEY` unless they are added to `turbo.json` `globalEnv`.
- Dashboard Playwright public/demo analytics specs call API `/v1/query` anonymously from the browser; keep `DATABUDDY_E2E_MODE` query behavior isolated from production rate limits so CI retries do not exhaust `anon:unknown`.
- `apps/api`: Elysia API on port `3001`
- `apps/slack`: Slack agent adapter; Slack installs must resolve through org-scoped DB integration records, not a single env bot token/default website. Agent calls must use an encrypted per-integration Databuddy API key secret as a normal bearer token, never a global internal secret.
- Slack OAuth lives in `apps/api`, but slash commands/events require `apps/slack` to be running too; local `bun run dev:dashboard` runs dashboard + API only, so use `bun run dev:slack` when working on Slack. The Slack package scripts read the root `.env`.
- Slack routing is organization-scoped: OAuth binds a Slack workspace to a Databuddy organization, app mentions from the installed workspace auto-bind channels including Slack Connect, and `/bind` is now a manual fallback for unknown/unapproved channels. DMs/assistant threads work after workspace install. Analytics questions should go through app mentions/DMs using MCP-style website discovery inside the installed organization, never by fanning out across the message sender's user memberships. Slack emits evlog events under `apps/slack/.evlog/logs` in development/`SLACK_EVLOG_FS=1`; Axiom uses `AXIOM_TOKEN` with `SLACK_AXIOM_DATASET` defaulting to `slack`; and reactions need the `reactions:write` bot scope. Remote manifest updates need `SLACK_APP_ID` plus a Slack app configuration token in `SLACK_APP_CONFIG_TOKEN`; trust Slack API errors over token-prefix guesses.
- Slack scope changes require reinstalling/reauthorizing the workspace; updating the local/remote manifest alone does not grant newly-added bot scopes to an existing installation.
- Slack agent billing flows through an org-scoped automation API key; existing keys may have `userId: null`, so the agent billing resolver must fall back to the organization owner when an API key has `organizationId`.
- Slack memory is separate from billing/auth: pass a Slack-scoped `memoryUserId` such as `slack-{team}-{user}` plus current-speaker context so one Slack user's saved name/preferences do not bleed into another user's replies.
- Slack agent write tools need the integration automation API key to include the matching Databuddy API scopes (currently `read:data`, `read:links`, `write:links`, `manage:websites`, `manage:flags`); older installs may need reconnecting so a new key is minted.
- Shared agent integrations should call `@databuddy/ai/agent` (`askDatabuddyAgent` / `streamDatabuddyAgent`) instead of importing internal MCP run/history helpers directly.
- Insights generation logic belongs in `apps/insights` and should reuse `@databuddy/ai`; `apps/api` should only read insight data or queue runs, not own prompts, model calls, tool loops, validation, or persistence orchestration.
- Agent ClickHouse SQL must use the canonical analytics.events schema: `client_id`, `time`, `path`, `event_name`, and pageviews as `event_name = 'screen_view'`; never `website_id`, `created_at`, `page_path`, `event_type`, or `pageview`.
- Slack agent evals live in `packages/evals`: use `bun run eval --surface slack` for the whole Slack surface. `--tag slack` is only a tiny smoke subset, and `cost_fallback` in agent telemetry is pricing-catalog fallback, not proof the model request fell back.
- Slack agent expected stops such as exhausted Databunny credits should throw `DatabuddyAgentUserError` from `@databuddy/ai/agent/errors`; Slack surfaces those messages directly and reserves the generic reconnect copy for real infrastructure failures.
- Slack Docker builds use `bun build --compile --bytecode`; keep `apps/slack/src/index.ts` bootstrapping inside an async `main()` instead of top-level `await`, which can fail during compile even when typecheck passes.
- Insights Docker builds also use `bun build --compile --bytecode`; keep `apps/insights/src/index.ts` startup work inside async functions instead of top-level `await`.
- After Slack Docker changes, verify the full pruned image with `docker build --progress=plain -f slack.Dockerfile -t databuddy-slack:test .`; the inner Bun compile is not enough because prune can miss dependency build outputs and package exports.
- Slack-reachable shared packages (`@databuddy/ai`, `@databuddy/rpc`) must not import `evlog/elysia`; use host-injected request logger providers from the API and plain evlog fallbacks elsewhere.
- AI link tools must assign link folders by existing folder `id` or `slug` only; folder names are display text and must not be used for routing or dedupe.
- `apps/basket`: ingest and LLM tracking service, Elysia app on port `4000`
- `apps/docs`: Next.js + Fumadocs docs app on port `3005`
- `apps/links`: redirect/link service
- `apps/uptime`: uptime monitoring service
- `apps/uptime` BullMQ worker concurrency defaults high for Bun async I/O; do not lower it just because `10_000` looks large. Verify downstream saturation or lock/timeout evidence first.
- Public status pages render from `apps/status`; `apps/dashboard` owns status-page management/config UI only. When cleaning public status UX, update shared `@databuddy/ui/uptime` pieces or `apps/status` wrappers instead of redesigning dashboard-only route remnants.
- `packages/db`: Drizzle Postgres schema, client, and ClickHouse helpers
- `packages/rpc`: shared oRPC router, procedures, auth-aware server context
- `packages/auth`: Better Auth setup, permissions, organization access
- `packages/env`: per-app env schemas
- `packages/shared`: shared types, flags, analytics schemas, utilities
- `packages/sdk`: published analytics SDK for React, Vue, and Node
- `packages/tracker`: internal tracker script build and release package
- `packages/encryption`, `packages/notifications`, `packages/cache`, `packages/redis`, `packages/services`, `packages/validation`, `packages/api-keys`: shared infra and domain packages

Read [codebase-map.md](./references/codebase-map.md) when you need deeper routing guidance.

## Workflow

1. Identify the runtime surface first: dashboard UI, API, ingest pipeline, docs site, tracker, or shared package.
2. Read the owning package's `package.json`, entrypoint, and direct dependencies before changing code.
3. If the change crosses app boundaries, trace the contract:
   `dashboard -> apps/dashboard/lib/orpc.ts -> packages/rpc -> apps/api`
4. If the change touches analytics ingestion or LLM observability, trace:
   `packages/sdk` or `packages/tracker` -> `apps/basket` -> `packages/db` / ClickHouse
5. If the change touches auth, org permissions, or session-aware server behavior, inspect `packages/auth` and `packages/rpc` together.
6. Validate with the smallest relevant command instead of running the whole monorepo by default.

## Repo Conventions

- Package manager: `bun`
- When running `bun install --lockfile-only`, preserve lockfile sync for pre-existing `package.json` changes instead of reverting them as unrelated.
- Task runner: `turbo`
- Formatting/linting: `bun run format`, `bun run lint`
- Lefthook's `no-secrets` guard intentionally ignores the exact `.env.example` template; real `.env`, `.env.*`, key, and credential files should still be blocked.
- Root dev orchestration: `bun run dev`
- Dashboard + API together: `bun run dev:dashboard`
- Tests at root currently target `./apps`: `bun run test`
- Database scripts are routed from root into `packages/db`
- Environment schemas live in `packages/env/src/*.ts`; update the matching app schema when adding env vars
- BullMQ queues use `BULLMQ_REDIS_URL`; generic Redis cache/pubsub code uses `REDIS_URL`.

## Code Standards

- Keep one source of truth. If output is AI-generated copy, semantic labels, summaries, or recommendations, fix the upstream prompt/schema/validation contract; do not patch it later with frontend regex/string heuristics.
- Use deterministic transforms only for deterministic data: stable enums, IDs, namespaces, routes, schema fields, and typed status values. Do not guess meaning from free-form model/user text with regexes.
- Prefer structured contracts over text parsing. If the UI needs a label, action, link, severity, or metric category, add it to the schema/tool output and validate it at the boundary.
- Keep domain concerns at the owning seam. Routers/UI should call domain/service helpers, not know cache keys, raw Redis patterns, billing internals, or provider-specific lifecycle details.
- Prefer direct, boring code. Use typed registries and small local helpers when they delete duplication; avoid generic job/facade abstractions, labeled pipelines, or framework-y wrappers unless they clearly reduce code and concepts.
- Test invariants and contracts, not implementation trivia. Add guard tests for architectural rules only when they prevent repeat classes of bugs.

## Change Routing

### Dashboard work

- Start in `apps/dashboard`
- For dashboard navigation audits, check all route surfaces: `components/layout/navigation/navigation-config.tsx`, `components/ui/command-search.tsx`, and local `PageNavigation` layouts under `app/**/layout.tsx` before calling a page orphaned.
- When fixing broken dashboard links to moved sections, update the real docs/search/navigation links and section anchors directly; do not add compatibility redirect pages unless explicitly requested.
- Custom events UI is shared in `apps/dashboard/components/events/custom-events`; keep many-series legends outside the Recharts plot, use compact controls for property-summary event selection, and avoid separate event-count chip/list sections.
- Insights merged feed (`use-insights-feed`) collapses history + AI by `insightSignalDedupeKey` in `apps/dashboard/lib/insight-signal-key.ts` so the list is one row per signal (latest wins).
- Insights page (`app/(main)/insights`) should stay focused on the brief + signal queue; do not add generic global analytics KPI cards or top pages/referrers/countries tables there.
- Theme: `apps/dashboard/app/globals.css`. **`--border` is intentionally subtle**; do not crank it darker for “contrast” unless **iza** asks—prefer text tokens or layout for readability.
- Website analytics filters are two-way synced between Jotai and the `filters` URL param in `app/(main)/websites/[id]/layout.tsx`; guard URL-driven atom writes from echoing stale atom state back into `nuqs`, or adding a filter can lock the page during form submit.
- Do not centralize, relocate, or otherwise refactor dashboard E2E API route access gates during cleanup; keep test-only access checks local to each route unless iza explicitly asks for that change.
- Integration catalog logos: use filled Simple Icons SVG path data (or equivalent filled brand SVG), store the path on each item as `iconPath`, render it through a shared logo tile with `bg-secondary/60`, `border-border/70`, `text-foreground`, and `fill="currentColor"`, then use brand color only as a small accent bar (`accent` or `accentClassName: "bg-foreground/70"` for black/near-black brands). Avoid raw brand-black icons or mixed line/filled icon sets that disappear in dark mode.
- Organization integrations settings should stay list-first and operational: coming-soon integrations are static rows, Slack is the only expandable row for now, and connected integrations need obvious lifecycle controls such as uninstall/disconnect in the row details.
- Dashboard UI must use `apps/dashboard/components/ds` primitives exactly; feature code must not use raw form/control elements (`button`, `input`, `select`, `textarea`, native dialogs), Base UI/Radix primitives, or ad hoc styled controls directly. If a variant is missing, add or extend the DS component first. For menu-style folder/status/filter/sort/action pickers, use `components/ds/dropdown-menu.tsx`; use `Select` only when the established pattern is explicitly a select/combobox. Read `apps/dashboard/components/ds/README.md` before creating new dashboard UI.
- `DropdownMenu.GroupLabel` must be rendered inside `DropdownMenu.Group`; Base UI throws `MenuGroupRootContext is missing` when labels are placed directly under `DropdownMenu.Content`.
- Traffic Trends chart annotations should use a chart-adjacent annotation rail for dense data; avoid in-plot labels, tall lines, or floating dots that compete with the chart tooltip/data layer.
- Flags list rows (`app/(main)/websites/[id]/flags/_components/flags-list.tsx`) are clickable containers with nested controls; mark nested controls with `data-row-interactive="true"` and have the row ignore those targets instead of relying on broad cell-level `stopPropagation`.
- Never put interactive controls inside another `<button>` on dashboard rows. If a row has actions/menus, make the main row content a sibling `Button` and keep action buttons as separate siblings; do not use a `div` with click/key handlers as a fake button.
- For data loading and mutations, inspect `apps/dashboard/lib/orpc.ts` and the corresponding hooks/components
- Public/demo analytics data still flows through `apps/api/src/routes/query.ts`; public website access is controlled by per-query-builder `publicAccess`, not only oRPC metadata.
- Many changes require matching edits in `packages/rpc`

### API and RPC work

- Start in `apps/api/src`
- Shared API contracts and procedure logic live in `packages/rpc`
- Prefer changing shared router logic in `packages/rpc` rather than duplicating validation in the dashboard
- Analytics AI insights: `apps/api/src/routes/insights.ts` — dedupe key is `websiteId|type|direction` (direction from **signed** `changePercent`, not sentiment); within the cooldown window, matching rows are **updated** (same `id`) instead of inserting duplicates. **Do not** show `changePercent` in the UI with sentiment-based sign flips; the stored value is already signed.

### Ingestion and analytics pipeline

- Start in `apps/basket/src`
- Request validation, billing checks, geo/IP parsing, producer logic, and structured errors are important here

## Billing (Autumn)

- `autumn-js` v1.2.2+ — import `autumnHandler` from `autumn-js/fetch` (NOT `autumn-js/elysia`, that export was removed in v1.0)
- For Elysia, mount with `.mount(autumnHandler(...))` — NOT `.use()`
- `identify` callback receives `(request: Request)` directly, not `({ request })`
- Webhook event types: `balances.limit_reached` (replaces old `customer.threshold_reached`), `customer.products.updated`, `balances.usage_alert_triggered`
- `balances.limit_reached` payload is flat: `{ customer_id, feature_id, entity_id?, limit_type }` — no full customer object
- SDK `Customer` type uses camelCase (`balances`, `subscriptions`, `overageAllowed`), but **webhook payloads are snake_case** and use old field names (`features`, `products`, `included_usage`, `overage_allowed`) — do NOT use the SDK `Customer` type for webhooks
- SDK class is `new Autumn()` (reads `AUTUMN_SECRET_KEY` from env); methods use camelCase: `customerId`, `featureId`, `sendEvent`
- `autumn-js` catalog version is in root `package.json` — update it when bumping
- Storage and schema concerns usually continue into `packages/db`
- **evlog → Axiom:** never use top-level `error` as a **string** on `log.error({ ... })` (e.g. process handlers); it overwrites structured `error.message` on the wide event. Use `error_message` instead. Basket/API drains run `normalizeWideEventForAxiom` before ingest; 4xx `EvlogError` rows are emitted as `level: "warn"` with `client_http_error: true` so Axiom “errors” are not inflated by expected client failures.

### Database work

- Postgres schema: `packages/db/src/drizzle/schema.ts`
- Relations: `packages/db/src/drizzle/relations.ts`
- Drizzle client: `packages/db/src/client.ts`
- ClickHouse helpers and schema: `packages/db/src/clickhouse/*`
- After schema changes, use the repo db scripts rather than ad hoc commands

### Auth and permissions

- Core auth setup: `packages/auth/src/auth.ts`
- Client auth entrypoint: `packages/auth/src/client/auth-client.ts`
- Permission helpers often flow through `packages/rpc`

### SDK and tracker work

- Published SDK logic: `packages/sdk/src`
- Browser tracker bundle: `packages/tracker/src`
- If the user reports missing analytics events, inspect both the producer side and `apps/basket`

## Verification

- Use targeted package commands when available, for example:
  - `bun run dev:dashboard`
  - `cd apps/api && bun test`
  - `cd packages/sdk && bun test`
  - `cd packages/tracker && bun run test:unit`
- If verification depends on services like Postgres, Redis, ClickHouse, or Redpanda, say so explicitly.

## Pitfalls

- The `:online` model suffix is a **Perplexity-only** convention (e.g. `perplexity/sonar-pro`). Never add `:online` to non-Perplexity models.
- **Vercel AI Gateway** model IDs in `apps/api/src/ai/config/models.ts` use gateway-style names (e.g. `anthropic/claude-sonnet-4.5`), not OpenRouter catalog strings.
- **Bun HTTP** default `idleTimeout` is **10 seconds**; agent streams can look idle during slow tools. `apps/api/src/index.ts` exports `idleTimeout` on the server (Bun caps at **255** seconds).
- **AI SDK UI (`useChat`)** does not document automatic HTTP retries on `DefaultChatTransport`—retry UX is **`regenerate()`** + `error` ([chatbot error state](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot#error-state), [error handling](https://ai-sdk.dev/docs/ai-sdk-ui/error-handling)). `maxRetries` on **`streamText`/`generateText`** is server-side model calls, not the browser chat `fetch`. Mid-stream disconnect: **`resumeStream()`** ([useChat](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)).
- AI SDK UI stream custom chunks must use `type: "data-*"` (for example `data-usage` or `data-aiComponent`); injecting arbitrary chunk types such as `usage` makes `DefaultChatTransport` reject the stream.
- Dashboard agent prompt references to new tool names must be backed by registered tools in `packages/ai/src/ai/agents/analytics.ts`; otherwise the model may call an unavailable tool and then apologize instead of rendering the intended UI.
- Dashboard agent navigation affordances should stay dashboard-local and generative where possible; do not move target-label maps into `@databuddy/shared` just to sync the AI tool with dashboard routes.
- **`@elysiajs/cors` with `origin: true`** sets `Vary: *`, killing CDN caching. Override with `set.headers.vary = "Origin"` on cacheable public endpoints.
- **`applyAuthWideEvent`** in `apps/api/src/index.ts` runs a session DB lookup on every request including anonymous `/public/` routes. Skip it for public endpoints via URL check in `onBeforeHandle`.
- **Agent SQL security**: Tenant isolation (`client_id`) is enforced programmatically in `validateAgentSQL` + `requiresTenantFilter` from `@databuddy/db`. Never rely solely on system-prompt instructions for data isolation. Every SQL tool entry point (API, RPC, etc.) must use the shared validation from `packages/db/src/clickhouse/sql-validation.ts`.
- **ClickHouse table allowlist**: Agent SQL is restricted to `analytics.*` tables only. `system.*`, `information_schema.*` are blocked. Add new allowed prefixes in `sql-validation.ts` if new databases are added.
- **Flags API local dev** requires `dotenv -e .env` from repo root to pick up `REDIS_URL`, `DATABASE_URL`, etc.
- **Node SDK flags**: The export is `createServerFlagsManager` (not `createFlagsManager`). Call `waitForInit()` before use.
- **User-scoped flags**: The public flags API loads user-scoped flags (where `flags.userId` is set) via `getCachedFlagsForUser` and merges them with client/org-scoped flags. Client-scoped cache is shared; user-scoped cache is keyed per `userId`.
- **Detail page stats**: Use compact inline `flex` bars at `min-h-10`/`py-2.5` (40px) — not `<dl>` grids with large padding. Heights must be multiples of 10px to align with sidebar item sizing. Status uses a colored dot + text, not `Badge`.
- **User profile detail**: show web vitals as profile/sidebar context, not inside expanded session event rows.
- **Referrer rows**: query builders with `parseReferrers` should return canonical `name`, `referrer`, `source`, `domain`, and `referrer_type`; dashboard tables should render/filter from those fields instead of reparsing source labels.
- **Referrer cell fallback**: `ReferrerSourceCell` must also parse URL/domain-looking `source`, `referrer`, or `name` values, because cached/legacy query rows may reach the table before all builders return canonical fields.
- **`apps/docs` marketing copy:** Do not explain pages as “keyword-focused,” “programmatic,” “intent,” or “meta” in UI—users care about tasks (compare tools, replace X, migrate). Keep internal SEO rationale out of hero and body copy.

## Search Hints

- Use `rg "createRPCContext|appRouter|sessionProcedure" packages/rpc apps/api`
- Use `rg "NEXT_PUBLIC_API_URL|createEnv|shouldSkipValidation" packages/env apps/dashboard`
- Use `rg "clickHouse|ClickHouse|TABLE_NAMES" packages/db apps/basket apps/api`
- Use `rg "betterAuth|drizzleAdapter|organization" packages/auth packages/rpc apps/dashboard`
- Use `rg "trackRoute|basketRouter|llmRouter|structured-errors" apps/basket`
- Use `rg "insightDedupeKey|collapseInsightsBySignal|insightSignalDedupeKey" apps/api apps/dashboard`
