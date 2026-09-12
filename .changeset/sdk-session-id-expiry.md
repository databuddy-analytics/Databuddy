---
"@databuddy/sdk": patch
---

`getSessionId` now respects the tracker's 30-minute inactivity window: it returns `null` when the stored session has no timestamp or the timestamp is older than 30 minutes, instead of handing back a session id the tracker has already rotated. `getTrackingIds` and `getTrackingParams` inherit the same behavior. URL params still take priority.
