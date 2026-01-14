---
title: 'Database index optimization'
category: 'Enhancement'
createdAt: '2026-01-15'
---

- Added indexes on foreign key columns for improved join performance
- Added index on `organization.logo` column for sorting and filtering
- Removed unused indexes to reduce database overhead
- Dropped `flag_schedules` table and related enum
