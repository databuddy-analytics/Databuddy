# @databuddy/notifications

Unified notification package for sending alerts across Slack, Discord, Email, Teams, Telegram, Google Chat, and custom webhooks.

## Channels


| Channel     | Config                | Setup                                      |
| ----------- | --------------------- | ------------------------------------------ |
| Slack       | `webhookUrl`          | Incoming webhook URL                       |
| Discord     | `webhookUrl`          | Channel webhook URL                        |
| Email       | `sendEmailAction`     | Injected send function (Resend, SES, etc.) |
| Webhook     | `url`                 | Any HTTP endpoint                          |
| Teams       | `webhookUrl`          | Incoming webhook URL                       |
| Telegram    | `botToken` + `chatId` | Create bot via BotFather                   |
| Google Chat | `webhookUrl`          | Space webhook URL                          |


## Quick Start

### One-off sends

```typescript
import {
  sendSlackWebhook,
  sendDiscordWebhook,
  sendTeamsWebhook,
  sendTelegramMessage,
  sendGoogleChatWebhook,
  sendEmail,
  sendWebhook,
} from "@databuddy/notifications";

await sendSlackWebhook(SLACK_URL, {
  title: "Alert",
  message: "Something happened!",
  priority: "high",
  metadata: { website: "example.com" },
});

await sendTelegramMessage(BOT_TOKEN, CHAT_ID, {
  title: "Deploy Complete",
  message: "v2.1.0 is live",
});
```

### Client (multi-channel)

```typescript
import { NotificationClient } from "@databuddy/notifications";

const client = new NotificationClient({
  slack: { webhookUrl: SLACK_URL },
  discord: { webhookUrl: DISCORD_URL },
  teams: { webhookUrl: TEAMS_URL },
  telegram: { botToken: BOT_TOKEN, chatId: CHAT_ID },
  defaultChannels: ["slack", "discord"],
  defaultRetries: 2,
});

const results = await client.send({
  title: "Traffic Spike",
  message: "300% increase detected",
  priority: "high",
  metadata: { website: "example.com", traffic: "15,000" },
});

// Send to specific channels
await client.send(payload, { channels: ["slack", "telegram"] });

// Send to one channel
await client.sendToChannel("teams", payload);
```

## Uptime templates

Build consistent payloads for downtime and recovery (map your monitor model to the input in your app):

```typescript
import {
  buildUptimeNotificationPayload,
  NotificationClient,
  sendSlackWebhook,
} from "@databuddy/notifications";

const downPayload = buildUptimeNotificationPayload({
  kind: "down",
  siteLabel: "Marketing site",
  url: "https://example.com",
  checkedAt: Date.now(),
  httpCode: 0,
  error: "Connection refused",
  probeRegion: "eu-west",
  totalMs: 12_000,
});

await sendSlackWebhook(SLACK_URL, downPayload);

const recoveredPayload = buildUptimeNotificationPayload({
  kind: "recovered",
  siteLabel: "Marketing site",
  url: "https://example.com",
  checkedAt: Date.now(),
  httpCode: 200,
  error: "",
  totalMs: 120,
  ttfbMs: 45,
});

const client = new NotificationClient({
  discord: { webhookUrl: DISCORD_URL },
  teams: { webhookUrl: TEAMS_URL },
});

await client.send(recoveredPayload, { channels: ["discord", "teams"] });
```

Metadata includes `template: "uptime"`, `kind`, `url`, `siteLabel`, `checkedAt`, `httpCode`, and optional fields (`error`, `probeRegion`, timings, SSL) for webhooks and filtering. 

## Email

Email uses an injected send function so you can plug in any provider:

```typescript
import { Resend } from "resend";

const client = new NotificationClient({
  email: {
    sendEmailAction: async (payload) =>
      new Resend(API_KEY).emails.send({ from: "noreply@example.com", ...payload }),
    defaultTo: "alerts@example.com",
    from: "noreply@example.com",
  },
});

// Uses defaultTo
await client.sendToChannel("email", {
  title: "Weekly Report",
  message: "Your report is ready.",
});

// Override recipient per-send
await client.sendToChannel("email", {
  title: "Welcome",
  message: "Thanks for signing up!",
  metadata: { to: "user@example.com" },
});
```

## Priority

All channels support priority levels with channel-specific rendering:


| Priority | Discord      | Teams           | Telegram  | Slack         |
| -------- | ------------ | --------------- | --------- | ------------- |
| `urgent` | Red embed    | Attention color | 🔴 prefix | Context block |
| `high`   | Orange embed | Warning color   | 🟠 prefix | Context block |
| `normal` | Green embed  | Good color      | (none)    | (none)        |
| `low`    | Blue embed   | Accent color    | 🔵 prefix | Context block |


## Reliability

- **Retries** with exponential backoff + jitter (configurable per-provider)
- **Timeouts** via `AbortController` signal on fetch (default 10s)
- **Isolated failures** via `Promise.allSettled` — one channel failing doesn't block others

## API

### `NotificationClient`


| Method                            | Returns                         |
| --------------------------------- | ------------------------------- |
| `send(payload, options?)`         | `Promise<NotificationResult[]>` |
| `sendToChannel(channel, payload)` | `Promise<NotificationResult>`   |
| `hasChannel(channel)`             | `boolean`                       |
| `getConfiguredChannels()`         | `NotificationChannel[]`         |


### Types

```typescript
type NotificationChannel = "slack" | "discord" | "email" | "webhook" | "teams" | "telegram" | "google-chat";
type NotificationPriority = "low" | "normal" | "high" | "urgent";

interface NotificationPayload {
  title: string;
  message: string;
  priority?: NotificationPriority;
  metadata?: Record<string, unknown>;
}

interface NotificationResult {
  success: boolean;
  channel: NotificationChannel;
  error?: string;
  response?: unknown;
}
```

