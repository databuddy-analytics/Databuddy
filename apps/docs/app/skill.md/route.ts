export const revalidate = false;

const SKILL = `---
name: databuddy
description: Privacy-first analytics SDK. Browser tracking, server-side events, feature flags, and REST API.
version: 2.4.0
---

# Databuddy SDK (v2.4)

Privacy-first analytics SDK. Covers browser tracking, server-side events, feature flags, and a REST API.

## External Documentation

- Full docs: https://www.databuddy.cc/llms-full.txt
- Docs index: https://www.databuddy.cc/llms.txt
- Framework guides: https://www.databuddy.cc/docs/Integrations

> There is **no** \`@databuddy/sdk/ai/vercel\` entry point. AI/LLM tracking is not part of the SDK.

## SDK Entry Points

| Import | Environment | Description |
|--------|-------------|-------------|
| \`@databuddy/sdk\` | Browser (Core) | Tracking utilities, types, script injection |
| \`@databuddy/sdk/react\` | React/Next.js | \`<Databuddy />\` component, flags hooks, core re-exports |
| \`@databuddy/sdk/node\` | Node.js/Server | \`Databuddy\` class (API-key auth), \`ServerFlagsManager\` |
| \`@databuddy/sdk/vue\` | Vue 3 | \`<Databuddy />\` component, flags plugin and composables |

## Quick Start

### React / Next.js

\`\`\`tsx
import { Databuddy } from "@databuddy/sdk/react";

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        {children}
        <Databuddy trackWebVitals trackErrors />
      </body>
    </html>
  );
}
\`\`\`

\`clientId\` is auto-detected from \`NEXT_PUBLIC_DATABUDDY_CLIENT_ID\`. Pass it explicitly if needed.

### Script Tag (any website)

\`\`\`html
<script
  src="https://cdn.databuddy.cc/databuddy.js"
  data-client-id="your-client-id"
  data-track-performance
  data-track-web-vitals
  data-track-errors
  async
></script>
\`\`\`

### Node.js (Server-Side)

\`\`\`typescript
import { Databuddy } from "@databuddy/sdk/node";

const client = new Databuddy({
  apiKey: process.env.DATABUDDY_API_KEY!, // required, format: dbdy_xxx
});

await client.track({
  name: "api_call",
  properties: { endpoint: "/users", method: "GET" },
});

await client.flush();
\`\`\`

### Feature Flags (React)

\`\`\`tsx
import { FlagsProvider, useFlag } from "@databuddy/sdk/react";

<FlagsProvider clientId="..." user={{ userId: "123" }}>
  <App />
</FlagsProvider>

function MyComponent() {
  const { on, loading } = useFlag("dark-mode");
  if (loading) return <Skeleton />;
  return on ? <DarkTheme /> : <LightTheme />;
}
\`\`\`

## Custom Event Tracking

\`\`\`typescript
import { track } from "@databuddy/sdk/react";

track("purchase", { product_id: "sku-123", amount: 99.99 });
\`\`\`

### Event Design Rules

- Use \`snake_case\` past-tense names: \`signup_completed\`, \`checkout_started\`
- Track decisions, milestones, outcomes -- not every UI interaction
- Properties must be low-cardinality: \`plan\`, \`source\`, \`method\`, \`status\`
- Never track PII (emails, names, tokens) or high-cardinality values (URLs, IDs)
- Prefer one event with properties over many near-duplicate events

\`\`\`typescript
// Good
track("feature_used", { feature: "export", format: "csv" });

// Bad
track("csv_export_clicked");
\`\`\`

### Declarative Tracking (HTML data attributes)

Requires \`trackAttributes: true\`:

\`\`\`html
<button data-track="cta_clicked" data-location="hero">Get Started</button>
\`\`\`

## Browser Config (DatabuddyConfig)

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| \`clientId\` | \`string\` | Auto-detect | Project client ID |
| \`disabled\` | \`boolean\` | \`false\` | Disable all tracking |
| \`trackPerformance\` | \`boolean\` | \`true\` | Page load timing |
| \`trackWebVitals\` | \`boolean\` | \`false\` | Core Web Vitals (LCP, FID, CLS) |
| \`trackErrors\` | \`boolean\` | \`false\` | JavaScript error tracking |
| \`trackInteractions\` | \`boolean\` | \`false\` | User interactions |
| \`trackOutgoingLinks\` | \`boolean\` | \`false\` | External link clicks |
| \`trackHashChanges\` | \`boolean\` | \`false\` | URL hash changes |
| \`trackAttributes\` | \`boolean\` | \`false\` | \`data-*\` attributes |
| \`enableBatching\` | \`boolean\` | \`true\` | Batch events before sending |
| \`samplingRate\` | \`number\` | \`1.0\` | Sampling rate (0.0-1.0) |
| \`skipPatterns\` | \`string[]\` | -- | Glob patterns to skip tracking |
| \`maskPatterns\` | \`string[]\` | -- | Glob patterns to mask paths |
| \`debug\` | \`boolean\` | \`false\` | Console debug logging |

## Node.js Config

\`\`\`typescript
interface DatabuddyConfig {
  apiKey: string;              // Required. Format: dbdy_xxx
  apiUrl?: string;             // Default: "https://basket.databuddy.cc"
  websiteId?: string;          // Default website scope
  namespace?: string;          // Default namespace (e.g., "billing")
  source?: string;             // Default source (e.g., "backend")
  enableBatching?: boolean;    // Default: true
  batchSize?: number;          // Default: 10, max: 100
  enableDeduplication?: boolean; // Default: true (by eventId)
  middleware?: Middleware[];    // Event transformers
}
\`\`\`

## Feature Flags Config

\`\`\`typescript
interface FlagsConfig {
  clientId: string;
  autoFetch?: boolean;      // Default: true (browser), false (server)
  cacheTtl?: number;        // Default: 60000ms
  staleTime?: number;       // Default: cacheTtl / 2
  environment?: string;
  defaults?: Record<string, boolean | string | number>;
  user?: { userId?: string; email?: string; organizationId?: string; properties?: Record<string, unknown> };
}
\`\`\`

## REST API

### Event Tracking

**POST** \`https://basket.databuddy.cc/track\`

Auth: \`Authorization: Bearer $DATABUDDY_API_KEY\` (scope: \`track:events\`)

\`\`\`bash
curl -X POST https://basket.databuddy.cc/track \\
  -H "Authorization: Bearer $DATABUDDY_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"name": "purchase", "properties": {"amount": 99.99}}'
\`\`\`

Accepts single event or array (max 100). Max payload: 1MB single, 5MB batch.

### Feature Flags

**Base URL:** \`https://api.databuddy.cc/public/v1/flags\`

| Endpoint | Method | Description |
|----------|--------|-------------|
| \`/evaluate?key=X&clientId=Y\` | GET | Evaluate a single flag |
| \`/bulk?clientId=Y\` | GET | Evaluate all flags (or \`&keys=a,b\`) |
| \`/definitions?clientId=Y\` | GET | List flag definitions |

## Key URLs

| Resource | URL |
|----------|-----|
| Dashboard | https://app.databuddy.cc |
| API | https://api.databuddy.cc |
| Event ingestion | https://basket.databuddy.cc |
| CDN script | https://cdn.databuddy.cc/databuddy.js |
| Docs | https://www.databuddy.cc/docs |

## Common Pitfalls

- Do NOT put client ID in server-only env vars. Use \`NEXT_PUBLIC_DATABUDDY_CLIENT_ID\`.
- Do NOT add \`<Databuddy />\` in multiple layouts. One at the root is enough.
- The script auto-tracks SPA route changes. Do NOT manually call \`track\` for pageviews.
- \`track()\` is client-side only. Do NOT call it in server components or API routes.
- For server-side tracking, use \`@databuddy/sdk/node\` with an API key.
- Always \`await client.flush()\` before process exit in serverless environments.
- Never hardcode API keys. Use \`process.env.DATABUDDY_API_KEY\`.

## Supported Frameworks

React, Next.js, Vue, Svelte, SvelteKit, Angular, Shopify, WordPress, Webflow, Wix, Squarespace, Hugo, Jekyll, Framer, Bubble, Mintlify, Laravel, Google Tag Manager.
`;

export async function GET() {
	return new Response(SKILL, {
		headers: {
			"Content-Type": "text/markdown; charset=utf-8",
			"Cache-Control": "public, max-age=3600, must-revalidate",
		},
	});
}
