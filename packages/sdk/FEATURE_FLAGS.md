# Databuddy Feature Flags SDK

Comprehensive feature flags SDK for browser, Node.js, React, Vue, and Next.js.

## Features

- ✅ **Multi-variant flags**: Boolean, string, number, and object values
- ✅ **Server-side SDK**: Optimized for Next.js server components and API routes
- ✅ **Client-side SDK**: React and Vue integrations
- ✅ **Flag dependencies**: Prerequisites and conditional flags
- ✅ **Scheduled rollouts**: Time-based and gradual percentage rollouts
- ✅ **Multi-environment**: Separate configs for dev/staging/production
- ✅ **Server-side caching**: Memory and Redis cache strategies
- ✅ **Type-safe**: Full TypeScript support
- ✅ **Vercel Flags SDK adapter**: First-class Vercel integration

## Installation

```bash
npm install @databuddy/sdk
# or
pnpm add @databuddy/sdk
# or
yarn add @databuddy/sdk
```

## Quick Start

### Node.js Server-Side (Next.js)

Perfect for server components, API routes, and serverless functions:

```typescript
import { createFlagsManager } from '@databuddy/sdk/node/flags';

const flags = createFlagsManager({
  clientId: process.env.DATABUDDY_CLIENT_ID!,
  environment: 'production',
  cacheTtl: 60000, // 1 minute
  enableAutoRefresh: true,
});

// In Next.js server component
export default async function Page() {
  const isEnabled = await flags.isEnabled('new-feature');
  const variant = await flags.getVariant<string>('pricing-tier');

  return (
    <div>
      {isEnabled && <NewFeature />}
      <PricingDisplay tier={variant} />
    </div>
  );
}

// In API route
export async function GET(request: Request) {
  const flags = await flags.getAllFlags({
    userId: 'user-123',
    properties: { plan: 'premium' },
  });

  return Response.json({ flags });
}
```

### React (Browser)

```typescript
import { FlagsProvider, useFlag } from '@databuddy/sdk/react/flags';

// In your app root
function App() {
  return (
    <FlagsProvider
      config={{
        clientId: 'your-client-id',
        environment: 'production',
        user: {
          userId: 'user-123',
          email: 'user@example.com',
        },
      }}
    >
      <YourApp />
    </FlagsProvider>
  );
}

// In components
function MyComponent() {
  const { enabled, isLoading } = useFlag('new-feature');
  const variant = useFlag<string>('pricing-tier');

  if (isLoading) return <Loading />;

  return (
    <div>
      {enabled && <NewFeature />}
      {variant.value === 'premium' && <PremiumBadge />}
    </div>
  );
}
```

### Vue

```typescript
import { createFlagsPlugin } from '@databuddy/sdk/vue/flags';

// In main.ts
const app = createApp(App);

app.use(
  createFlagsPlugin({
    clientId: 'your-client-id',
    environment: 'production',
  })
);

// In components
<template>
  <div>
    <NewFeature v-if="enabled" />
    <PricingDisplay :tier="variant" />
  </div>
</template>

<script setup>
import { useFlag } from '@databuddy/sdk/vue/flags';

const { enabled, isLoading } = useFlag('new-feature');
const { value: variant } = useFlag('pricing-tier');
</script>
```

## Server-Side Flags API

### createFlagsManager(config)

Creates a server-side flags manager instance.

#### Configuration

```typescript
interface NodeFlagsConfig {
  clientId: string; // Required
  apiUrl?: string; // Default: 'https://api.databuddy.cc'
  environment?: string; // Default: 'production'
  user?: {
    userId?: string;
    email?: string;
    properties?: Record<string, any>;
  };
  debug?: boolean; // Default: false
  cacheTtl?: number; // Default: 60000 (1 minute)
  enableAutoRefresh?: boolean; // Default: false
  refreshInterval?: number; // Default: 60000
  cacheStrategy?: 'memory' | 'redis' | 'none'; // Default: 'memory'
  redis?: {
    url: string;
    ttl?: number;
  };
}
```

#### Methods

##### `getFlag(key, context?)`

Get a single flag with full metadata:

```typescript
const flag = await flags.getFlag('new-feature', {
  userId: 'user-123',
  properties: { beta: true },
});

console.log(flag);
// {
//   enabled: true,
//   value: true,
//   reason: 'MATCHED',
//   flagType: 'boolean',
//   dependencies: []
// }
```

