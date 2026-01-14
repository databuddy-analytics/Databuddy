---
title: 'API key authentication for LLM tracking'
category: 'Feature'
createdAt: '2026-01-14'
---

- Added API key authentication to `/llm` route requiring `write:llm` scope
- Created API key verification utility in basket service using keypal
- Added `write:llm` scope to database schema, RPC router, and UI components
- Removed unused API key scopes (admin, otel, custom-sql, experiments, rate limits, etc.)
- Kept only `read:data` and `write:llm` scopes in use
