---
"@databuddy/sdk": minor
---

`trackMcp` takes a `waitUntil` option, so serverless MCP servers send each call before the function stops: pass `waitUntil` from `@vercel/functions`, or `ctx.waitUntil.bind(ctx)` on Cloudflare Workers. Long tool names, client and server names and versions, session IDs and user agents are cut to Databuddy's limits instead of getting the whole batch rejected. JSON error bodies are unwrapped to their `message` before the 512 character cut, so long JSON errors no longer arrive as broken fragments. Stdio servers on `@modelcontextprotocol/server` 2.x name clients from the per-request `clientInfo` sent on the 2026-07-28 protocol. Calls a client runs as a background task are no longer recorded, so they stop showing up as instant successes, and calls that ask the client for more input are recorded once, with their final result. With `debug: true`, `trackMcp` warns when it gets a server it can't track.
