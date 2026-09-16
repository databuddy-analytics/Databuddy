# Business context experience

## Objective and scope

Make organization business context readable, explain what is missing, and make AI generation predictable. Existing saved briefs, team assertions, measurement plans, revisions, and manual editing remain the source of truth. This work starts from staging and does not depend on the deeper memory-storage changes in PR #751.

## Acceptance criteria

- Render briefs and proposed versions with the installed Streamdown renderer. Editing is explicit; incomplete generated text cannot be saved as an approved brief.
- Keep the page shell, action area, and measurement controls stable during loading, saving, and access checks. Support narrow screens and keyboard navigation.
- Check generation access before admitting an active request; distinguish missing credits, unavailable billing, missing configuration, and read-only permissions. Manual editing works without AI access.
- Show actual generation progress through a streaming oRPC request; preserve saved content and local edits through generation, cancellation, errors, reload, conflicts, and history restore. Request cancellation clears only its matching active generation, while consumed usage settlement remains independent.
- Replace word-level diff markup with readable current/proposed versions and explicit actions.
- Support a bounded list of additional public source URLs, preserve hostname/ownership boundaries, read fresh sources, retain source read times, and use existing team context during generation.
- Keep a seven-page read ceiling with a bounded second discovery step. Do not introduce a general crawler or new database tables.

## Implementation order

1. Parallel isolated branches: generation-access RPC; API source/progress contract; dashboard document and review flow.
2. Integrate the backend commits into the dashboard branch and exercise all states.
3. Review changes, run root lint/types and focused tests, build dashboard, verify desktop/mobile in a real browser, then open a draft PR against staging.

## Files and conventions

Dashboard components: `apps/dashboard/app/(main)/organizations/components`; regression tests: `apps/dashboard/test/e2e/specs/regressions`. Backend: `packages/rpc/src/routers/business-context.ts`, shared schema/service, and `apps/api/src/ai/organization-business-context.ts`.

Use `@databuddy/ui` controls, `Field` labels, semantic tokens, and explicit typed props. Example: `<Button disabled={!canGenerate} loading={generating}>Generate draft</Button>`. Reuse existing oRPC streaming, billing policy, version checks, and provider clients. Never discard edits on provider failure or expose raw provider errors/secrets.

## Verification

`bun run lint`; `bun run check-types`; `bun run test src/ai/organization-business-context.test.ts` from `apps/api`; relevant RPC tests through its package runner; isolated dashboard Playwright business-context and measurement-plan regressions; `NODE_ENV=production bun run --cwd apps/dashboard build` with synthetic local configuration and E2E mode disabled.

Use only synthetic fixtures for browser/model/provider tests. No production data, paid model calls, billing mutations, deployment, or merge is part of validation. Code changes are approved by the user; preserve unrelated working-tree edits.

## Completed validation

- Root lint and all 33 workspace typecheck tasks pass on current staging.
- Production dashboard build passes with E2E mode disabled.
- 24 RPC, 52 generator/shared-schema, and 25 isolated PostgreSQL storage tests pass.
- All 18 Playwright regressions pass in one run after rebasing. They cover recovery, saved revisions, source attribution, keyboard focus, credit/configuration gates, streamed previews, mobile comparison, and stable measurement controls during saves.
- Desktop and mobile screenshots were inspected; synthetic previews had no uncaught page errors or horizontal overflow.

The generator uses real partial-output streaming with durable updates, surfaced by the active oRPC request. Settings polling remains a fallback for active generations outside the current request. Provider behavior is tested with mocks; live model output quality and paid-provider billing are outside this validation. Selected documentation subdomains are supported; arbitrary cross-domain crawling and scheduled refresh are not added.
