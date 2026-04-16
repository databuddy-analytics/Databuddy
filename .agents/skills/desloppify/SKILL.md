---
name: desloppify
description: Reduce codebase slop by deleting code, flattening abstractions, and replacing custom helpers/types/assertions with native SDK/npm helpers or straightforward schemas (for example Zod). Use when asked to simplify, delete code, or "desloppify" TypeScript/Bun/Nuxt code.
---

# Desloppify

Use this skill for refactor passes where the main target is less code and clearer boundaries.

Primary objective:
- remove more code than you add, without regressing behavior or coverage
- make the resulting code more direct, less layered, and easier to read locally

## When to Use

Trigger this skill when the user asks for:
- "desloppify"
- removing slop, boilerplate, or over-engineering
- replacing custom helpers/types/mappings with native package features
- removing TypeScript assertions and inference workarounds

## Repository Overrides

Always follow repository-level agent rules (for example `AGENTS.md`) when they are stricter than this skill.

## Value Order

During a desloppify pass, use this priority order:
1. correctness
2. simplicity
3. deletion
4. native/package-native solutions
5. reuse
6. type neatness

Interpretation:
- pragmatism is allowed only inside this ordering
- do not use "pragmatic" as a reason to add a new helper, facade, abstraction layer, or generic utility when simpler local code is sufficient
- if correctness requires added code at a boundary, offset it by deleting incidental complexity in the same area when practical

## Modes

Use one mode per pass:

1. Core mode (default)
- for most desloppify requests
- optimize for speed and high signal

2. Deep mode (high-risk)
- use for auth/billing/workflows/streaming/data migrations or broad cross-layer refactors
- adds invariants, rubric, and full verification matrix

## Slop Indicators

Prioritize files with:
- large modules doing multiple jobs
- custom helper stacks that wrap package-native behavior
- custom mapping layers where Zod/schema parsing would be clearer
- custom type aliases duplicating SDK/Drizzle/inference-client contracts
- repeated `as` assertions, especially double-casts (`as unknown as`)
- duplicate or near-duplicate functions that differ only in small branches
- mirrored state (`ref/useState`) that can be derived from existing source state
- **magic string identity fallbacks** — `userId = x ?? y ?? "api-key"` or `?? "unknown"` or `?? ""` where a real ID is required. If a value must exist, guard and fail; never silently degrade to a shared string that corrupts rate limits, billing, and audit trails
- **permission checks missing organizationId** — every `hasPermission` call MUST pass `organizationId` explicitly. Omitting it lets Better-Auth fall back to the session's `activeOrganizationId`, enabling cross-org access
- **`protectedProcedure` on session-only handlers** — if a handler dereferences `context.user.id/.email/.name` without a null check, it must use `sessionProcedure` (API keys have `context.user = undefined`)
- **org-level-only API key checks** — `apiKey.organizationId === resource.organizationId` without scope enforcement (`hasKeyScope`, `getAccessibleWebsiteIds`, `hasWebsiteScope`) lets any org key access any resource in the org regardless of intended restrictions

## Core Mode (Default)

Apply these non-negotiables:
- prefer native SDK/npm helpers over custom helpers
- parse untrusted boundary input with Zod (or existing boundary schema)
- derive types from source-of-truth types/schemas instead of writing parallel interfaces
- remove avoidable assertions (`as`, especially `as unknown as`)
- merge/delete duplicate helpers and thin wrappers
- infer state instead of mirroring it
- keep one source of truth per concern
- replace, then delete obsolete code in same pass
- reduce concepts and lines, not just move code around
- keep behavior stable and tests green
- prefer inlining over extraction during a cleanup pass
- do not optimize for future reuse unless it clearly deletes more code than it adds
- default outcome should be negative LOC; if not, treat the pass as suspect and justify why
- if a refactor adds safety code, run a follow-up compression pass before calling the work done

Core execution order:
1. scan hotspots (`duplicate helpers`, `assertions`, `manual mappings`, `mirrored state`)
2. identify native/schema replacement primitives
3. refactor call-sites, then delete old helpers/types
4. remove any new wrapper/helper that is not strictly necessary
5. run required QA gates and report net reduction/results

## Deep Mode (High-Risk)

Use this when touching sensitive or cross-layer behavior.

### Track Selection (Required in Deep Mode)

Choose one or more tracks before editing:
1. UI/state track
2. API/boundary track
3. Data/Drizzle track
4. Cross-layer integration track

If multiple tracks apply, run in this order: API/boundary -> Data/Drizzle -> UI/state -> integration validation.

### Invariant-First Refactor (Required in Deep Mode)

