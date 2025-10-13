# Databuddy SDK & React Component

[![npm version](https://img.shields.io/npm/v/@databuddy/sdk?style=flat-square)](https://www.npmjs.com/package/@databuddy/sdk)
[![License](https://img.shields.io/npm/l/@databuddy/sdk?style=flat-square)](./LICENSE)
[![Docs](https://img.shields.io/badge/docs-databuddy.cc-blue?style=flat-square)](https://www.databuddy.cc/docs)

> **The easiest, privacy-first way to add analytics to your web app.**

---

## ✨ Features

- 📊 **Automatic page/screen view tracking**
- ⚡ **Performance, Web Vitals, and error tracking**
- 🧑‍💻 **Custom event tracking**
- 🧩 **Drop-in React/Next.js component: `<Databuddy />`**
- 🛡️ **Privacy-first: anonymized by default, sampling, batching, and more**
- 🛠️ **Type-safe config and autocompletion**
- 📋 **Observability: logging, error tracking, and distributed tracing**

---

## 🚀 Quickstart

```sh
bun add @databuddy/sdk
# or
npm install @databuddy/sdk
```

Add to your root layout (Next.js/React):

```tsx
import { Databuddy } from '@databuddy/sdk/react';

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head />
      <Databuddy
        clientId={process.env.NEXT_PUBLIC_DATABUDDY_CLIENT_ID!}
        trackScreenViews
        trackPerformance
        trackErrors
        enableBatching
        batchSize={20}
      />
      <body>{children}</body>
    </html>
  );
}
```

---

## 🛠️ Configuration Options

All options are type-safe and documented in `DatabuddyConfig`:

| Option                | Type      | Default      | Description |
|-----------------------|-----------|--------------|-------------|
| `clientId`            | string    | —            | **Required.** Your Databuddy project client ID. |
| `clientSecret`        | string    | —            | (Advanced) For server-side use only. |
| `apiUrl`              | string    | `https://api.databuddy.cc` | Custom API endpoint. |
| `scriptUrl`           | string    | `https://cdn.databuddy.cc/databuddy.js` | Custom script URL. |
| `sdk`                 | string    | `web`        | SDK name. Only override for custom builds. |
| `sdkVersion`          | string    | *auto*       | SDK version. Defaults to package version. |
| `disabled`            | boolean   | `false`      | Disable all tracking. |
| `waitForProfile`      | boolean   | `false`      | Wait for user profile before sending events. |
| `trackScreenViews`    | boolean   | `true`       | Auto-track page/screen views. |
| `trackHashChanges`    | boolean   | `false`      | Track hash changes in URL. |
| `trackAttributes`     | boolean   | `false`      | Track data-* attributes. |
| `trackOutgoingLinks`  | boolean   | `false`      | Track outgoing link clicks. |
| `trackSessions`       | boolean   | `true`       | Track user sessions. |
| `trackPerformance`    | boolean   | `true`       | Track page performance. |
| `trackWebVitals`      | boolean   | `true`       | Track Web Vitals. |
| `trackEngagement`     | boolean   | `false`      | Track engagement metrics. |
| `trackScrollDepth`    | boolean   | `false`      | Track scroll depth. |
| `trackExitIntent`     | boolean   | `false`      | Track exit intent. |
| `trackInteractions`   | boolean   | `false`      | Track user interactions. |
| `trackErrors`         | boolean   | `true`       | Track JS errors. |
| `trackBounceRate`     | boolean   | `false`      | Track bounce rate. |
| `samplingRate`        | number    | `1.0`        | Sampling rate (0.0–1.0). |
| `enableRetries`       | boolean   | `true`       | Retry failed requests. |
| `maxRetries`          | number    | `3`          | Max retries. |
| `initialRetryDelay`   | number    | `500`        | Initial retry delay (ms). |
| `enableBatching`      | boolean   | `true`       | Enable event batching. |
| `batchSize`           | number    | `20`         | Events per batch (1–50). |
| `batchTimeout`        | number    | `5000`       | Batch timeout (ms, 100–30000). |

---

## 💡 FAQ

**Q: Is Databuddy privacy-friendly?**  
A: Yes! All analytics are anonymized by default. No cookies, no fingerprinting, no PII.

**Q: Can I use this in Next.js, Remix, or plain React?**  
A: Yes! `<Databuddy />` works in any React app. For non-React, use the script tag directly.

**Q: How do I disable analytics in development?**  
A: Use the `disabled` prop: `<Databuddy disabled={process.env.NODE_ENV === 'development'} ... />`

**Q: Where do I find my `clientId`?**  
A: In your [Databuddy dashboard](https://app.databuddy.cc).

---

## 🧑‍💻 Troubleshooting

- **Script not loading?**
  - Make sure your `clientId` is correct and the script URL is reachable.
- **No events in dashboard?**
  - Check your config, especially `clientId` and network requests in the browser dev tools.
- **Type errors?**
  - All config options are type-safe. Use your IDE's autocomplete for help.
- **SSR/Next.js?**
  - The component is safe for SSR/React Server Components. It only injects the script on the client.

---

## 📚 Documentation & Support

- [Databuddy Docs](https://www.databuddy.cc/docs)
- [Dashboard](https://app.databuddy.cc)
- [Contact Support](https://www.databuddy.cc/contact)

---

© Databuddy. All rights reserved. 