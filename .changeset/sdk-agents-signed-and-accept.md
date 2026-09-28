---
"@databuddy/sdk": patch
---

`trackAgents` now reports agent browsers that send a regular Chrome user agent but sign their requests with a `Signature-Agent` header, such as ChatGPT agent, and sends the request's `Accept` header so you can see which agents ask for markdown. Clients that aren't browsers and ask for markdown first are reported too, so AI tools with generic user agents show up as unidentified agents. The user agent, `Accept` and referrer are capped to the lengths Databuddy accepts, so an unusually long user agent no longer drops the request. `trackAgents` never throws or rejects, even on a malformed URL or in a runtime without `fetch`, and the drop-in `proxy` works when the runtime passes no `waitUntil`, so tracking can never break a request or crash a Node server.
