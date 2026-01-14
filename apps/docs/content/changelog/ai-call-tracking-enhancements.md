---
title: 'AI call tracking enhancements'
category: 'Enhancement'
createdAt: '2026-01-14'
---

- Added `cache_creation_input_tokens` field to track cache creation token usage
- Added `reasoning_tokens` field to track reasoning token consumption
- Added `web_search_count` field to track web search operations in AI calls
- Added `trace_id` field for request tracing and correlation
- Added `http_status` field to track HTTP response status codes
- Updated ClickHouse schema for `observability.ai_call_spans` table with new fields
- Updated LLM route to map and persist new tracking fields
- Updated event service to handle new fields in AI call spans
