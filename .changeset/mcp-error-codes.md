---
"@databuddy/sdk": minor
---

`trackMcp` now records an error code for failed MCP tool calls, so the MCP page can group failures by cause. The code comes from a JSON error body (`{"error": {"code": "not_found", "message": "..."}}`), from MCP protocol errors such as `invalid_params` for bad arguments or an unknown tool, or from the `code` or name of an error a low-level `Server` handler throws. `McpToolCall` gains `errorCode`, which `beforeSend` can read or remove, and `MCP error -32602:` prefixes are stripped from messages.
