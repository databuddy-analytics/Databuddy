# Databuddy Agent Skills - References

This document provides additional reference material for the Databuddy agent skills.

## Quick Navigation

| Topic | File |
|-------|------|
| SDK Configuration | `SKILL.md` |
| Tracker Script | `tracker.md` |
| Integration Examples | `integration.md` |
| Cache Layer | `cache.md` |
| Notifications | `notifications.md` |

## databuddy-tracker

### Plain HTML Integration

For simple HTML pages without a framework:

```html
<script
    defer
    data-client-id="YOUR_CLIENT_ID"
    src="https://cdn.databuddy.cc/databuddy.js"
></script>
```

### Debug Mode

```javascript
window.databuddyDebug = true;
```

### Available Methods

```typescript
window.databuddy.track('event_name', {
    property: 'value',
    timestamp: new Date().toISOString(),
});
```

## databuddy-integration

### Full-Stack Next.js Example

```tsx
// app/layout.tsx
import { Databuddy } from '@databuddy/sdk/react';

export default function RootLayout({ children }) {
    return (
        <html lang="en">
            <head />
            <Databuddy
                clientId={process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID!}
                trackPerformance
                trackWebVitals
                trackErrors
                enableBatching
                batchSize={20}
            />
            <body>{children}</body>
        </html>
    );
}

// lib/analytics.ts
export function trackPageView(path: string) {
    window.databuddy?.track('page_view', {
        path,
        referrer: document.referrer,
    });
}
```

### Vite + TanStack Start Example

```tsx
// src/routes/__root.tsx
import { Databuddy } from '@databuddy/sdk/react';

export const Route = createRootRouteWithContext()({
    component: () => (
        <html lang="en">
            <Databuddy
                clientId={import.meta.env.VITE_DATABUDDY_CLIENT_ID!}
                trackHashChanges
                trackAttributes
                trackOutgoingLinks
                trackInteractions
                trackScrollDepth
                trackWebVitals
                trackErrors
            />
            {/* app content */}
        </html>
    ),
});
```

## databuddy-cache

### Installation

```bash
bun add @databuddy/cache drizzle-orm
```

### Basic Setup

```typescript
import Redis from "ioredis";
import { drizzle } from "drizzle-orm/node-postgres";
import { RedisDrizzleCache } from "@databuddy/cache";

const redis = new Redis(process.env.REDIS_URL!);

const cache = new RedisDrizzleCache({
    redis,
    defaultTtl: 300, // 5 minutes
    strategy: "all",
    namespace: "analytics:dashboard"
});

export const db = drizzle(process.env.DATABASE_URL!, {
    schema,
    cache
});
```

### Configuration

```typescript
type RedisCacheConfig = {
    redis: RedisAdapter;
    defaultTtl?: number;        // Default: 300 (5 minutes)
    strategy?: "explicit" | "all";  // Default: "all"
    namespace?: string;         // Default: "drizzle"
};
```

## databuddy-notifications

### Installation

```json
{
    "dependencies": {
        "@databuddy/notifications": "workspace:*"
    }
}
```

### Quick Setup (Slack Example)

```typescript
import { sendSlackWebhook } from "@databuddy/notifications";

await sendSlackWebhook(process.env.SLACK_WEBHOOK_URL!, {
    title: "Alert",
    message: "High error rate detected!",
    priority: "high",
    metadata: { errorRate: "5.2%" },
}, {
    channel: "#alerts",
    username: "Databuddy Bot",
});
```

### Advanced Client Setup

```typescript
import { NotificationClient } from "@databuddy/notifications";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const client = new NotificationClient({
    slack: {
        webhookUrl: process.env.SLACK_WEBHOOK_URL!,
        channel: "#alerts",
        username: "Databuddy",
    },
    discord: {
        webhookUrl: process.env.DISCORD_WEBHOOK_URL!,
        username: "Databuddy Bot",
    },
    email: {
        sendEmail: async (payload) => {
            return resend.emails.send({
                from: "noreply@databuddy.cc",
                ...payload,
            });
        },
        from: "noreply@databuddy.cc",
    },
    defaultChannels: ["slack", "discord"],
});

// Send to all default channels
await client.send({
    title: "Traffic Spike",
    message: "300% increase in traffic detected",
    priority: "high",
});
```

### Priority Levels

| Priority | Color | Use Case |
|----------|-------|----------|
| `urgent` | Red | Critical alerts, system failures |
| `high` | Orange | Warnings, elevated error rates |
| `normal` | Green | Informational, milestones |
| `low` | Blue | Debug info, verbose logs |

## Environment Variables Reference

### Required

| Variable | Description |
|----------|-------------|
| `VITE_DATABUDDY_CLIENT_ID` | Client ID for Vite/React apps |
| `NEXT_PUBLIC_DATABUDDY_CLIENT_ID` | Client ID for Next.js apps |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |

### Optional

| Variable | Description |
|----------|-------------|
| `DATABUDDY_CLIENT_SECRET` | Server-side client secret |
| `SLACK_WEBHOOK_URL` | Slack webhook for alerts |
| `DISCORD_WEBHOOK_URL` | Discord webhook for alerts |
| `RESEND_API_KEY` | Resend API key for emails |
| `CUSTOM_WEBHOOK_URL` | Custom webhook URL |
| `WEBHOOK_TOKEN` | Custom webhook auth token |

## Common Patterns

### Error Tracking with Context

```typescript
window.addEventListener('error', (event) => {
    window.databuddy?.track('javascript_error', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        user_agent: navigator.userAgent,
        url: window.location.href,
    });
});

window.addEventListener('unhandledrejection', (event) => {
    window.databuddy?.track('unhandled_promise_rejection', {
        reason: event.reason?.toString() || 'Unknown',
        url: window.location.href,
    });
});
```

### Scroll Depth Tracking

```typescript
function trackScrollDepth() {
    const milestones = [25, 50, 75, 100];
    const tracked = new Set<number>();

    const handleScroll = () => {
        const scrollPercent = Math.round(
            (window.scrollY + window.innerHeight) / document.body.scrollHeight * 100
        );

        milestones.forEach((milestone) => {
            if (scrollPercent >= milestone && !tracked.has(milestone)) {
                tracked.add(milestone);
                window.databuddy?.track('scroll_depth', {
                    percentage: milestone,
                    path: window.location.pathname,
                });
            }
        });
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
}
```

### Page View Tracking

```typescript
// For SPAs with client-side navigation
function trackPageView() {
    window.databuddy?.track('page_view', {
        path: window.location.pathname,
        referrer: document.referrer,
        title: document.title,
        search: window.location.search,
    });
}

// Call on route changes
trackPageView();
```

## Troubleshooting

### Events Not Appearing in Dashboard

1. Check browser console for errors
2. Verify client ID is correct
3. Ensure `disabled` is not set to `true`
4. Check network tab for failed requests

### TypeScript Errors

Add to your `env.d.ts`:

```typescript
declare interface Window {
    databuddy?: {
        track: (event: string, properties?: Record<string, unknown>) => void;
    };
}
```

### CORS Errors

Ensure your domain is allowlisted in the Databuddy dashboard under Project Settings > Security.

## Links

- Documentation: https://www.databuddy.cc/docs
- Dashboard: https://app.databuddy.cc
- GitHub: https://github.com/databuddy-analytics/Databuddy
- Discord: https://discord.gg/JTk7a38tCZ
