export const GUIDE_URI = "databuddy://guide";

export const MCP_INSTRUCTIONS = `Databuddy gives agents product analytics and durable investigations.

- Use get_data for current analytics. Batch related queries.
- Use list_insights for published findings. Preserve each returned recommendation exactly; if it is null, do not add advice.
- Use list_investigations to find cases, then get_investigation for evidence and history.
- Use reply_to_investigation when a user answers a case's question or adds missing context. This resumes the same investigation.
- After a queued reply, poll get_investigation and reuse the same replyId on retries.
- Use capabilities only when you need to discover query types, and get_schema only when a field is uncertain.
- Every website tool accepts websiteId, websiteName, or websiteDomain.
- Use either a date preset or both from and to (YYYY-MM-DD).
- Never invent a metric, cause, or action that the returned evidence does not support.`;

export const GUIDE_MARKDOWN = `# Databuddy MCP guide

## Analytics

Use \`get_data\` for analytics. It can run one query or batch related queries. Prefer small aggregate queries before raw event rows.

- Call \`capabilities\` when you need the query catalog.
- Call \`get_schema\` when a filter or SQL field is uncertain.
- Use either a date preset or both \`from\` and \`to\`.
- Batch current and comparison windows when you need to explain a change.

## Insights

\`list_insights\` returns published findings, including quiet findings that did not need an open investigation. It preserves the evidence-backed recommendation selected when the insight was generated.

Present the returned title, summary, evidence, impact, root cause, and recommendation as existing intelligence. Do not append a new diagnosis, recommendation, checklist, or next step. When \`recommendation\` is null, do not invent one.

## Investigations

Investigations are durable cases, not generated summaries.

1. \`list_investigations\` returns the latest case for each subject.
2. \`get_investigation\` returns its evidence, observations, status, and human replies.
3. \`reply_to_investigation\` adds human context and resumes that same case.

Replies are asynchronous. When a reply is queued or running, poll \`get_investigation\` until its durable status succeeds or fails; do not submit the same context under a new reply ID.

Do not recreate an investigation with ad hoc anomaly math when a durable case already exists. Do not claim a root cause or recommend a fix unless the evidence supports it.

## Mutations

Respect each tool's confirmation metadata and required API-key scopes. Read-only analytics requires \`read:data\`; replying to an investigation requires \`manage:websites\`.
`;
