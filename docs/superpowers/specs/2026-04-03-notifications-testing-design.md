# Notifications Package Testing Design

## Overview

Add comprehensive unit and integration tests to `packages/notifications`. The package currently has zero tests across 7 providers, 2 templates, the `NotificationClient` orchestrator, helper functions, and the `BaseProvider` retry/timeout logic.

**Approach:** Unit tests with mocked `fetch` for fast CI, plus integration tests using a local Bun HTTP server as a webhook receiver for real HTTP validation.

## File Layout

```
packages/notifications/src/
  __tests__/
    providers/
      slack.test.ts
      discord.test.ts
      email.test.ts
      teams.test.ts
      telegram.test.ts
      google-chat.test.ts
      webhook.test.ts
      base.test.ts
    templates/
      uptime.test.ts
      anomaly.test.ts
    client.test.ts
    helpers.test.ts
    integration/
      webhook-receiver.ts
      providers.integration.test.ts
```

Tests use `bun:test` (describe/it/expect/mock), matching existing monorepo conventions (see `packages/tracker/tests/`, `packages/redis/`).

## Package.json Changes

Add a `test` script to `packages/notifications/package.json`:

```json
{
  "scripts": {
    "test": "bun test src/__tests__/providers src/__tests__/templates src/__tests__/client.test.ts src/__tests__/helpers.test.ts",
    "test:integration": "bun test src/__tests__/integration"
  }
}
```

Unit tests run by default (explicit paths exclude integration dir); integration tests via explicit `test:integration`.

---

## Unit Tests

### 1. Provider Tests (one file per provider)

All 6 HTTP-based providers (Slack, Discord, Teams, Telegram, Google Chat, Webhook) follow the same structure. Each test file mocks `global.fetch` before each test and restores after.

**Shared fetch mock pattern:**

```ts
const originalFetch = global.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
  fetchCalls = [];
  global.fetch = mock((url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init: init! });
    return Promise.resolve(new Response("ok", { status: 200 }));
  }) as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});
```

**Test cases per HTTP provider:**

| Test | Asserts |
|------|---------|
| Formats payload correctly | Parse `fetchCalls[0].init.body` as JSON. Verify channel-specific structure: Slack blocks, Discord embeds, Teams Adaptive Card, Telegram HTML, Google Chat cards, Webhook raw payload. |
| Includes optional config | Provider-specific: channel/username/icon (Slack), username/avatar (Discord), custom headers/method (Webhook). Verify they appear in the request body or init. |
| Renders metadata as fields | Pass `metadata: { foo: "bar", count: 42 }`. Verify it maps to fields (Discord), section fields (Slack), FactSet (Teams), keyValue widgets (Google Chat), bold labels (Telegram). |
| Renders non-normal priority | Pass `priority: "urgent"`. Verify: context block (Slack), embed color 0xe74c3c (Discord), "attention" color TextBlock (Teams), emoji prefix (Telegram), subtitle (Google Chat). |
| Omits priority block for "normal" | Pass `priority: "normal"`. Verify no priority-specific element is added (Slack context, Teams priority TextBlock, Telegram emoji prefix, Google Chat subtitle). |
| Returns success result on 200 | Result is `{ success: true, channel: "<name>", response: { status: 200, ... } }`. |
| Returns error on non-ok response | Mock fetch returns `new Response("err", { status: 500 })`. Result has `success: false` and error containing status code. |
| Returns error on missing config | Empty/missing webhook URL (or botToken/chatId for Telegram). Returns error result immediately, `fetch` never called. |
| Posts to correct URL | Verify `fetchCalls[0].url` matches configured webhook URL. For Telegram: `https://api.telegram.org/bot{token}/sendMessage`. |
| Sends correct Content-Type | Verify `fetchCalls[0].init.headers` includes `Content-Type: application/json`. |

**Email provider tests** — different pattern since it uses an injected `sendEmailAction`:

