---
name: databuddy-mcp
description: Use whenever the Databuddy MCP server is available and the user wants their analytics, errors, vitals, insights, comparisons, anomalies, top movers, flags, links, or annotations queried. Covers get_data, ask, capabilities, summarize_insights, compare_metric, top_movers, detect_anomalies, get_schema, list/save/forget memory, and workspace mutations. Not for SDK integration help (use databuddy) or monorepo implementation (use databuddy-internal).
---

# Databuddy MCP

The MCP server ships its own session-start `instructions` and a `databuddy://guide` resource — those are the canonical reference. This skill exists so Claude Code surfaces the routing context up front instead of waiting for the MCP `initialize` flow.

## Quick routing

- Known shape (top pages, recent errors, summary metrics) → `get_data`. Batch 2-10 with `queries[]`.
- "What changed", anomalies, top movers, compare last week → `summarize_insights` / `compare_metric` / `top_movers` / `detect_anomalies` (faster and cheaper than `ask`).
- Open-ended question → `ask`. Reuse `conversationId`.
- Discovery → `capabilities` (catalog) or `get_schema` (columns).

## Conventions

- Website: pass `websiteId`, `websiteName`, or `websiteDomain` — any one works.
- Dates: a `preset` OR both `from`+`to` (`YYYY-MM-DD`). Defaults to `last_7d`. Don't pass only one of `from`/`to`.
- Filters: `field` is the ClickHouse column name. Errors list allowed fields and suggest matches on typos.
- Mutations (flags, links, folders, memory): preview with `confirmed=false`, get user approval, then `confirmed=true`.

## For more depth

Fetch the `databuddy://guide` MCP resource. That's the single source of truth — including the error-table footguns (`message` vs `error_type`) and the custom-events filter shape.
