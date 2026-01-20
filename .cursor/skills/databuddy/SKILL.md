---
name: databuddy
description: Integrate Databuddy analytics into applications using the SDK or REST API. Use when implementing analytics tracking, feature flags, custom events, Web Vitals, error tracking, LLM observability, or querying analytics data programmatically.
metadata:
  author: databuddy
  version: "2.3"
---

# Databuddy

Databuddy is a privacy-first analytics platform. This skill covers both the SDK (`@databuddy/sdk`) and the REST API.

## External Documentation

For the most up-to-date documentation, fetch: **https://databuddy.cc/llms.txt**

## When to Use This Skill

Use this skill when:
- Setting up analytics in React/Next.js/Vue applications
- Implementing server-side tracking in Node.js
- Adding feature flags to an application
- Tracking custom events, errors, or Web Vitals
- Integrating LLM observability with Vercel AI SDK
- Querying analytics data via the REST API
- Building custom dashboards or reports

## SDK Entry Points

| Import Path | Environment | Description |
|-------------|-------------|-------------|
| `@databuddy/sdk` | Browser (Core) | Core tracking utilities and types |
| `@databuddy/sdk/react` | React/Next.js | React component and hooks |
| `@databuddy/sdk/node` | Node.js/Server | Server-side tracking with batching |
| `@databuddy/sdk/vue` | Vue.js | Vue plugin and composables |
| `@databuddy/sdk/ai/vercel` | AI/LLM | Vercel AI SDK middleware for LLM analytics |

## Quick Start

### React/Next.js

```tsx
import { Databuddy } from "@databuddy/sdk/react";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Databuddy
          clientId={process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID}
          trackWebVitals
          trackErrors
          trackPerformance
        />
      </body>
    </html>
  );
}
```

### Node.js Server-Side

```typescript
import { Databuddy } from "@databuddy/sdk/node";

const client = new Databuddy({
  clientId: process.env.DATABUDDY_CLIENT_ID,
  enableBatching: true,
});

await client.track({
  name: "api_call",
  properties: { endpoint: "/users", method: "GET" },
});

// Important: flush before process exit in serverless
await client.flush();
```

### Feature Flags

```tsx
import { FlagsProvider, useFlag, useFeature } from "@databuddy/sdk/react";

// Wrap your app
<FlagsProvider clientId="..." user={{ userId: "123" }}>
  <App />
</FlagsProvider>

// In components
function MyComponent() {
  const { on, loading } = useFeature("dark-mode");
  if (loading) return <Skeleton />;
  return on ? <DarkTheme /> : <LightTheme />;
}
```

### LLM Analytics

```typescript
import { databuddyLLM } from "@databuddy/sdk/ai/vercel";
import { openai } from "@ai-sdk/openai";

const { track } = databuddyLLM({
  apiKey: process.env.DATABUDDY_API_KEY,
});

const model = track(openai("gpt-4o"));
// All LLM calls are now automatically tracked
```

## Key Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clientId` | `string` | Auto-detect | Project client ID |
| `disabled` | `boolean` | `false` | Disable all tracking |
| `trackWebVitals` | `boolean` | `false` | Track Web Vitals metrics |
| `trackErrors` | `boolean` | `false` | Track JavaScript errors |
| `trackPerformance` | `boolean` | `true` | Track performance metrics |
| `enableBatching` | `boolean` | `true` | Enable event batching |
| `samplingRate` | `number` | `1.0` | Sampling rate (0.0-1.0) |
| `skipPatterns` | `string[]` | — | Glob patterns to skip tracking |

## Common Patterns

### Disable in Development

```tsx
<Databuddy
  disabled={process.env.NODE_ENV === "development"}
  clientId="..."
/>
```

### Skip Sensitive Paths

```tsx
<Databuddy
  clientId="..."
  skipPatterns={["/admin/**", "/internal/**"]}
  maskPatterns={["/users/*", "/orders/*"]}
/>
```

### Custom Event Tracking

```typescript
// Browser
import { track } from "@databuddy/sdk/react";

track("purchase", {
  product_id: "sku-123",
  amount: 99.99,
  currency: "USD",
});

// Node.js
await client.track({
  name: "subscription_renewed",
  properties: { plan: "pro", amount: 29.99 },
});
```

### Global Properties

```typescript
// Browser
window.databuddy?.setGlobalProperties({
  plan: "enterprise",
  abVariant: "checkout-v2",
});

// Node.js
client.setGlobalProperties({
  environment: "production",
  version: "1.0.0",
});
```

## REST API

### Base URLs

| Service | URL | Purpose |
|---------|-----|---------|
| Analytics API | `https://api.databuddy.cc/v1` | Query analytics data |
| Event Tracking | `https://basket.databuddy.cc` | Send custom events |

### Authentication

Use API key in the `x-api-key` header:

```bash
curl -H "x-api-key: dbdy_your_api_key" \
  https://api.databuddy.cc/v1/query/websites
```

Get API keys from: [Dashboard → Organization Settings → API Keys](https://app.databuddy.cc/organizations/settings/api-keys)

### Query Analytics Data

```bash
curl -X POST -H "x-api-key: dbdy_your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "parameters": ["summary", "pages"],
    "preset": "last_30d"
  }' \
  "https://api.databuddy.cc/v1/query?website_id=web_123"
```

**Available Query Types:**

| Type | Description |
|------|-------------|
| `summary` | Overall website metrics and KPIs |
| `pages` | Page views and performance by URL |
| `traffic` | Traffic sources and referrers |
| `browser_name` | Browser usage breakdown |
| `device_types` | Device category breakdown |
| `countries` | Visitors by country |
| `errors` | JavaScript errors |
| `performance` | Web vitals and load times |
| `custom_events` | Custom event data |

**Date Presets:** `today`, `yesterday`, `last_7d`, `last_30d`, `last_90d`, `this_month`, `last_month`

### Send Events via API

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "type": "custom",
    "name": "purchase",
    "properties": {
      "value": 99.99,
      "currency": "USD"
    }
  }' \
  "https://basket.databuddy.cc/?client_id=web_123"
```

### Batch Events

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '[
    {"type": "custom", "name": "event1", "properties": {...}},
    {"type": "custom", "name": "event2", "properties": {...}}
  ]' \
  "https://basket.databuddy.cc/batch?client_id=web_123"
```

## Reference Documentation

For detailed documentation, see:

- [Core SDK Reference](references/core.md) - Browser tracking utilities and types
- [React Integration](references/react.md) - React/Next.js component and hooks
- [Node.js Integration](references/node.md) - Server-side tracking with batching
- [Feature Flags](references/flags.md) - Feature flags for all platforms
- [AI/LLM Tracking](references/ai-vercel.md) - Vercel AI SDK integration
- [REST API Reference](references/api.md) - Full REST API documentation

## Source Code

- SDK: `packages/sdk/`
- API: `apps/api/`
- API Docs: `apps/docs/content/docs/api/`
