---
"@databuddy/sdk": patch
---

`trackMcp` now records an error code for failed MCP tool calls, so the MCP page can group failures by cause. Databuddy reads the code from JSON error bodies (`{"error": {"code": "not_found", "message": "..."}}`) and MCP protocol errors such as `invalid_params`, and `McpToolCall` gains `errorCode`, which carries the `code` or name of an error a low-level `Server` handler throws. Calls the client cancels or times out are recorded with the code `cancelled`. Error text is sent as-is, up to 4096 characters, so Databuddy can extract the message; JSON error bodies longer than that arrive cut and are stored as raw text, without the code inside them. A URL elicitation (`-32042`) is no longer recorded as a failed call; the client's retry is recorded instead. With `debug: true`, `trackMcp` also warns when recording a call fails, for example when `beforeSend` throws.