##### `isEnabled(key, context?)`

Quick boolean check:

```typescript
const isEnabled = await flags.isEnabled('new-feature');
if (isEnabled) {
  // Feature is on
}
```

##### `getVariant<T>(key, context?)`

Get the variant value with type safety:

```typescript
const tier = await flags.getVariant<string>('pricing-tier');
console.log(tier); // 'premium'

const config = await flags.getVariant<{ theme: string; limit: number }>('ui-config');
console.log(config); // { theme: 'dark', limit: 100 }
```

##### `getAllFlags(context?)`

Get all flags at once (efficient bulk fetch):

```typescript
const result = await flags.getAllFlags({
  userId: 'user-123',
  email: 'user@example.com',
});

console.log(result.flags);
// {
//   'new-feature': { enabled: true, value: true, ... },
//   'pricing-tier': { enabled: true, value: 'premium', ... }
// }
```

##### `refresh()`

Manually refresh the cache:

```typescript
await flags.refresh();
```

##### `clearCache()`

Clear all cached flags:

```typescript
flags.clearCache();
```

##### `shutdown()`

Cleanup and shutdown (important in serverless):

```typescript
await flags.shutdown();
```

## Multi-Variant Flags

Databuddy supports flags with multiple variants beyond just boolean on/off:

### String Variants

```typescript
const theme = await flags.getVariant<string>('theme');
// Returns: 'dark' | 'light' | 'auto'
```

### Number Variants

```typescript
const limit = await flags.getVariant<number>('rate-limit');
// Returns: 100 | 1000 | 10000
```

### Object Variants

```typescript
interface FeatureConfig {
  enabled: boolean;
  maxUsers: number;
  features: string[];
}

const config = await flags.getVariant<FeatureConfig>('feature-config');
// Returns: { enabled: true, maxUsers: 100, features: ['a', 'b'] }
```

## Flag Dependencies

Flags can depend on other flags. If a prerequisite flag is disabled, dependent flags are automatically disabled:

```typescript
// In Databuddy dashboard:
// Flag 'advanced-features' depends on 'premium-plan' being enabled

const hasAdvanced = await flags.isEnabled('advanced-features');
// Only true if both 'premium-plan' AND 'advanced-features' are enabled
```

## Scheduled Rollouts

Flags can be scheduled to change at specific times or roll out gradually:

```typescript
// Configured in Databuddy dashboard:
// - Enable at 2025-01-01 00:00:00
// - Gradual rollout: 10% → 50% → 100% over 7 days
// - Timezone: America/New_York

const isEnabled = await flags.isEnabled('new-year-feature');
// Automatically evaluates based on current time and rollout schedule
```

## Multi-Environment Support

Separate flag configurations for different environments:

```typescript
// Development
const devFlags = createFlagsManager({
  clientId: 'your-client-id',
  environment: 'development',
});

// Staging
const stagingFlags = createFlagsManager({
  clientId: 'your-client-id',
  environment: 'staging',
});

// Production
const prodFlags = createFlagsManager({
  clientId: 'your-client-id',
  environment: 'production',
});
```

Each environment can have different flag states, variants, and rollout percentages.

## Caching Strategies

### Memory Cache (Default)

Fast in-memory caching, perfect for single-instance deployments:

```typescript
const flags = createFlagsManager({
  clientId: 'your-client-id',
  cacheStrategy: 'memory',
  cacheTtl: 60000, // 1 minute
});
```

### Redis Cache

Shared cache across multiple instances:

```typescript
const flags = createFlagsManager({
  clientId: 'your-client-id',
  cacheStrategy: 'redis',
  redis: {
    url: process.env.REDIS_URL!,
    ttl: 60000,
  },
});
```

### No Cache

Fetch fresh data every time:

```typescript
const flags = createFlagsManager({
  clientId: 'your-client-id',
  cacheStrategy: 'none',
});
```

## Auto-Refresh

Automatically refresh flags in the background:

```typescript
const flags = createFlagsManager({
  clientId: 'your-client-id',
  enableAutoRefresh: true,
  refreshInterval: 30000, // Refresh every 30 seconds
});
```

## User Targeting

Target specific users or segments:

```typescript
const flags = await flags.getAllFlags({
  userId: 'user-123',
  email: 'user@example.com',
  properties: {
    plan: 'premium',
    signupDate: '2024-01-01',
    country: 'US',
    beta: true,
  },
});
```

