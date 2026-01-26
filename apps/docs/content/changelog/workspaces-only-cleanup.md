---
title: 'Workspaces-only architecture cleanup'
category: 'Enhancement'
createdAt: '2026-01-18'
---

- Removed `userId` fallback logic for website ownership across all routers
- Websites now require `organizationId` (workspace membership) for access
- Simplified `WebsiteService` methods to only use `organizationId` filtering
- Updated `getAccessibleWebsites` to fetch from user's workspace memberships
- Removed personal website deletion from user `beforeDelete` hook
- Cleaned up `getBillingOwnerFromWebsite` to only resolve workspace owners
- Updated uptime, insights, annotations routers to use workspace-based queries
- Removed unused `isNull`, `or`, `and` imports from multiple files
