---
name: databuddy-sdk
description: Official Databuddy SDK integration guide for React and web analytics. Covers SDK setup, configuration options, custom event tracking, server-side tracking, and framework-specific usage for Next.js, Vite, TanStack Start, and other React frameworks. Based on production Databuddy implementation.
license: MIT
author: Databuddy
version: "2.0.0"
---

# Databuddy SDK Integration

Official SDK documentation for integrating Databuddy analytics into web applications. This skill provides comprehensive guidance for implementing analytics tracking with the @databuddy/sdk package.

## Documentation Sources

- Primary: https://www.databuddy.cc/docs
- Dashboard: https://app.databuddy.cc
- GitHub: https://github.com/databuddy-analytics/Databuddy
- NPM: https://www.npmjs.com/package/@databuddy/sdk

## Installation

```bash
# Bun (recommended)
bun add @databuddy/sdk

# npm
npm install @databuddy/sdk

# yarn
yarn add @databuddy/sdk

# pnpm
pnpm add @databuddy/sdk
```

## Quick Start

### Vite + TanStack Start (Recommended for this repo)

```tsx
import { Databuddy } from '@databuddy/sdk/react';

export default function RootLayout() {
    return (
        <html lang="en">
            <head />
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
            <body>
                <div className="flex min-h-screen flex-col">
                    {/* app content */}
                </div>
            </body>
        </html>
    );
}
```

### Next.js App Router

```tsx
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
                debug={process.env.NODE_ENV === 'development'}
            />
            <body>{children}</body>
        </html>
    );
}
```

## Configuration Options

### Core Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clientId` | string | — | **Required.** Your Databuddy project client ID |
| `clientSecret` | string | — | Server-side only. Never expose in client code |
| `apiUrl` | string | `https://basket.databuddy.cc` | Custom API endpoint |
| `scriptUrl` | string | `https://cdn.databuddy.cc/databuddy.js` | CDN script URL |
| `sdk` | string | `web` | SDK identifier for custom builds |
| `sdkVersion` | string | auto | SDK version (defaults to package version) |
| `disabled` | boolean | `false` | Disable all tracking globally |
| `debug` | boolean | `false` | Enable debug console logging |

### Tracking Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `trackHashChanges` | boolean | `false` | Track URL hash changes as page views |
| `trackAttributes` | boolean | `false` | Track `data-*` attributes on interactive elements |
| `trackOutgoingLinks` | boolean | `false` | Track clicks on external links |
| `trackInteractions` | boolean | `false` | Track user interactions (clicks, hovers) |
| `trackScrollDepth` | boolean | `false` | Track scroll depth milestones (25%, 50%, 75%, 100%) |
| `trackPerformance` | boolean | `true` | Track page load performance metrics |
| `trackWebVitals` | boolean | `false` | Track Core Web Vitals (LCP, FID, CLS, INP, TTFB) |
| `trackErrors` | boolean | `false` | Track JavaScript errors and unhandled promise rejections |
| `ignoreBotDetection` | boolean | `false` | Don't filter out bot traffic |

### Advanced Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `usePixel` | boolean | `false` | Use pixel tracking instead of JavaScript SDK |
| `samplingRate` | number | `1.0` | Traffic sampling rate (0.0 to 1.0) |
| `enableRetries` | boolean | `false` | Retry failed event submissions |
| `maxRetries` | number | `3` | Maximum retry attempts |
| `initialRetryDelay` | number | `500` | Initial retry delay in milliseconds |
| `enableBatching` | boolean | `true` | Batch events to reduce network requests |
| `batchSize` | number | `10` | Events per batch (1 to 50) |
| `batchTimeout` | number | `5000` | Maximum time to wait before sending batch (ms) |
| `skipPatterns` | string[] | [] | Glob patterns for routes to skip |
| `maskPatterns` | string[] | [] | Glob patterns to mask sensitive path segments |
| `filter` | function | — | Custom filter function for events |

## Custom Event Tracking

### Using React Hook

```tsx
import { useDatabuddy } from '@databuddy/sdk/react';

function SignupButton() {
    const databuddy = useDatabuddy();

    const handleClick = () => {
        databuddy.track('button_click', {
            button_id: 'signup',
            page: 'home',
            cta_type: 'primary',
        });
    };

    return <button onClick={handleClick}>Sign Up</button>;
}
```

### Using Window Object (Framework-Agnostic)

```typescript
// Type declarations
declare interface Window {
    databuddy?: {
        track: (event: string, properties?: Record<string, unknown>) => void;
    };
}

// Safe tracking utility
function trackEvent(event: string, properties?: Record<string, unknown>): void {
    try {
        window.databuddy?.track(event, {
            ...properties,
            timestamp: new Date().toISOString(),
            url: window.location.href,
            path: window.location.pathname,
        });
    } catch (error) {
        console.error('[Analytics] Failed to track event:', event, error);
    }
}

// Usage
trackEvent('form_submitted', {
    form_type: 'contact',
    has_email: true,
    has_phone: false,
});
```

### Form Tracking Example