## Next.js Integration

### Server Components

```typescript
// app/page.tsx
import { createFlagsManager } from '@databuddy/sdk/node/flags';

const flags = createFlagsManager({
  clientId: process.env.DATABUDDY_CLIENT_ID!,
});

export default async function Page() {
  const isEnabled = await flags.isEnabled('new-feature');

  return <div>{isEnabled && <NewFeature />}</div>;
}
```

### API Routes

```typescript
// app/api/features/route.ts
import { createFlagsManager } from '@databuddy/sdk/node/flags';
import { NextRequest, NextResponse } from 'next/server';

const flags = createFlagsManager({
  clientId: process.env.DATABUDDY_CLIENT_ID!,
});

export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id');

  const allFlags = await flags.getAllFlags({
    userId: userId || undefined,
  });

  return NextResponse.json(allFlags);
}
```

### Middleware

```typescript
// middleware.ts
import { createFlagsManager } from '@databuddy/sdk/node/flags';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const flags = createFlagsManager({
  clientId: process.env.DATABUDDY_CLIENT_ID!,
  cacheTtl: 30000,
});

export async function middleware(request: NextRequest) {
  const maintenanceMode = await flags.isEnabled('maintenance-mode');

  if (maintenanceMode) {
    return NextResponse.redirect(new URL('/maintenance', request.url));
  }

  return NextResponse.next();
}
```

## Vercel Integration

Databuddy has a first-class Vercel Flags SDK adapter:

```typescript
// .well-known/vercel/flags/route.ts
import { getProviderData } from '@vercel/flags-adapter-databuddy/provider';

export async function GET() {
  const data = await getProviderData({
    clientId: process.env.DATABUDDY_CLIENT_ID!,
    apiKey: process.env.DATABUDDY_API_KEY!,
    environment: process.env.NODE_ENV || 'production',
  });

  return Response.json(data);
}
```

```typescript
// flags.ts
import { flag } from 'flags/next';
import { createDatabuddyAdapter } from '@vercel/flags-adapter-databuddy';

const adapter = createDatabuddyAdapter({
  clientId: process.env.DATABUDDY_CLIENT_ID!,
  apiKey: process.env.DATABUDDY_API_KEY,
});

export const showNewFeature = flag({
  key: 'show-new-feature',
  adapter,
  defaultValue: false,
});
```

See [@vercel/flags-adapter-databuddy](../../vercel-flags/packages/adapter-databuddy/README.md) for full documentation.

## TypeScript Support

Full TypeScript support with strict typing:

```typescript
import type { NodeFlagResult, FlagVariantValue } from '@databuddy/sdk/node/flags';

// Type-safe variant access
const tier = await flags.getVariant<'basic' | 'standard' | 'premium'>('pricing-tier');

// Type-safe config objects
interface AppConfig {
  theme: 'light' | 'dark';
  maxItems: number;
  features: string[];
}

const config = await flags.getVariant<AppConfig>('app-config');
```

## Error Handling

The SDK handles errors gracefully and returns safe defaults:

```typescript
try {
  const isEnabled = await flags.isEnabled('new-feature');
  // Use flag
} catch (error) {
  // Errors are caught internally, returns false by default
  console.error('Flag evaluation failed:', error);
}
```

## Best Practices

1. **Cache Wisely**: Use appropriate cache TTLs based on your needs
2. **Environment Separation**: Use different environments for dev/staging/prod
3. **Default Values**: Always provide sensible default values
4. **User Context**: Include relevant user properties for targeting
5. **Cleanup**: Call `shutdown()` in serverless functions after use
6. **Bulk Fetching**: Use `getAllFlags()` when you need multiple flags
7. **Type Safety**: Use TypeScript generics for variant type safety

## Examples

See the [examples](./examples/) directory for complete examples:

- [Next.js App Router](./examples/nextjs-app-router/)
- [Next.js API Routes](./examples/nextjs-api-routes/)
- [React SPA](./examples/react-spa/)
- [Vue 3](./examples/vue3/)
- [Express API](./examples/express-api/)

## API Reference

Full API documentation: [api-reference.md](./API_REFERENCE.md)

## Support

- Documentation: https://docs.databuddy.cc/flags
- GitHub Issues: https://github.com/databuddy-analytics/Databuddy/issues
- Discord: https://discord.gg/databuddy
