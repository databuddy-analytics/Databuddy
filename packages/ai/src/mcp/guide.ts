export const GUIDE_URI = "databuddy://guide";

export const MCP_INSTRUCTIONS = `Databuddy: product analytics, errors, web vitals, feature flags, links.

Pick the right tool:
- get_data — typed analytics queries (top_pages, recent_errors, errors_by_type, …). Batch 2-10 with queries[].
- summarize_insights / compare_metric / top_movers / detect_anomalies — pre-built insight wrappers; prefer over ask for known shapes.
- ask — open-ended NL question. Slower; only registered when the server has an AI gateway configured. Reuse conversationId for follow-ups.
- capabilities — tool catalog and query types (filter by category to slim).
- get_schema — ClickHouse columns. Use when a field name is uncertain.

Conventions:
- Website ref: any tool that needs a website accepts websiteId, websiteName, or websiteDomain — pass one.
- Dates: a preset OR both from+to (YYYY-MM-DD). Defaults to last_7d. Passing only one of from/to is rejected.
- Filters: 'field' is the column name in the schema. Errors list allowed fields and suggest close matches on typos.
- Errors: errors_by_type groups by JS class (TypeError, …); error_types groups by error message. Both include count + affected users.
- Mutations (create/update/delete flag, link, folder, memory): preview with confirmed=false, then confirm with the user before confirmed=true.

Workflow shortcuts (MCP prompts):
- weekly_report — structured weekly digest for a website.
- triage_errors — error_summary → errors_by_type → errors_by_page → recent_errors, prioritized by user impact.
- funnel_health — list_funnels + per-step analytics, surfaces biggest drop-offs.
- flag_rollout_check — audit active flags for stale or risky rollouts.

For a longer reference with workflow tips and known footguns, read the ${GUIDE_URI} resource.`;

export const GUIDE_MARKDOWN = `# Databuddy MCP guide

A longer reference for callers who want more than the session-start instructions.

## Pick the tool by intent

- **Known shape** ("top pages last 7d", "recent errors") → \`get_data\` with a type from \`capabilities\`. Batch 2-10 related queries in one call.
- **Standard insight** ("what changed", "anomalies", "top movers", "compare last week") → \`summarize_insights\` / \`compare_metric\` / \`top_movers\` / \`detect_anomalies\`. Faster and cheaper than \`ask\`.
- **Open-ended question** → \`ask\`. Reuse \`conversationId\` for follow-ups.
- **Discovery** → \`capabilities\` (catalog) or \`get_schema\` (columns). Call once, remember for the session.

## Prompts (slash commands)

User-invoked workflows. Each builds a ready-to-send message; the agent then drives the tool calls.

- \`weekly_report\` — traffic, top pages, top referrers, error health, one item to investigate.
- \`triage_errors\` — error_summary → errors_by_type → errors_by_page → recent_errors for the top class.
- \`funnel_health\` — list_funnels + per-funnel analytics, biggest drop-offs surfaced.
- \`flag_rollout_check\` — list_flags + staleness/risk audit, recommends actions but no mutations.

## Querying

- Dates: a \`preset\` OR both \`from\`+\`to\`. Default is \`last_7d\`. Don't pass only one of \`from\`/\`to\`.
- Filters are by ClickHouse column name. When unsure, peek at \`get_schema\` for the relevant section (\`events\`, \`custom_events\`, \`errors\`, \`vitals\`, \`outgoing\`).
- Token budget: prefer category summaries (\`error_summary\`, \`error_types\`) before pulling raw rows. \`recent_*\` queries default to small limits — keep them small for triage.
- Trust the error messages: unknown types suggest matches; rejected filters list allowed fields; missing dates name the missing field.

## Example calls

\`\`\`json
// Batch the dashboard's basics
get_data {
  websiteDomain: "example.com",
  queries: [
    { type: "summary_metrics", preset: "last_7d" },
    { type: "top_pages", preset: "last_7d", limit: 5 },
    { type: "top_referrers", preset: "last_7d", limit: 5 },
    { type: "error_summary", preset: "last_7d" }
  ]
}

// Find errors containing "Hydration" on the /checkout path
get_data {
  websiteId: "...",
  type: "recent_errors",
  preset: "last_7d",
  limit: 20,
  filters: [
    { field: "message", op: "contains", value: "Hydration" },
    { field: "path", op: "eq", value: "/checkout" }
  ]
}

// Trend a property value across days
get_data {
  websiteDomain: "example.com",
  type: "custom_events_property_top_values",
  preset: "last_30d",
  filters: [
    { field: "event_name", op: "eq", value: "signup_completed" },
    { field: "property_key", op: "eq", value: "plan" }
  ]
}
\`\`\`

## Mutations

Always preview with \`confirmed=false\`, get explicit user approval, then run with \`confirmed=true\`. Applies to flags, links, folders, memory.

## Worth knowing

- Two error-grouping queries with similar names: \`errors_by_type\` groups by JS **class** (\`TypeError\`, …) — use this when triaging. \`error_types\` groups by error **message** string. Both return \`count\` and \`users\`.
- \`error_type\` (filter field) is the JS class. Search error text with a filter on \`message\`.
- Custom events discovery: \`get_data type=custom_events\` enumerates event names with counts. Then filter \`event_name\`, \`property_key\`, \`property_value\` — don't query the raw \`properties\` JSON.
- \`recent_errors\` stack traces are capped at 1500 chars on the server.
- Tool annotations reflect mutation kind: \`readOnlyHint\` for analytics queries, \`destructiveHint\` for delete/uninstall.
- The whole MCP catalog is namespaced — when in doubt, call \`capabilities\` to see what's available.
`;
