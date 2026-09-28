---
"@databuddy/sdk": patch
---

`trackAgents` now reports agent browsers that send a regular Chrome user agent but sign their requests with a `Signature-Agent` header, such as ChatGPT agent, and sends the request's `Accept` header so you can see which agents ask for markdown. The user agent, `Accept` and referrer are capped to the lengths Databuddy accepts, so an unusually long user agent no longer drops the request.
