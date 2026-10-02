---
"@databuddy/sdk": minor
---

Adds `@databuddy/sdk/mcp` for MCP server analytics. `trackMcp(server)` records every tool call AI clients make, with the tool, error, duration, how much text it returned, client, server and session; arguments and results are never sent. It needs only `DATABUDDY_API_KEY`, links calls to your website when a Databuddy website ID is set, and labels them with `VERCEL_ENV` or `NODE_ENV`. Works with `McpServer` and the low-level `Server` from `@modelcontextprotocol/sdk` 1.x and `@modelcontextprotocol/server` 2.x, never throws or changes what the client receives, sends in background batches, and logs once to stderr if Databuddy rejects the calls. `beforeSend` edits or drops calls, and `flushMcp()` sends the last batch on serverless platforms.