```typescript
// analytics.ts - Comprehensive form tracking utilities

type FormType = 'quote_form' | 'contact_form';

interface FormFieldInfo {
    field: string;
    form: FormType;
    value?: string;
}

// Track form start (first field focus)
export function trackFormStart(form: FormType, source?: string): void {
    window.databuddy?.track('form_started', {
        form,
        source: source || 'direct',
    });
}

// Track individual field focus
export function trackFieldFocus(info: FormFieldInfo): void {
    window.databuddy?.track('form_field_focused', {
        form: info.form,
        field: info.field,
    });
}

// Track field completion
export function trackFieldComplete(info: FormFieldInfo): void {
    window.databuddy?.track('form_field_completed', {
        form: info.form,
        field: info.field,
        has_value: Boolean(info.value?.trim()),
    });
}

// Track form submission
export function trackFormSubmit(form: FormType, properties?: Record<string, unknown>): void {
    window.databuddy?.track('form_submitted', {
        form,
        ...properties,
    });
}

// Track form abandonment
export function trackFormAbandon(form: FormType, completedFields: string[]): void {
    window.databuddy?.track('form_abandoned', {
        form,
        fields_completed: completedFields,
        fields_completed_count: completedFields.length,
    });
}
```

### CTA Tracking Example

```typescript
type CTALocation =
    | 'header'
    | 'hero'
    | 'hero_mobile'
    | 'quote_section'
    | 'cta_banner'
    | 'service_page'
    | 'city_page'
    | 'mobile_sticky'
    | 'footer';

export function trackCTAClick(location: CTALocation, buttonText?: string): void {
    window.databuddy?.track('cta_clicked', {
        location,
        button_text: buttonText || 'Get Free Quote',
        cta_type: 'quote',
    });
}

export function trackPhoneClick(location: CTALocation): void {
    window.databuddy?.track('phone_click', {
        location,
        phone_number: '(248) 561-7790',
    });
}
```

## Environment Variables

### Client-Side (Required)

| Variable | Framework | Example |
|----------|-----------|---------|
| `VITE_DATABUDDY_CLIENT_ID` | Vite, TanStack Start | `c8c135f7-beb6-41d5-9118-a204fd0ba204` |
| `NEXT_PUBLIC_DATABUDDY_CLIENT_ID` | Next.js | `c8c135f7-beb6-41d5-9118-a204fd0ba204` |
| `REACT_APP_DATABUDDY_CLIENT_ID` | CRA | `c8c135f7-beb6-41d5-9118-a204fd0ba204` |

### Type Declarations (Vite)

```typescript
// env.d.ts or vite-env.d.ts
interface ImportMetaEnv {
    readonly VITE_DATABUDDY_CLIENT_ID?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
```

## Server-Side Tracking

For server-side event tracking (e.g., API calls, background jobs):

```typescript
import { DatabuddyClient } from '@databuddy/sdk/server';

const client = new DatabuddyClient({
    clientId: process.env.DATABUDDY_CLIENT_ID!,
    clientSecret: process.env.DATABUDDY_CLIENT_SECRET!,
});

// Track server-side event
await client.track('server_api_call', {
    endpoint: '/users',
    method: 'GET',
    duration_ms: 150,
    status_code: 200,
});
```

**Security Note:** Never expose `clientSecret` in client-side code. Use server-side tracking only in backend code (API routes, server actions, background jobs).

## Framework-Specific Notes

### TanStack Start + Vite

- Use `import.meta.env.VITE_DATABUDDY_CLIENT_ID`
- Place `<Databuddy>` component in root route (`__root.tsx`)
- Component renders on both server and client; SDK handles SSR safely

### Next.js

- Use `process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID`
- Place in `layout.tsx` or `_app.tsx`
- Consider using `disabled={process.env.NODE_ENV === 'development'}` for dev

### React (CRA)

- Use `process.env.REACT_APP_DATABUDDY_CLIENT_ID`
- Place in top-level App component

## Best Practices

1. **Use sampling for high-traffic sites**: `samplingRate: 0.1` for 10% tracking
2. **Exclude admin/sensitive routes**: Use `skipPatterns: ['/admin/**', '/dashboard/**']`
3. **Mask sensitive paths**: Use `maskPatterns: ['/users/:userId']` to obfuscate IDs
4. **Enable batching**: Reduces network overhead significantly
5. **Keep payloads minimal**: Only track what you need for analytics
6. **Use TypeScript**: Prevents runtime errors with type safety
7. **Handle errors gracefully**: Wrap tracking in try/catch

## Common Pitfalls

1. **Exposing clientSecret** - Never include in client-side code
2. **Wrong env var prefix** - Vite uses `VITE_`, Next.js uses `NEXT_PUBLIC_`
3. **Missing type declarations** - Declare `Window.databuddy` for TypeScript
4. **Not disabling in dev** - Can skew analytics data significantly
5. **Large batch sizes** - Keep `batchSize` under 50 for timely data
6. **Tracking too much** - Minimize event payload size
7. **Missing SSR check** - SDK handles this, but verify in custom code

## Related Skills

- `databuddy-tracker` - Low-level tracker script for plain HTML
- `databuddy-cache` - Redis caching layer for analytics queries
- `databuddy-notifications` - Multi-channel notification system
- `databuddy-integration` - Full-stack integration examples

## References

- Databuddy Docs: https://www.databuddy.cc/docs
- Dashboard: https://app.databuddy.cc
- GitHub: https://github.com/databuddy-analytics/Databuddy
- Discord: https://discord.gg/JTk7a38tCZ
