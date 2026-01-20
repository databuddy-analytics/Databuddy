# React SDK Reference

The React SDK (`@databuddy/sdk/react`) provides a drop-in component and hooks for React/Next.js applications.

## Installation

```bash
bun add @databuddy/sdk
```

## Databuddy Component

The `<Databuddy />` component injects the tracking script. Place it in your root layout.

### Next.js App Router

```tsx
// app/layout.tsx
import { Databuddy } from "@databuddy/sdk/react";

export default function RootLayout({ children }) {
  return (
    <html lang="en">
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

### Next.js Pages Router

```tsx
// pages/_app.tsx
import { Databuddy } from "@databuddy/sdk/react";

export default function App({ Component, pageProps }) {
  return (
    <>
      <Component {...pageProps} />
      <Databuddy
        clientId={process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID}
        trackWebVitals
        trackErrors
      />
    </>
  );
}
```

### Props

All props from `DatabuddyConfig` are supported. See [Core SDK Reference](./core.md) for full options.

Key props:

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `clientId` | `string` | Auto-detect | Your project client ID |
| `disabled` | `boolean` | `false` | Disable tracking |
| `trackWebVitals` | `boolean` | `false` | Track Web Vitals |
| `trackErrors` | `boolean` | `false` | Track JS errors |
| `trackPerformance` | `boolean` | `true` | Track performance |
| `trackScrollDepth` | `boolean` | `false` | Track scroll depth |
| `trackOutgoingLinks` | `boolean` | `false` | Track outgoing clicks |
| `debug` | `boolean` | `false` | Enable debug logging |

### Auto-detection

The component auto-detects `clientId` from `NEXT_PUBLIC_DATABUDDY_CLIENT_ID` environment variable.

### SSR Safety

The component is SSR-safe. It only injects the script on the client side and renders nothing to the DOM.

## Exported Functions

Re-exported from core for convenience:

```typescript
import {
  track,
  trackError,
  flush,
  clear,
  getTracker,
  isTrackerAvailable,
  getAnonymousId,
  getSessionId,
  getTrackingIds,
  getTrackingParams,
} from "@databuddy/sdk/react";
```

## Examples

### Disable in Development

```tsx
<Databuddy
  disabled={process.env.NODE_ENV === "development"}
  clientId="..."
/>
```

### With All Tracking Features

```tsx
<Databuddy
  clientId="..."
  trackWebVitals
  trackErrors
  trackPerformance
  trackScrollDepth
  trackOutgoingLinks
  trackInteractions
  trackHashChanges
/>
```

### With Filtering

```tsx
<Databuddy
  clientId="..."
  skipPatterns={["/admin/**", "/_next/**"]}
  maskPatterns={["/users/*", "/orders/*"]}
  filter={(event) => !event.path?.includes("/internal")}
/>
```

### With Batching Configuration

```tsx
<Databuddy
  clientId="..."
  enableBatching
  batchSize={20}
  batchTimeout={5000}
/>
```

### With Sampling

```tsx
<Databuddy
  clientId="..."
  samplingRate={0.5} // Track 50% of sessions
/>
```

## Custom Event Tracking

Use the `track` function or `window.databuddy.track`:

```tsx
import { track } from "@databuddy/sdk/react";

function PurchaseButton({ product }) {
  const handlePurchase = async () => {
    await completePurchase(product);
    
    track("purchase", {
      product_id: product.id,
      product_name: product.name,
      amount: product.price,
      currency: "USD",
    });
  };

  return <button onClick={handlePurchase}>Buy Now</button>;
}
```

## Error Tracking

```tsx
import { trackError } from "@databuddy/sdk/react";

function ErrorBoundary({ children }) {
  return (
    <ReactErrorBoundary
      onError={(error, errorInfo) => {
        trackError({
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        });
      }}
    >
      {children}
    </ReactErrorBoundary>
  );
}
```
