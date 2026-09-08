# Canonical chat context delivery checks

Run from this checkout with Bun 1.4.1 and frozen dependencies:

```sh
bun install --frozen-lockfile --ignore-scripts
bun run sdk:build
cd packages/ai
bun run test src/ai/mcp/business-context-delivery.test.ts src/ai/mcp/tool-context.test.ts src/ai/mcp/run-agent.test.ts src/lib/business-context.test.ts src/ai/tools/utils/context.test.ts
```

Run the dashboard HTTP pair from `apps/api`:

```sh
bun run test src/routes/agent-business-context.test.ts src/routes/agent-stream-errors.test.ts
```

The fixtures use synthetic organization/site IDs, an inert API-key row, mocked canonical reads and the AI SDK's native `MockLanguageModelV3` transport. They do not need provider credentials, query customer analytics, scrape websites, bill usage or write memory. The package runner isolates Bun test files so transport/auth mocks cannot affect neighboring suites.

Each shared pair uses identical questions with the profile absent and saved, through public ask, stream and trace entry points for Slack, MCP and dashboard sources. The dashboard pair exercises the actual Elysia `/v1/agent/chat` handler, UI-message conversion, context insertion and native streaming SDK. Assertions inspect provider model input, including a unique prepared-before-download event meaning and a priority for first successful downloads over signup volume. Follow-up coverage verifies revision replacement and draft exclusion. Other cases cover absent scope, unauthorized sites, mixed-organization mentions, session identity, read failure, timeout, cancellation and whole-record size limits.

These are delivery checks, not semantic answer-quality scores: the native mock returns a fixed response. They cannot establish that a model correctly uses the meaning, honors exclusions or resists malicious instructions. No live paired model evaluation was run. The existing `apps/insights/src/evals/quality.ts` harness drives investigation-specific outcomes; it does not exercise these chat entry points.

For a subsequent semantic pair using a separately authorized test provider, keep the fixtures/questions fixed and run the public shared trace entry point with synthetic tool responses, billing skipped, memory persistence disabled and a bounded turn deadline. Compare no profile, website background, and background plus team assertions. Check whether the answer distinguishes preparation from download, prioritizes the stated outcome, leaves an unrelated event's meaning unknown, attributes team assertions, and avoids invented measurements. Retain complete failed/interrupted attempts and record tool calls, tokens, latency, unsupported claims and reading effort alongside manual usefulness review. A matched phrase alone is not a correctness score.

Parent integration seam: `formatOrganizationBusinessContext` in `packages/ai/src/lib/organization-business-context.ts` is the single formatter. This slice uses the current `team`/`website` profile contract. After the shared schema adds optional `teamContext` and `mixed`, add the structured team assertions there; keep mixed background conservatively unverified, and keep priority/successDefinition/exclusions separate from measured evidence. Extend the empty-content guard to retain a profile containing only structured team context, and account for its three 2,000-character fields in the output budget. Do not introduce a recalled copy of the canonical profile.

The loader waits at most 1.5 seconds for one canonical read and delivers at most 24,000 characters. Oversized records are omitted intact rather than truncating an exclusion. The canonical service does not expose database cancellation; a timed-out query may finish in the background, but cannot change the current turn or trigger more reads. Website authorization remains a prerequisite; this loader's timeout does not replace the host's authorization or model timeout.