| Test | Asserts |
|------|---------|
| Calls sendEmailAction with correct payload | Mock function receives `{ to, subject, html, text, from }`. Subject matches title, html contains escaped title/message, text contains message. |
| Uses metadata.to for recipient | Pass `metadata: { to: "a@b.com" }`. Mock receives `to: "a@b.com"`. |
| Falls back to defaultTo | No metadata.to, config has `defaultTo: "default@b.com"`. Mock receives that. |
| Throws when no recipient | No metadata.to and no defaultTo. Result is `success: false` with error about missing recipient. |
| Excludes "to" from metadata table | `metadata: { to: "a@b.com", foo: "bar" }`. HTML/text metadata only contains "foo", not "to". |
| Escapes HTML in output | Title with `<script>` tag. HTML output contains `&lt;script&gt;`. |
| Returns success result | sendEmailAction resolves. Result is `{ success: true, channel: "email" }`. |
| Returns error when sendEmailAction throws | Mock throws. Result has `success: false` with error message. |

### 2. Base Provider Tests

Create a minimal `TestProvider extends BaseProvider` to expose protected methods:

```ts
class TestProvider extends BaseProvider {
  async send(payload: NotificationPayload): Promise<NotificationResult> {
    return { success: true, channel: "webhook" };
  }
  // Expose protected methods for testing
  public testWithRetry<T>(fn: () => Promise<T>) { return this.withRetry(fn); }
  public testFetchWithTimeout(url: string, init?: RequestInit) { return this.fetchWithTimeout(url, init); }
  public testDelay(ms: number) { return this.delay(ms); }
}
```

| Test | Asserts |
|------|---------|
| Default options | `timeout === 10_000`, `retries === 0`, `retryDelay === 1000` |
| Custom options | Passed values override defaults |
| No retries (default) | fn fails once, error thrown immediately, fn called 1 time |
| Retries N times then throws | `retries: 2`, fn always fails. fn called 3 times total, final error thrown. |
| Retries then succeeds | `retries: 2`, fn fails twice then succeeds on 3rd. Returns success value. |
| Backoff increases per attempt | Spy on `delay`. First call gets `retryDelay * 1 + jitter`, second gets `retryDelay * 2 + jitter`. Verify delay arg increases. |
| fetchWithTimeout succeeds | Mock fetch returns 200. Response returned, no abort. |
| fetchWithTimeout times out | `timeout: 1`, mock fetch that never resolves (via a long delay). Error message: "Request timed out after 1ms". |
| fetchWithTimeout clears timeout on success | Fast mock fetch. No timeout error thrown. |
| fetchWithTimeout propagates non-abort errors | Mock fetch throws network error. Error propagated as-is (not wrapped as timeout). |

**Key:** Mock `delay` method to return `Promise.resolve()` immediately so retry tests run fast.

### 3. Template Tests

**`uptime.test.ts`** — tests for `buildUptimeNotificationPayload`:

| Test | Asserts |
|------|---------|
| Down notification | `kind: "down"` produces title "Uptime: {siteLabel} is down", priority "urgent" |
| Recovered notification | `kind: "recovered"` produces title "...is back up", priority "normal" |
| Message contains URL and time | Message includes `URL: {url}` and `Checked at:` with formatted date |
| HTTP code in message | Message includes `HTTP: {httpCode}` |
| Response timing in message | `totalMs: 500, ttfbMs: 100` produces `Response: TTFB 100 ms, total 500 ms` |
| Omits response when undefined | No totalMs/ttfbMs => no "Response:" line |
| Probe region in message | `probeRegion: "us-east-1"` produces `Region: us-east-1` |
| SSL valid line | `sslValid: true, sslExpiryMs: <future>` produces `SSL: valid (expires ...)` |
| SSL invalid line | `sslValid: false` produces `SSL: invalid` |
| SSL omitted when undefined | No sslValid => no SSL line |
| Error line only on down | `kind: "down", error: "Connection refused"` produces `Error: Connection refused` |
| Error line omitted on recovered | `kind: "recovered"` with error => no Error line |
| Metadata keys | Output metadata contains `template: "uptime"`, `kind`, `siteLabel`, `url`, `checkedAt`, `httpCode` |
| Optional metadata only when present | `probeRegion` absent => not in metadata. Present => in metadata. Same for totalMs, ttfbMs, sslValid, sslExpiryMs. |

**`anomaly.test.ts`** — tests for `buildAnomalyNotificationPayload`:

