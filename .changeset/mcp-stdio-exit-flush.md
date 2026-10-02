---
"@databuddy/sdk": patch
---

`trackMcp` now sends pending MCP calls when the process exits on its own, so stdio servers no longer lose the calls made in the last second before the client disconnects.
