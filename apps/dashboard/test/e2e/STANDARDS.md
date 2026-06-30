# Dashboard E2E standards

This document defines how dashboard end-to-end tests should be written and maintained.

## Purpose

E2E tests prove that critical Databuddy user journeys work in a real browser. They are not a replacement for unit, integration, or query-level tests.

Use E2E tests for:

- Auth/session shell behavior.
- Critical CRUD flows such as API keys, websites, links, monitors, and status pages.
- Recent regressions that depend on real browser interaction.
- Permission and organization-context behavior.
- Responsive navigation, dialogs, sheets, and topbar controls.

Do not use E2E tests for:

- Every validation branch or table variant.
- ClickHouse SQL correctness.
- Pure utilities, config, permissions helpers, or query builders.
- Visual-only copy changes.

## Test isolation

Every E2E test must be safe to run in parallel.

Required:

- Use `apps/dashboard/test/e2e/fixtures.ts` unless there is a clear reason not to.
- Import local E2E fixtures/helpers through the dashboard `@/test/e2e/...` alias, not deep `../../` paths.
- Create isolated users, organizations, websites, and seeded analytics data through the E2E bootstrap fixtures.
- Keep tests independent. No test may depend on another test's data or execution order.
- Prefer per-test state over shared mutable fixtures.

Avoid:

- Global truncation while tests are running.
- Shared mutable accounts.
- Depending on pre-existing local database rows.

## Local runtime

Run dashboard E2E locally with:

```bash
bun run --cwd apps/dashboard test:e2e:local
```

The local runner creates an isolated Postgres database, starts ClickHouse, initializes schemas, seeds analytics data, runs Playwright, and drops the Postgres database when finished.

Useful debugging flags:

```bash
DATABUDDY_E2E_KEEP_DB=true bun run --cwd apps/dashboard test:e2e:local
DATABUDDY_E2E_CLICKHOUSE_EVENTS=1000 bun run --cwd apps/dashboard test:e2e:local
DATABUDDY_E2E_SEED_CLICKHOUSE=false bun run --cwd apps/dashboard test:e2e:local
```

## Selectors

Prefer selectors that match how users and assistive technology see the page.

Selector priority:

1. `getByRole`
2. `getByLabel`
3. `getByText` with `exact: true` when needed
4. `getByTestId` for stable non-accessible hooks only
5. CSS selectors only as a last resort

Good:

```ts
await page.getByRole("button", { name: "Create Key" }).click();
await expect(page.getByRole("heading", { name: "API Keys" })).toBeVisible();
```

Avoid:

```ts
await page.locator(".card > div:nth-child(3) button").click();
```

## Assertions

Assert user-visible behavior, not implementation details.

Good assertions:

- Dialog or sheet opens/closes.
- URL changes after navigation or filter updates.
- A created record appears, then disappears after deletion.
- A disabled/hidden control reflects permissions.
- Seeded analytics produce visible non-empty states.

Avoid assertions that only prove implementation internals:

- Component class names.
- React state names.
- Exact network request count unless the behavior under test is request behavior.

## Waiting

Do not use arbitrary sleeps.

Prefer:

```ts
await expect(page.getByText("Saved")).toBeVisible();
await expect(page).toHaveURL(/startDate=/);
```

Use `waitForResponse` only when the network response itself is part of the behavior under test.

## Test data

Use deterministic, scoped names so failures are easy to inspect:

```ts
const keyName = `E2E key ${e2eSession.userId.slice(0, 8)}`;
```

E2E-only routes must remain guarded by:

- `DATABUDDY_E2E_MODE`
- `x-e2e-test-key`
- server-only runtime

Never expose test bootstrap behavior outside E2E mode.

## External services

E2E tests should not require production credentials or external APIs.

Allowed local services:

- Postgres
- Redis
- ClickHouse
- Dashboard Next.js server
- Local API server

If a feature normally calls a paid or remote provider, use E2E-safe fallback behavior or local fixtures.

## Naming

Use behavior-oriented test names:

```ts
test("creates and deletes an API key without leaving confirmation dialogs open", async ({ page }) => {});
```

Avoid implementation-oriented names:

```ts
test("mutation works", async ({ page }) => {});
```

## Suite layout and tags

Keep specs grouped by intent:

```txt
specs/smoke/        # fast shell/session/account checks
specs/regressions/  # focused coverage for bugs that should never return
specs/core/         # broader product journeys as they are added
```

Use tags consistently:

- `@smoke` for the smallest always-useful suite.
- `@regression` for recent or historically brittle behavior.
- `@core` for important product flows that are broader than smoke.

Run tagged suites locally with:

```bash
bun run --cwd apps/dashboard test:e2e:local:smoke
bun run --cwd apps/dashboard test:e2e:local:regression
bun run --cwd apps/dashboard test:e2e:local:core
bun run --cwd apps/dashboard test:e2e:local:pr
```

## CI expectations

Pull requests run the PR suite (`@smoke` and `@regression`). Pushes to `staging` and `main` run the full dashboard E2E suite. Broader suites can also run on nightly schedules as coverage grows.

CI should upload Playwright traces, screenshots, and videos on failure.