| Test | Asserts |
|------|---------|
| Spike critical | `kind: "spike", severity: "critical"` => title starts with "↑", contains "Critical", priority "urgent" |
| Drop warning | `kind: "drop", severity: "warning"` => title starts with "↓", contains "Warning", priority "high" |
| Metric labels | `metric: "pageviews"` => title contains "Pageviews". `metric: "errors"` => "Errors". Unknown metric => raw string. |
| Custom event name | `eventName: "checkout"` => title contains "checkout (custom event)" |
| Message content | Includes percentage, current/baseline values (compact format), z-score, period range |
| Dashboard URL in message | `dashboardUrl` present => message contains "View details: {url}". Absent => no link. |
| Metadata keys | Contains template, kind, metric, siteLabel, severity, currentValue, baselineValue, percentChange, zScore, periodStart, periodEnd |
| Optional metadata | eventName/dashboardUrl only in metadata when provided |

### 4. Client Tests

Tests for `NotificationClient` orchestration. Uses mock providers (not real providers) to isolate client logic.

**Strategy:** Create mock `NotificationProvider` objects with mock `send` functions, then use dependency injection — but `NotificationClient` constructs providers internally via config. Two options:

- **Option A:** Test via config, mocking `global.fetch` so providers work but we focus on client behavior.
- **Option B:** After construction, replace `providers` map entries with mocks.

**Use Option A** — mock fetch globally, construct client with minimal configs pointing at dummy URLs, and assert on orchestration behavior.

| Test | Asserts |
|------|---------|
| send() uses defaultChannels | Config with `defaultChannels: ["slack", "discord"]`. `send(payload)` calls fetch twice. |
| send() with options.channels overrides defaults | `defaultChannels: ["slack"]`, but `send(payload, { channels: ["discord"] })`. Only Discord fetch called. |
| send() returns empty array when no channels | No defaultChannels, no options.channels. Returns `[]`. |
| send() returns error for unconfigured channel | `send(payload, { channels: ["telegram"] })` but telegram not configured. Returns `[{ success: false, channel: "telegram", error: "...not configured" }]`. |
| send() parallel — one failure doesn't block others | Mock: Slack fetch returns 500, Discord returns 200. Both results returned. Discord is success, Slack is failure. |
| send() parallel — exception in provider caught | Mock: Slack fetch throws (network error). Returns result with `success: false` and error message. |
| sendToChannel() success | `sendToChannel("slack", payload)` returns success result. |
| sendToChannel() unconfigured channel | Returns `{ success: false, error: "...not configured" }`. |
| hasChannel() | `hasChannel("slack")` true when configured, false when not. |
| getConfiguredChannels() | Returns array of configured channel names. |
| Default timeout/retries propagate | Verify that provider-level defaults are applied (test indirectly via retry behavior). |

### 5. Helper Tests

Tests for one-off `send*` functions in `helpers.ts`. These are thin wrappers that create a provider and call `send()`. Mock fetch, verify correct provider is instantiated and payload is forwarded.

| Test | Asserts |
|------|---------|
| sendSlackWebhook | Calls fetch with correct URL, returns NotificationResult |
| sendSlackWebhook with options | channel, username, icon appear in payload |
| sendDiscordWebhook | Correct URL, returns NotificationResult |
| sendEmail | Calls sendEmailAction, passes payload with metadata.to |
| sendWebhook | Correct URL/method/headers |
| sendWebhook with transform | transformPayloadAction is applied to body |
| sendTeamsWebhook | Correct URL, returns NotificationResult |
| sendTelegramMessage | URL contains botToken, payload contains chatId |
| sendGoogleChatWebhook | Correct URL, returns NotificationResult |

---

## Integration Tests

### Webhook Receiver (`webhook-receiver.ts`)

A minimal Bun HTTP server that captures incoming requests for inspection:

