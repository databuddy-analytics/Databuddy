# Node.js SDK Reference

The Node.js SDK (`@databuddy/sdk/node`) provides server-side tracking with batching, middleware, and deduplication support.

## Installation

```bash
bun add @databuddy/sdk
```

## Basic Usage

```typescript
import { Databuddy } from "@databuddy/sdk/node";

const client = new Databuddy({
  clientId: process.env.DATABUDDY_CLIENT_ID,
});

// Track an event
await client.track({
  name: "user_signup",
  properties: { plan: "pro", source: "web" },
});

// Important: Flush before process exit (especially in serverless)
await client.flush();
```

## Configuration

### DatabuddyConfig

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `clientId` | `string` | **required** | Your project client ID |
| `apiUrl` | `string` | `https://basket.databuddy.cc` | Custom API endpoint |
| `debug` | `boolean` | `false` | Enable debug logging |
| `logger` | `Logger` | — | Custom logger instance |

### Batching Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableBatching` | `boolean` | `true` | Enable automatic batching |
| `batchSize` | `number` | `10` | Events per batch (max 100) |
| `batchTimeout` | `number` | `2000` | Auto-flush timeout (ms) |
| `maxQueueSize` | `number` | `1000` | Maximum queue size |

### Deduplication Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableDeduplication` | `boolean` | `true` | Enable event deduplication |
| `maxDeduplicationCacheSize` | `number` | `10000` | Max cache size |

### Middleware

| Option | Type | Description |
|--------|------|-------------|
| `middleware` | `Middleware[]` | Array of middleware functions |

## Methods

### track(event)

Track a custom event:

```typescript
await client.track({
  name: "api_call",
  eventId: "unique-id-123", // Optional, for deduplication
  anonymousId: "anon-123",  // Optional
  sessionId: "sess-123",    // Optional
  timestamp: Date.now(),    // Optional
  properties: {
    endpoint: "/api/users",
    method: "POST",
    duration_ms: 45,
  },
});
```

### batch(events)

Send multiple events in one request (max 100):

```typescript
await client.batch([
  { type: "custom", name: "event1", properties: { foo: "bar" } },
  { type: "custom", name: "event2", properties: { baz: "qux" } },
]);
```

### flush()

Manually flush all queued events:

```typescript
await client.flush();
```

### setGlobalProperties(properties)

Set properties attached to all future events:

```typescript
client.setGlobalProperties({
  environment: "production",
  version: "1.0.0",
  service: "api",
});
```

### getGlobalProperties()

Get current global properties:

```typescript
const globals = client.getGlobalProperties();
```

### clearGlobalProperties()

Clear all global properties:

```typescript
client.clearGlobalProperties();
```

## Middleware

Middleware functions can transform or filter events:

```typescript
import { Databuddy } from "@databuddy/sdk/node";
import type { Middleware } from "@databuddy/sdk/node";

// Add custom field middleware
const addMetadata: Middleware = (event) => {
  return {
    ...event,
    properties: {
      ...event.properties,
      processed_at: Date.now(),
      server_id: process.env.SERVER_ID,
    },
  };
};

// Filter middleware (return null to drop)
const filterInternal: Middleware = (event) => {
  if (event.name.startsWith("internal_")) {
    return null; // Drop internal events
  }
  return event;
};

const client = new Databuddy({
  clientId: "...",
  middleware: [addMetadata, filterInternal],
});

// Or add later
client.addMiddleware((event) => {
  console.log("Tracking:", event.name);
  return event;
});
```

## Deduplication

Events with the same `eventId` are automatically deduplicated:

```typescript
await client.track({
  name: "webhook_received",
  eventId: webhookId, // Same ID = deduplicated
  properties: { type: "payment" },
});

// Check cache size
const size = client.getDeduplicationCacheSize();

// Clear cache if needed
client.clearDeduplicationCache();
```

## Serverless Usage

In serverless environments (AWS Lambda, Vercel Functions, etc.), always flush before the function ends:

```typescript
export async function handler(event) {
  const client = new Databuddy({ clientId: "..." });
  
  try {
    // Your logic here
    await client.track({ name: "function_invoked" });
    
    return { statusCode: 200 };
  } finally {
    // Always flush before exit
    await client.flush();
  }
}
```

## Custom Logger

Provide a custom logger for integration with your logging system:

```typescript
import { Databuddy } from "@databuddy/sdk/node";

const client = new Databuddy({
  clientId: "...",
  logger: {
    info: (msg, data) => myLogger.info(msg, data),
    warn: (msg, data) => myLogger.warn(msg, data),
    error: (msg, data) => myLogger.error(msg, data),
    debug: (msg, data) => myLogger.debug(msg, data),
  },
});
```

## Types

```typescript
import type {
  DatabuddyConfig,
  CustomEventInput,
  BatchEventInput,
  EventResponse,
  BatchEventResponse,
  GlobalProperties,
  Middleware,
  Logger,
} from "@databuddy/sdk/node";
```

## Alias

The SDK also exports `db` as a shorthand alias:

```typescript
import { db } from "@databuddy/sdk/node";

const client = new db({ clientId: "..." });
```
