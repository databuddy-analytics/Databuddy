---
name: databuddy-mcp
description: Use whenever the Databuddy MCP server is available and the user wants analytics, errors, vitals, investigations, flags, links, annotations, funnels, or goals queried or changed. Covers get_data, capabilities, get_schema, the investigation lifecycle, and workspace mutations. Not for SDK integration help (use databuddy) or monorepo implementation (use databuddy-internal).
---

# Databuddy MCP

The MCP server's session-start instructions, live `tools/list`, and `databuddy://guide` resource are canonical. Do not rely on a static tool catalog.

## Quick routing

- Known shape (top pages, recent errors, summary metrics) → `get_data`. Batch 2-10 with `queries[]`.
- Existing issue or change → `list_investigations`, then `get_investigation` for its evidence and history.
- User context for a case → `reply_to_investigation`. This resumes the same durable investigation.
- Queued/running reply → poll `get_investigation`; retry with the same `replyId`, never a new one.
- Ad hoc comparison → batch the current and comparison windows in `get_data`.
- Discovery → `capabilities` (catalog) or `get_schema` (columns).

## Conventions

- Website: pass `websiteId`, `websiteName`, or `websiteDomain` — any one works.
- Dates: a `preset` OR both `from`+`to` (`YYYY-MM-DD`). Defaults to `last_7d`. Don't pass only one of `from`/`to`.
- Filters: `field` is the ClickHouse column name. Errors list allowed fields and suggest matches on typos.
- Mutations follow each tool's confirmation metadata and required API-key scope.

## For more depth

Fetch `databuddy://guide` for query conventions and investigation behavior. Use live tool schemas for exact inputs.