```ts
interface CapturedRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  timestamp: number;
}

class WebhookReceiver {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private requests: CapturedRequest[] = [];

  async start(port = 0): Promise<number> {
    // port 0 = random available port
    this.server = Bun.serve({
      port,
      fetch: async (req) => {
        const body = await req.json().catch(() => null);
        this.requests.push({
          method: req.method,
          url: new URL(req.url).pathname,
          headers: Object.fromEntries(req.headers.entries()),
          body,
          timestamp: Date.now(),
        });
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    });
    return this.server.port;
  }

  getRequests(): CapturedRequest[] { return this.requests; }
  getLastRequest(): CapturedRequest | undefined { return this.requests.at(-1); }
  clear(): void { this.requests = []; }
  async stop(): Promise<void> { this.server?.stop(true); }
}
```

Features:
- Binds to port 0 (OS-assigned random port) to avoid conflicts
- Captures method, URL path, headers, parsed JSON body, timestamp
- `clear()` resets between tests
- `stop()` for cleanup in afterAll

### Integration Test File (`providers.integration.test.ts`)

Spins up the receiver, creates real provider instances pointing at `http://localhost:{port}`, sends real notifications, and asserts on captured HTTP requests.

```ts
let receiver: WebhookReceiver;
let baseUrl: string;

beforeAll(async () => {
  receiver = new WebhookReceiver();
  const port = await receiver.start();
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await receiver.stop();
});

beforeEach(() => {
  receiver.clear();
});
```

**Test cases:**

| Test | Asserts |
|------|---------|
| Slack sends correct HTTP request | SlackProvider with `webhookUrl: baseUrl`. Send payload. Verify captured request: POST, Content-Type json, body has blocks array. |
| Discord sends correct HTTP request | Same pattern. Body has embeds array with color and fields. |
| Teams sends Adaptive Card | Body has `type: "message"`, attachments with AdaptiveCard content. |
| Telegram skipped | TelegramProvider hardcodes `https://api.telegram.org/bot{token}/sendMessage` — no configurable base URL. Fully covered by unit tests; no integration test needed. |
| Google Chat sends card format | Body has `cards` array with header and sections. |
| Webhook sends with custom method | WebhookProvider with `method: "PUT"`. Captured request method is PUT. |
| Webhook applies transform | `transformPayloadAction` returns custom object. Captured body matches transformed output. |
| Email calls injected function | EmailProvider with mock sendEmailAction pointing at receiver. Verify mock was called with correct EmailPayload (no HTTP to receiver for email). |
| NotificationClient multi-channel | Client with slack + discord pointing at receiver. `send()` produces 2 captured requests. |
| Retry actually retries over HTTP | Receiver returns 500 on first request, 200 on second (stateful). Provider with `retries: 1` succeeds. 2 captured requests total. |
| Timeout triggers on slow response | Receiver adds 200ms delay to response. Provider with `timeout: 50`. Result has `success: false`, error mentions timeout. |

For the retry test, the receiver needs a stateful mode:

```ts
// Add to WebhookReceiver:
private failNextN = 0;
failNext(n: number): void { this.failNextN = n; }

// In fetch handler:
if (this.failNextN > 0) {
  this.failNextN--;
  // Still capture the request
  this.requests.push({ ... });
  return new Response("error", { status: 500 });
}
```

For the timeout test:

```ts
private responseDelayMs = 0;
setResponseDelay(ms: number): void { this.responseDelayMs = ms; }

// In fetch handler, before returning:
if (this.responseDelayMs > 0) {
  await Bun.sleep(this.responseDelayMs);
}
```

---

## Test Running

From monorepo root:
- `cd packages/notifications && bun test` — runs unit tests only
- `cd packages/notifications && bun run test:integration` — runs integration tests

From root with turbo:
- Add `"test"` task to notifications package in turbo pipeline (already exists for other packages)

---

## Estimated Test Count

| Area | Files | Tests |
|------|-------|-------|
| Provider unit tests (7 providers) | 7 | ~70 |
| Base provider | 1 | ~10 |
| Templates | 2 | ~25 |
| Client orchestration | 1 | ~11 |
| Helpers | 1 | ~9 |
| Integration | 1 | ~10 |
| **Total** | **13** | **~135** |

## Non-Goals

- No contract/schema validation against external APIs (Slack Block Kit schema, etc.)
- No visual UI for inspecting webhooks — the integration test receiver is sufficient
- No real E2E tests hitting actual Slack/Discord/Telegram services
- No snapshot tests — explicit assertions are more maintainable for this package
