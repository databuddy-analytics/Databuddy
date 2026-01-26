---
title: 'Workspace authorization system'
category: 'Feature'
createdAt: '2026-01-18'
---

- Added `withWorkspace` helper for type-safe permission checking across resources
- Added `withWebsite` helper that fetches website and validates permissions in one call
- Integrated with better-auth's permission system for `link`, `llm`, `website`, `organization`, `subscription` resources
- Permission types are now derived from single source of truth in `permissions.ts`
- Added `link` and `llm` permissions to all role definitions (viewer, member, admin, owner)
- Migrated `links.ts` router to use new `withWorkspace` pattern
- Added convenience wrappers: `withReadWebsite`, `withUpdateWebsite`, `withDeleteWebsite`, `withAnalyticsWebsite`, `withConfigureWebsite`
- Workspace context includes `isPublicAccess` flag for public website handling
- Removed admin bypass from authorization - all users go through better-auth permissions
