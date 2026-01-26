---
title: 'Usage limit alert emails'
category: 'Feature'
createdAt: '2026-01-23'
---

- Added webhook endpoint at `/webhooks/autumn` to receive Autumn billing events
- Created usage limit email template for notifying users when they reach their limits
- Added `usage_alert_log` database table to track sent alerts and prevent duplicates
- Implemented 7-day cooldown period to avoid spamming users with multiple alerts
- Added Svix signature verification for webhook security
- Organized webhooks into industry-standard folder structure (`routes/webhooks/`)
