---
"@databuddy/sdk": patch
---

`getAnonymousId` and `getSessionId` now return `null` instead of throwing when `localStorage` or `sessionStorage` access raises a `DOMException`. Follows the same try/catch pattern already used by `getProfileId`. URL params continue to take priority without touching storage.
