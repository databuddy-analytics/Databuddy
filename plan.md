## Implementation Plan: Uptime Alarm Integration (Issue #268)

### Architecture Summary

The integration point is `apps/uptime/src/uptime-transition-emails.ts`. It already detects status transitions (down/recovered) and sends emails. The alarms system (`packages/rpc/src/routers/alarms.ts`) has a fully working `NotificationClient` dispatch pattern. The `packages/notifications/src/templates/uptime.ts` already exports `buildUptimeNotificationPayload` for exactly this purpose. The wiring simply needs to query alarms for the relevant `websiteId` on transition and fire them.

### Files to Modify

**1. `apps/uptime/src/uptime-transition-emails.ts`**

Add a new exported function `sendUptimeAlarmNotificationsIfNeeded` that:
- Takes the same `{ schedule, data, previousStatus }` shape as `sendUptimeTransitionEmailsIfNeeded`
- Resolves the transition kind via the existing `resolveTransitionKind` helper
- If a transition occurred, queries the `alarms` table for all enabled alarms where `websiteId = schedule.websiteId` AND `triggerType = "uptime"`
- For each alarm, fetches its `destinations` (eager-loaded via Drizzle `with: { destinations: true }`)
- Builds a `NotificationClient` per alarm using the same per-destination config-mapping logic as the `test` handler in `alarms.ts`
- Calls `client.send(buildUptimeNotificationPayload({ kind, siteLabel, url, checkedAt, ... }), { channels })`
- Wraps everything in try/catch, calls `captureError` on failure

New imports needed:
```ts
import { alarms, alarmDestinations } from "@databuddy/db/schema";
import { and, eq, isNotNull } from "@databuddy/db";
import { NotificationClient } from "@databuddy/notifications";
import type { NotificationChannel } from "@databuddy/notifications";
import { buildUptimeNotificationPayload } from "@databuddy/notifications/templates/uptime";
```

**2. `apps/uptime/src/index.ts`**

After the existing call to `sendUptimeTransitionEmailsIfNeeded`, add:
```ts
await sendUptimeAlarmNotificationsIfNeeded({
  schedule: schedule.data,
  data: result.data,
  previousStatus,
});
```

### No Schema Changes Required

The `alarms` table already has `websiteId` (nullable FK to `websites`) and `triggerType` (with `"uptime"` as a valid value). The `alarmDestinations` table is already related. No migrations needed.

### Trigger Logic

```
on every uptime check:
  previousStatus = last status from ClickHouse
  currentStatus  = result of this check
  if (prev=DOWN, curr=UP)   → kind = "recovered"
  if (prev≠DOWN, curr=DOWN) → kind = "down"
  otherwise → no-op

on transition:
  query alarms WHERE websiteId = schedule.websiteId
               AND enabled = true
               AND triggerType = "uptime"
  for each alarm → build NotificationClient from destinations → send
```

### Critical Files

- `apps/uptime/src/uptime-transition-emails.ts` — add `sendUptimeAlarmNotificationsIfNeeded`
- `apps/uptime/src/index.ts` — wire call after email transition handler
- `packages/notifications/src/templates/uptime.ts` — payload builder (already exists)
- `packages/rpc/src/routers/alarms.ts` — reference for NotificationClient pattern
- `packages/db/src/drizzle/schema.ts` — alarms schema (no changes needed)
