# Feature Flags Reference

The SDK provides feature flag support across all platforms (React, Node.js, Vue).

## React Feature Flags

### Installation

Feature flags are included in the main SDK:

```bash
bun add @databuddy/sdk
```

### FlagsProvider

Wrap your app with `FlagsProvider`:

```tsx
import { FlagsProvider } from "@databuddy/sdk/react";

function App() {
  return (
    <FlagsProvider
      clientId={process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID}
      user={{ userId: user?.id, email: user?.email }}
      environment="production"
    >
      <YourApp />
    </FlagsProvider>
  );
}
```

### FlagsProvider Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `clientId` | `string` | **required** | Your project client ID |
| `apiUrl` | `string` | Auto | Custom API endpoint |
| `user` | `UserContext` | — | User context for targeting |
| `environment` | `string` | — | Environment name |
| `isPending` | `boolean` | `false` | Show pending state |
| `disabled` | `boolean` | `false` | Disable flag fetching |
| `autoFetch` | `boolean` | `true` | Auto-fetch flags on mount |
| `cacheTtl` | `number` | — | Cache TTL in ms |
| `staleTime` | `number` | — | Stale time in ms |
| `skipStorage` | `boolean` | `false` | Skip local storage |

### UserContext

```typescript
interface UserContext {
  userId?: string;
  email?: string;
  // Additional targeting attributes
  [key: string]: unknown;
}
```

## Hooks

### useFlag

Get full flag state with loading/error handling:

```tsx
import { useFlag } from "@databuddy/sdk/react";

function MyComponent() {
  const flag = useFlag("my-feature");

  if (flag.loading) {
    return <Skeleton />;
  }

  return flag.on ? <NewFeature /> : <OldFeature />;
}
```

Returns `FlagState`:

```typescript
interface FlagState {
  on: boolean;           // Is flag enabled
  enabled: boolean;      // Alias for on
  loading: boolean;      // Is loading
  isLoading: boolean;    // Alias for loading
  isReady: boolean;      // Is ready
  status: FlagStatus;    // "pending" | "loading" | "ready" | "error"
  value?: unknown;       // Flag value (for non-boolean flags)
  variant?: string;      // Variant name (for A/B tests)
}
```

### useFeature

Simple feature check with loading state:

```tsx
import { useFeature } from "@databuddy/sdk/react";

function MyComponent() {
  const { on, loading, variant } = useFeature("dark-mode");

  if (loading) {
    return <Skeleton />;
  }

  return on ? <DarkTheme /> : <LightTheme />;
}
```

### useFeatureOn

Boolean-only check with default value (SSR-safe):

```tsx
import { useFeatureOn } from "@databuddy/sdk/react";

function MyComponent() {
  // Returns false while loading
  const isDarkMode = useFeatureOn("dark-mode", false);

  return isDarkMode ? <DarkTheme /> : <LightTheme />;
}
```

### useFlagValue

Get typed flag value:

```tsx
import { useFlagValue } from "@databuddy/sdk/react";

function MyComponent() {
  const maxItems = useFlagValue("max-items", 10);
  const theme = useFlagValue<"light" | "dark">("theme", "light");

  return <ItemList max={maxItems} theme={theme} />;
}
```

### useVariant

Get A/B test variant:

```tsx
import { useVariant } from "@databuddy/sdk/react";

function Checkout() {
  const variant = useVariant("checkout-experiment");

  if (variant === "control") {
    return <OldCheckout />;
  }
  if (variant === "treatment-a") {
    return <NewCheckoutA />;
  }
  return <NewCheckoutB />;
}
```

### useFlags

Access the full flags context:

```tsx
import { useFlags } from "@databuddy/sdk/react";

function MyComponent() {
  const {
    isOn,
    getFlag,
    getValue,
    fetchFlag,
    fetchAllFlags,
    updateUser,
    refresh,
    isReady,
  } = useFlags();

  // Check if flag is on
  const enabled = isOn("feature-x");

  // Get flag with state
  const flag = getFlag("feature-y");

  // Get typed value
  const limit = getValue<number>("rate-limit", 100);

  // Update user context
  const handleLogin = (user) => {
    updateUser({ userId: user.id, email: user.email });
  };

  // Force refresh flags
  const handleRefresh = () => {
    refresh(true); // true = force clear cache
  };
}
```

## Patterns

### Loading States

```tsx
function FeatureWithSkeleton() {
  const { on, loading } = useFeature("new-dashboard");

  if (loading) {
    return <DashboardSkeleton />;
  }

  return on ? <NewDashboard /> : <OldDashboard />;
}
```

### Server-Side Rendering

Use `isPending` during SSR/hydration:

```tsx
// In your root layout or app
const [isPending, startTransition] = useTransition();

<FlagsProvider
  clientId="..."
  isPending={isPending}
  user={user}
>
  <App />
</FlagsProvider>
```

### Targeting Rules

Pass user attributes for targeting:

```tsx
<FlagsProvider
  clientId="..."
  user={{
    userId: user.id,
    email: user.email,
    plan: user.subscription.plan,
    country: user.address.country,
    createdAt: user.createdAt,
  }}
>
  <App />
</FlagsProvider>
```

### Environment-Based Flags

```tsx
<FlagsProvider
  clientId="..."
  environment={process.env.NODE_ENV}
>
  <App />
</FlagsProvider>
```

## Node.js Feature Flags

```typescript
import { createFlagsManager } from "@databuddy/sdk/node";

const flags = createFlagsManager({
  clientId: process.env.DATABUDDY_CLIENT_ID,
});

// Check flag
const result = await flags.getFlag("feature-x", {
  userId: "user-123",
  email: "user@example.com",
});

if (result.enabled) {
  // Feature is enabled
}

// Get flag value
const limit = await flags.getValue<number>("rate-limit", {
  userId: "user-123",
}, 100);
```

## Vue Feature Flags

```typescript
import { createFlagsPlugin, useFlag, useFeature } from "@databuddy/sdk/vue";

// Install plugin
app.use(createFlagsPlugin({
  clientId: import.meta.env.VITE_DATABUDDY_CLIENT_ID,
}));

// In components
const { on, loading } = useFeature("dark-mode");
```