Before refactoring:
- list invariants that must remain true (contracts, ordering, auth, billing semantics, UX states)
- perform refactor
- prove invariants with tests or explicit checks

### Quality Rubric (Required Before Done in Deep Mode)

Confirm all are satisfied:
- correctness: no behavior/regression drift beyond intended scope
- boundary safety: untrusted input validated at edges
- type integrity: no avoidable assertions or inference bypasses
- simplicity: fewer concepts/helpers/types than before
- test confidence: relevant verification layers executed

## Required Patterns

### Prefer Native Over Custom

- do not write custom utilities if package-native behavior already solves it
- avoid creating custom "normalizer" types when SDK/DB types can be derived directly
- prefer direct code at the call-site over a new shared helper when the logic is short and local

### Prefer Zod Over Manual Mapping

- use `z.object`, `z.enum`, preprocess, and transform for inbound payload normalization
- infer types from schemas (`z.infer`) instead of parallel hand-written interfaces
- centralize shared request/response schemas where multiple call-sites parse the same shape

### Drizzle Typing

- derive row types from schema:
  - `typeof table.$inferSelect`
  - `typeof table.$inferInsert`
- do not cast inserted/selected rows when derivation can model it directly

### Inference Client Typing

- parse unknown JSON payloads through explicit object guards/schema helpers
- avoid structural casts of parsed responses
- keep event parsing runtime-safe and typed at the boundary

### Duplicate Function Policy

- before writing a helper, search for equivalent behavior in:
  - local module
  - shared utils
  - package SDK/native APIs
- prefer deleting both helpers and writing one direct local implementation if that is simpler than introducing another shared abstraction
- if two helpers share most logic, merge to one implementation with explicit params
- delete thin wrappers that only rename args or forward calls unchanged
- no duplicate helper/functions in the same slice unless a clear boundary requires it
- if duplication remains, document why it is intentional

## Anti-Abstraction Policy

During a desloppify pass, these are presumed wrong unless clearly justified:
- new facades around test doubles or mocks
- new "shared" helpers introduced only to avoid a few repeated lines
- generic parser/normalizer utilities when a local schema or direct check is clearer
- helper extraction that makes the reader jump across files for short logic

Use this rule:
- prefer a little duplication over a new abstraction
- only introduce a helper when it removes more total code and concepts than it introduces
- if the branch becomes materially larger, do another pass focused only on deletion and inlining

## Assertion Policy

- forbidden: `as unknown as`, `as any`, broad structural casts to force compatibility
- allowed: `as const` for literal narrowing
- rare escape hatches must be documented inline with a concrete reason

## State Inference Policy

- derive from strongest source first:
  - persisted/server/DB truth
  - route/query params
  - schema-validated payloads
  - local transient UI state
- avoid storing derivable values (counts, flags, filters, status labels) as mutable state
- when state must exist, store minimal primitives and derive the rest
- mirrored state is only allowed with explicit justification (performance or lifecycle boundary)

## Boundary Contract Policy

- parse external input once at the boundary (query/body/headers/events/webhooks)
- pass inferred typed payloads inward; do not re-parse/re-map at each layer
- keep boundary schema close to endpoint/adapter and shared only when reused

## Verification Matrix (Required in Deep Mode)

Map changed files to required test layers:
- local utility/component logic -> unit
- API handlers/data access/boundary parsing -> integration
- queue/workflow/stream/state lifecycle changes -> integration + e2e
- auth/billing/permission/routing behavior -> integration + e2e

## Fast Discovery Pass

Before refactoring, run quick scans:
- duplicate candidates: repeated function names or repeated logic blocks
- assertion hotspots: `as`, `as unknown as`, broad casts
- schema drift: hand-written interfaces near existing Zod/SDK/Drizzle types
- mirrored state: watchers that only assign one variable to another

## Quality Gate

After code changes (non-markdown), run:
- format/fmt
- lint
- typecheck
- unit tests
- integration tests
- e2e tests

If any layer is blocked by environment, record the exact blocker and still run all remaining layers.

## Desloppify Failure Modes

Treat the pass as failing its goal if any of these are true:
- the branch adds more helpers/facades than it deletes
- net LOC increases without a narrow, concrete boundary-safety justification
- code becomes more reusable but not simpler
- local readability gets worse because logic moved into generic utilities
- the result is "cleaner architecture" but not more straightforward code

## Output Checklist

Report:
1. what was deleted/replaced
2. where assertions were removed
3. net line-count impact
4. if net LOC increased, explain exactly why and what compression pass was attempted
5. duplicate helpers/functions merged or removed
6. state that is now inferred instead of mirrored
7. mode used (`Core` or `Deep`) and why
8. invariants checked and how they were validated (required in Deep mode)
9. QA results and any environment blockers
