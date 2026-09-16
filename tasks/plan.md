# Business context experience

## Objective and scope

Make organization business context readable, explain what is missing, and make AI generation predictable. Existing saved briefs, team assertions, measurement plans, revisions, and manual editing remain the source of truth. This work starts from staging and does not depend on the deeper memory-storage changes in PR #751.

## Acceptance criteria

- Render briefs and proposed versions with the installed Streamdown renderer. Editing is explicit; incomplete generated text cannot be saved as an approved brief.
- Keep the page shell, action area, and measurement controls stable during loading, saving, and access checks. Support narrow screens and keyboard navigation.
- Check generation access before a queued job; distinguish missing credits, unavailable billing, missing configuration, and read-only permissions. Manual editing works without AI access.
- Show actual streamed generation progress through the existing durable job/polling flow; preserve saved content and local edits through generation, cancellation, errors, reload, conflicts, and history restore.
- Replace word-level diff markup with readable current/proposed versions and explicit actions.
- Support a bounded list of additional public source URLs, preserve hostname/ownership boundaries, read fresh sources, retain source read times, and use existing team context during generation.
- Keep a seven-page read ceiling with a bounded second discovery step. Do not introduce a general crawler or new database tables.

## Implementation order

1. Parallel isolated branches: generation-access RPC; worker/source/progress contract; dashboard document and review flow.
2. Integrate the backend commits into the dashboard branch and exercise all states.
3. Review changes, run root lint/types and focused tests, build dashboard, verify desktop/mobile in a real browser, then open a draft PR against staging.

## Files and conventions

Dashboard components: `apps/dashboard/app/(main)/organizations/components`; regression tests: `apps/dashboard/test/e2e/specs/regressions`. Backend: `packages/rpc/src/routers/business-context.ts`, shared schema/service, and `apps/insights/src/organization-business-context.ts`.

Use `@databuddy/ui` controls, `Field` labels, semantic tokens, and explicit typed props. Example: `<Button disabled={!canGenerate} loading={generating}>Generate draft</Button>`. Reuse existing queue, billing policy, version checks, and provider clients. Never discard edits on provider failure or expose raw provider errors/secrets.

## Verification

`bun run lint`; `bun run check-types`; `bun test src/organization-business-context.test.ts` from `apps/insights`; relevant RPC tests through its package runner; isolated dashboard Playwright business-context and measurement-plan regressions; `NODE_ENV=production bun run --cwd apps/dashboard build` with existing environment.

Use only synthetic fixtures for browser/model/provider tests. No production data, paid model calls, billing mutations, deployment, or merge is part of validation. Code changes are approved by the user; preserve unrelated working-tree edits.
