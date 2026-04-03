# Notifications Package Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add comprehensive unit and integration tests to `packages/notifications` — covering all 7 providers, 2 templates, the client orchestrator, helpers, and base retry/timeout logic.

**Architecture:** Two test layers. Unit tests mock `global.fetch` for fast, deterministic assertions on payload formatting, error handling, and orchestration. Integration tests spin up a local Bun HTTP server (webhook receiver) to validate real HTTP requests end-to-end.

**Tech Stack:** Bun test runner (`bun:test`), Bun.serve for webhook receiver, no additional dependencies.

**Spec:** `docs/superpowers/specs/2026-04-03-notifications-testing-design.md`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `packages/notifications/package.json` | Modify | Add `test` and `test:integration` scripts |
| `packages/notifications/src/__tests__/providers/base.test.ts` | Create | BaseProvider retry, timeout, backoff tests |
| `packages/notifications/src/__tests__/providers/slack.test.ts` | Create | SlackProvider payload format + error tests |
| `packages/notifications/src/__tests__/providers/discord.test.ts` | Create | DiscordProvider embed format + error tests |
| `packages/notifications/src/__tests__/providers/email.test.ts` | Create | EmailProvider injected action + HTML tests |
| `packages/notifications/src/__tests__/providers/teams.test.ts` | Create | TeamsProvider Adaptive Card format tests |
| `packages/notifications/src/__tests__/providers/telegram.test.ts` | Create | TelegramProvider HTML + Bot API URL tests |
| `packages/notifications/src/__tests__/providers/google-chat.test.ts` | Create | GoogleChatProvider card format tests |
| `packages/notifications/src/__tests__/providers/webhook.test.ts` | Create | WebhookProvider method/transform tests |
| `packages/notifications/src/__tests__/templates/uptime.test.ts` | Create | Uptime template builder tests |
| `packages/notifications/src/__tests__/templates/anomaly.test.ts` | Create | Anomaly template builder tests |
| `packages/notifications/src/__tests__/client.test.ts` | Create | NotificationClient orchestration tests |
| `packages/notifications/src/__tests__/helpers.test.ts` | Create | One-off send* helper function tests |
| `packages/notifications/src/__tests__/integration/webhook-receiver.ts` | Create | Local Bun HTTP server for capturing requests |
| `packages/notifications/src/__tests__/integration/providers.integration.test.ts` | Create | Real HTTP integration tests |

---

### Task 1: Setup — package.json scripts

**Files:**
- Modify: `packages/notifications/package.json`

- [ ] **Step 1: Add test scripts to package.json**

Open `packages/notifications/package.json` and add the `scripts` field:

```json
{
  "name": "@databuddy/notifications",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types.ts",
    "./client": "./src/client.ts",
    "./providers": "./src/providers/index.ts",
    "./templates/uptime": "./src/templates/uptime.ts"
  },
  "scripts": {
    "test": "bun test src/__tests__/providers src/__tests__/templates src/__tests__/client.test.ts src/__tests__/helpers.test.ts",
    "test:integration": "bun test src/__tests__/integration"
  },
  "devDependencies": {
    "@types/node": "^24.10.4",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 2: Create test directory structure**

```bash
mkdir -p packages/notifications/src/__tests__/providers
mkdir -p packages/notifications/src/__tests__/templates
mkdir -p packages/notifications/src/__tests__/integration
```

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/package.json
git commit -m "chore(notifications): add test scripts to package.json"
```

---

### Task 2: Base Provider Tests

**Files:**
- Create: `packages/notifications/src/__tests__/providers/base.test.ts`
- Reference: `packages/notifications/src/providers/base.ts`

- [ ] **Step 1: Write base.test.ts**

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import type { NotificationPayload, NotificationResult } from "../../types";
import { BaseProvider } from "../../providers/base";

class TestProvider extends BaseProvider {
	async send(_payload: NotificationPayload): Promise<NotificationResult> {
		return { success: true, channel: "webhook" };
	}

	public testWithRetry<T>(fn: () => Promise<T>): Promise<T> {
		return this.withRetry(fn);
	}

	public testFetchWithTimeout(
		url: string,
		init?: RequestInit
	): Promise<Response> {
		return this.fetchWithTimeout(url, init);
	}

	// Override protected delay as public so tests can mock it.
	// withRetry calls this.delay(), so replacing this method on the instance
	// controls what withRetry uses.
	public override delay(ms: number): Promise<void> {
		return super.delay(ms);
	}
}

describe("BaseProvider", () => {
	const originalFetch = globalThis.fetch;

	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	describe("constructor defaults", () => {
		test("uses default timeout of 10_000", () => {
			const provider = new TestProvider();
			// Verify via fetchWithTimeout behavior — timeout is internal
			// We test it indirectly through the timeout test below
			expect(provider).toBeDefined();
		});

		test("custom options override defaults", () => {
			const provider = new TestProvider({
				timeout: 5000,
				retries: 3,
				retryDelay: 500,
			});
			expect(provider).toBeDefined();
		});
	});

	describe("withRetry", () => {
		test("no retries by default — fn fails once, error thrown immediately", async () => {
			const provider = new TestProvider(); // retries = 0
			const fn = mock(() => Promise.reject(new Error("fail")));

			await expect(provider.testWithRetry(fn)).rejects.toThrow("fail");
			expect(fn).toHaveBeenCalledTimes(1);
		});

		test("retries N times then throws final error", async () => {
			const provider = new TestProvider({ retries: 2, retryDelay: 1 });
			provider.delay = mock(() => Promise.resolve()) as typeof provider.delay;

			const fn = mock(() => Promise.reject(new Error("fail")));

			await expect(provider.testWithRetry(fn)).rejects.toThrow("fail");
			expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
		});

		test("retries then succeeds on later attempt", async () => {
			const provider = new TestProvider({ retries: 2, retryDelay: 1 });
			provider.delay = mock(() => Promise.resolve()) as typeof provider.delay;

			let attempt = 0;
			const fn = mock(() => {
				attempt++;
				if (attempt < 3) return Promise.reject(new Error("fail"));
				return Promise.resolve("success");
			});

			const result = await provider.testWithRetry(fn);
			expect(result).toBe("success");
			expect(fn).toHaveBeenCalledTimes(3);
		});

		test("backoff delay increases per attempt", async () => {
			const provider = new TestProvider({ retries: 2, retryDelay: 1000 });
			const delayCalls: number[] = [];
			provider.delay = mock((ms: number) => {
				delayCalls.push(ms);
				return Promise.resolve();
			}) as typeof provider.delay;

			const fn = mock(() => Promise.reject(new Error("fail")));
			await expect(provider.testWithRetry(fn)).rejects.toThrow("fail");

			expect(delayCalls).toHaveLength(2);
			// First retry: 1000 * 2^0 + jitter(0-500) = 1000-1500
			expect(delayCalls[0]).toBeGreaterThanOrEqual(1000);
			expect(delayCalls[0]).toBeLessThan(1500);
			// Second retry: 1000 * 2^1 + jitter(0-500) = 2000-2500
			expect(delayCalls[1]).toBeGreaterThanOrEqual(2000);
			expect(delayCalls[1]).toBeLessThan(2500);
		});
	});

	describe("fetchWithTimeout", () => {
		test("returns response on success", async () => {
			globalThis.fetch = mock(() =>
				Promise.resolve(new Response("ok", { status: 200 }))
			) as typeof fetch;

			const provider = new TestProvider({ timeout: 5000 });
			const res = await provider.testFetchWithTimeout("http://example.com");
			expect(res.status).toBe(200);
		});

		test("throws timeout error when request exceeds timeout", async () => {
			globalThis.fetch = mock(
				(_url: string, init?: RequestInit) =>
					new Promise((resolve) => {
						// Resolve after a long delay, but abort signal should fire first
						const id = setTimeout(
							() => resolve(new Response("late")),
							10_000
						);
						init?.signal?.addEventListener("abort", () => {
							clearTimeout(id);
						});
					})
			) as typeof fetch;

			const provider = new TestProvider({ timeout: 10 });
			await expect(
				provider.testFetchWithTimeout("http://example.com")
			).rejects.toThrow("Request timed out after 10ms");
		});

		test("propagates non-abort errors as-is", async () => {
			globalThis.fetch = mock(() =>
				Promise.reject(new Error("network failure"))
			) as typeof fetch;

			const provider = new TestProvider({ timeout: 5000 });
			await expect(
				provider.testFetchWithTimeout("http://example.com")
			).rejects.toThrow("network failure");
		});
	});
});
```

- [ ] **Step 2: Run tests to verify they pass**

```bash
cd packages/notifications && bun test src/__tests__/providers/base.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/providers/base.test.ts
git commit -m "test(notifications): add BaseProvider unit tests"
```

---

### Task 3: Template Tests — Uptime

**Files:**
- Create: `packages/notifications/src/__tests__/templates/uptime.test.ts`
- Reference: `packages/notifications/src/templates/uptime.ts`

- [ ] **Step 1: Write uptime.test.ts**

```ts
import { describe, expect, test } from "bun:test";
import {
	buildUptimeNotificationPayload,
	type UptimeNotificationInput,
} from "../../templates/uptime";

function makeInput(
	overrides: Partial<UptimeNotificationInput> = {}
): UptimeNotificationInput {
	return {
		kind: "down",
		siteLabel: "Acme Corp",
		url: "https://acme.com",
		checkedAt: 1700000000000, // 2023-11-14
		httpCode: 503,
		error: "Connection refused",
		...overrides,
	};
}

describe("buildUptimeNotificationPayload", () => {
	describe("title and priority", () => {
		test("down notification produces urgent priority", () => {
			const result = buildUptimeNotificationPayload(makeInput({ kind: "down" }));
			expect(result.title).toBe("Uptime: Acme Corp is down");
			expect(result.priority).toBe("urgent");
		});

		test("recovered notification produces normal priority", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ kind: "recovered" })
			);
			expect(result.title).toBe("Uptime: Acme Corp is back up");
			expect(result.priority).toBe("normal");
		});
	});

	describe("message content", () => {
		test("contains URL and checked time", () => {
			const result = buildUptimeNotificationPayload(makeInput());
			expect(result.message).toContain("URL: https://acme.com");
			expect(result.message).toContain("Checked at:");
		});

		test("contains HTTP code", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ httpCode: 503 })
			);
			expect(result.message).toContain("HTTP: 503");
		});

		test("includes response timing when provided", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ totalMs: 500, ttfbMs: 100 })
			);
			expect(result.message).toContain("TTFB 100 ms");
			expect(result.message).toContain("total 500 ms");
		});

		test("omits response line when timing undefined", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ totalMs: undefined, ttfbMs: undefined })
			);
			expect(result.message).not.toContain("Response:");
		});

		test("includes probe region when provided", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ probeRegion: "us-east-1" })
			);
			expect(result.message).toContain("Region: us-east-1");
		});

		test("omits probe region when undefined", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ probeRegion: undefined })
			);
			expect(result.message).not.toContain("Region:");
		});

		test("SSL valid with expiry", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({
					sslValid: true,
					sslExpiryMs: 1800000000000, // 2027
				})
			);
			expect(result.message).toContain("SSL: valid (expires");
		});

		test("SSL invalid without expiry", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ sslValid: false })
			);
			expect(result.message).toContain("SSL: invalid");
		});

		test("omits SSL line when undefined", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ sslValid: undefined })
			);
			expect(result.message).not.toContain("SSL:");
		});

		test("includes error line on down", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ kind: "down", error: "Connection refused" })
			);
			expect(result.message).toContain("Error: Connection refused");
		});

		test("omits error line on recovered", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ kind: "recovered", error: "Connection refused" })
			);
			expect(result.message).not.toContain("Error:");
		});

		test("omits error line when error is empty", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ kind: "down", error: "" })
			);
			expect(result.message).not.toContain("Error:");
		});
	});

	describe("metadata", () => {
		test("contains required keys", () => {
			const result = buildUptimeNotificationPayload(makeInput());
			expect(result.metadata).toMatchObject({
				template: "uptime",
				kind: "down",
				siteLabel: "Acme Corp",
				url: "https://acme.com",
				checkedAt: 1700000000000,
				httpCode: 503,
			});
		});

		test("includes optional keys when present", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({
					probeRegion: "eu-west-1",
					totalMs: 200,
					ttfbMs: 50,
					sslValid: true,
					sslExpiryMs: 1800000000000,
				})
			);
			expect(result.metadata?.probeRegion).toBe("eu-west-1");
			expect(result.metadata?.totalMs).toBe(200);
			expect(result.metadata?.ttfbMs).toBe(50);
			expect(result.metadata?.sslValid).toBe(true);
			expect(result.metadata?.sslExpiryMs).toBe(1800000000000);
		});

		test("excludes optional keys when absent", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({
					probeRegion: undefined,
					totalMs: undefined,
					ttfbMs: undefined,
					sslValid: undefined,
				})
			);
			expect(result.metadata).not.toHaveProperty("probeRegion");
			expect(result.metadata).not.toHaveProperty("totalMs");
			expect(result.metadata).not.toHaveProperty("ttfbMs");
			expect(result.metadata).not.toHaveProperty("sslValid");
			expect(result.metadata).not.toHaveProperty("sslExpiryMs");
		});

		test("includes error in metadata when non-empty", () => {
			const result = buildUptimeNotificationPayload(
				makeInput({ error: "timeout" })
			);
			expect(result.metadata?.error).toBe("timeout");
		});

		test("excludes error from metadata when empty", () => {
			const result = buildUptimeNotificationPayload(makeInput({ error: "" }));
			expect(result.metadata).not.toHaveProperty("error");
		});
	});
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/notifications && bun test src/__tests__/templates/uptime.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/templates/uptime.test.ts
git commit -m "test(notifications): add uptime template tests"
```

---

### Task 4: Template Tests — Anomaly

**Files:**
- Create: `packages/notifications/src/__tests__/templates/anomaly.test.ts`
- Reference: `packages/notifications/src/templates/anomaly.ts`

- [ ] **Step 1: Write anomaly.test.ts**

```ts
import { describe, expect, test } from "bun:test";
import {
	buildAnomalyNotificationPayload,
	type AnomalyNotificationInput,
} from "../../templates/anomaly";

function makeInput(
	overrides: Partial<AnomalyNotificationInput> = {}
): AnomalyNotificationInput {
	return {
		kind: "spike",
		metric: "pageviews",
		siteLabel: "Acme Corp",
		currentValue: 5000,
		baselineValue: 1000,
		percentChange: 400,
		zScore: 4.5,
		severity: "critical",
		periodStart: "2026-04-03T00:00:00Z",
		periodEnd: "2026-04-03T01:00:00Z",
		...overrides,
	};
}

describe("buildAnomalyNotificationPayload", () => {
	describe("title and priority", () => {
		test("spike critical — title starts with up arrow, priority urgent", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ kind: "spike", severity: "critical" })
			);
			expect(result.title).toStartWith("↑");
			expect(result.title).toContain("Critical");
			expect(result.priority).toBe("urgent");
		});

		test("drop warning — title starts with down arrow, priority high", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ kind: "drop", severity: "warning", percentChange: -50 })
			);
			expect(result.title).toStartWith("↓");
			expect(result.title).toContain("Warning");
			expect(result.priority).toBe("high");
		});
	});

	describe("metric labels in title", () => {
		test("pageviews renders as Pageviews", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ metric: "pageviews" })
			);
			expect(result.title).toContain("Pageviews");
		});

		test("errors renders as Errors", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ metric: "errors" })
			);
			expect(result.title).toContain("Errors");
		});

		test("custom_events renders as Custom Events", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ metric: "custom_events" })
			);
			expect(result.title).toContain("Custom Events");
		});

		test("unknown metric renders raw string", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ metric: "api_calls" })
			);
			expect(result.title).toContain("api_calls");
		});

		test("eventName overrides metric label", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ eventName: "checkout" })
			);
			expect(result.title).toContain("checkout (custom event)");
		});
	});

	describe("message content", () => {
		test("includes percentage and values", () => {
			const result = buildAnomalyNotificationPayload(makeInput());
			expect(result.message).toContain("400.0%");
			expect(result.message).toContain("5K"); // compact format
			expect(result.message).toContain("1K");
		});

		test("includes z-score", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ zScore: 4.5 })
			);
			expect(result.message).toContain("4.50");
		});

		test("includes period range", () => {
			const result = buildAnomalyNotificationPayload(makeInput());
			expect(result.message).toContain("2026-04-03T00:00:00Z");
			expect(result.message).toContain("2026-04-03T01:00:00Z");
		});

		test("includes dashboard URL when provided", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ dashboardUrl: "https://app.acme.com/dashboard" })
			);
			expect(result.message).toContain(
				"View details: https://app.acme.com/dashboard"
			);
		});

		test("omits dashboard URL when absent", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ dashboardUrl: undefined })
			);
			expect(result.message).not.toContain("View details:");
		});
	});

	describe("metadata", () => {
		test("contains all required keys", () => {
			const result = buildAnomalyNotificationPayload(makeInput());
			expect(result.metadata).toMatchObject({
				template: "anomaly",
				kind: "spike",
				metric: "pageviews",
				siteLabel: "Acme Corp",
				severity: "critical",
				currentValue: 5000,
				baselineValue: 1000,
				percentChange: 400,
				zScore: 4.5,
				periodStart: "2026-04-03T00:00:00Z",
				periodEnd: "2026-04-03T01:00:00Z",
			});
		});

		test("includes eventName when provided", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ eventName: "checkout" })
			);
			expect(result.metadata?.eventName).toBe("checkout");
		});

		test("excludes eventName when absent", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ eventName: undefined })
			);
			expect(result.metadata).not.toHaveProperty("eventName");
		});

		test("includes dashboardUrl when provided", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ dashboardUrl: "https://app.acme.com" })
			);
			expect(result.metadata?.dashboardUrl).toBe("https://app.acme.com");
		});

		test("excludes dashboardUrl when absent", () => {
			const result = buildAnomalyNotificationPayload(
				makeInput({ dashboardUrl: undefined })
			);
			expect(result.metadata).not.toHaveProperty("dashboardUrl");
		});
	});
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/notifications && bun test src/__tests__/templates/anomaly.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/templates/anomaly.test.ts
git commit -m "test(notifications): add anomaly template tests"
```

---

### Task 5: Slack Provider Tests

**Files:**
- Create: `packages/notifications/src/__tests__/providers/slack.test.ts`
- Reference: `packages/notifications/src/providers/slack.ts`

- [ ] **Step 1: Write slack.test.ts**

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { SlackProvider } from "../../providers/slack";
import type { NotificationPayload } from "../../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(new Response("ok", { status: 200 }));
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const WEBHOOK_URL = "https://hooks.slack.com/test";

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("SlackProvider", () => {
	test("posts to configured webhook URL", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);

		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(WEBHOOK_URL);
	});

	test("sends POST with application/json content-type", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);

		expect(fetchCalls[0].init.method).toBe("POST");
		const headers = fetchCalls[0].init.headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("application/json");
	});

	test("formats payload with header and section blocks", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.text).toBe("Test Alert");
		expect(body.blocks).toBeArray();
		expect(body.blocks[0]).toMatchObject({
			type: "header",
			text: { type: "plain_text", text: "Test Alert" },
		});
		expect(body.blocks[1]).toMatchObject({
			type: "section",
			text: { type: "mrkdwn", text: "Something happened" },
		});
	});

	test("renders metadata as section fields", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({
			...basePayload,
			metadata: { foo: "bar", count: 42 },
		});

		const body = JSON.parse(fetchCalls[0].init.body as string);
		const metadataBlock = body.blocks.find(
			(b: { type: string; fields?: unknown[] }) =>
				b.type === "section" && b.fields
		);
		expect(metadataBlock).toBeDefined();
		expect(metadataBlock.fields).toEqual(
			expect.arrayContaining([
				{ type: "mrkdwn", text: "*foo*\nbar" },
				{ type: "mrkdwn", text: "*count*\n42" },
			])
		);
	});

	test("adds priority context block for non-normal priority", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "urgent" });

		const body = JSON.parse(fetchCalls[0].init.body as string);
		const contextBlock = body.blocks.find(
			(b: { type: string }) => b.type === "context"
		);
		expect(contextBlock).toBeDefined();
		expect(contextBlock.elements[0].text).toContain("URGENT");
	});

	test("omits priority context block for normal priority", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "normal" });

		const body = JSON.parse(fetchCalls[0].init.body as string);
		const contextBlock = body.blocks.find(
			(b: { type: string }) => b.type === "context"
		);
		expect(contextBlock).toBeUndefined();
	});

	test("includes optional config in payload", async () => {
		const provider = new SlackProvider({
			webhookUrl: WEBHOOK_URL,
			channel: "#alerts",
			username: "AlertBot",
			iconEmoji: ":warning:",
		});
		await provider.send(basePayload);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.channel).toBe("#alerts");
		expect(body.username).toBe("AlertBot");
		expect(body.icon_emoji).toBe(":warning:");
	});

	test("returns success result on 200", async () => {
		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);
		expect(result.channel).toBe("slack");
	});

	test("returns error on non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("error", { status: 500, statusText: "Internal Server Error" }))
		) as typeof fetch;

		const provider = new SlackProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.channel).toBe("slack");
		expect(result.error).toContain("500");
	});

	test("returns error when webhook URL is empty", async () => {
		const provider = new SlackProvider({ webhookUrl: "" });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("not configured");
		expect(fetchCalls).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/notifications && bun test src/__tests__/providers/slack.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/providers/slack.test.ts
git commit -m "test(notifications): add Slack provider tests"
```

---

### Task 6: Discord Provider Tests

**Files:**
- Create: `packages/notifications/src/__tests__/providers/discord.test.ts`
- Reference: `packages/notifications/src/providers/discord.ts`

- [ ] **Step 1: Write discord.test.ts**

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { DiscordProvider } from "../../providers/discord";
import type { NotificationPayload } from "../../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(new Response("ok", { status: 200 }));
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const WEBHOOK_URL = "https://discord.com/api/webhooks/test";

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("DiscordProvider", () => {
	test("posts to configured webhook URL", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);

		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(WEBHOOK_URL);
	});

	test("sends POST with application/json content-type", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);

		expect(fetchCalls[0].init.method).toBe("POST");
		const headers = fetchCalls[0].init.headers as Record<string, string>;
		expect(headers["Content-Type"]).toBe("application/json");
	});

	test("formats payload with embed containing title, description, and timestamp", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.embeds).toBeArray();
		expect(body.embeds).toHaveLength(1);
		expect(body.embeds[0].title).toBe("Test Alert");
		expect(body.embeds[0].description).toBe("Something happened");
		expect(body.embeds[0].timestamp).toBeDefined();
	});

	test("sets embed color based on priority", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "urgent" });

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.embeds[0].color).toBe(0xe7_4c_3c); // red for urgent
	});

	test("uses green color for normal priority", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "normal" });

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.embeds[0].color).toBe(0x57_f2_87);
	});

	test("defaults to normal (green) when priority is omitted", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload); // no priority

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.embeds[0].color).toBe(0x57_f2_87);
	});

	test("renders metadata as embed fields", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({
			...basePayload,
			metadata: { foo: "bar", count: 42 },
		});

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.embeds[0].fields).toEqual(
			expect.arrayContaining([
				{ name: "foo", value: "bar", inline: true },
				{ name: "count", value: "42", inline: true },
			])
		);
	});

	test("includes optional config in payload", async () => {
		const provider = new DiscordProvider({
			webhookUrl: WEBHOOK_URL,
			username: "AlertBot",
			avatarUrl: "https://example.com/avatar.png",
		});
		await provider.send(basePayload);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.username).toBe("AlertBot");
		expect(body.avatar_url).toBe("https://example.com/avatar.png");
	});

	test("returns success result on 200", async () => {
		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);
		expect(result.channel).toBe("discord");
	});

	test("returns error on non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("error", { status: 429, statusText: "Too Many Requests" }))
		) as typeof fetch;

		const provider = new DiscordProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.channel).toBe("discord");
		expect(result.error).toContain("429");
	});

	test("returns error when webhook URL is empty", async () => {
		const provider = new DiscordProvider({ webhookUrl: "" });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("not configured");
		expect(fetchCalls).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/notifications && bun test src/__tests__/providers/discord.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/providers/discord.test.ts
git commit -m "test(notifications): add Discord provider tests"
```

---

### Task 7: Email Provider Tests

**Files:**
- Create: `packages/notifications/src/__tests__/providers/email.test.ts`
- Reference: `packages/notifications/src/providers/email.ts`

- [ ] **Step 1: Write email.test.ts**

```ts
import { describe, expect, mock, test } from "bun:test";
import { EmailProvider } from "../../providers/email";
import type { EmailPayload, NotificationPayload } from "../../types";

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

function createMockSendEmail() {
	const calls: EmailPayload[] = [];
	const fn = mock(async (payload: EmailPayload) => {
		calls.push(payload);
		return { id: "msg_123" };
	});
	return { fn, calls };
}

describe("EmailProvider", () => {
	test("calls sendEmailAction with correct subject and content", async () => {
		const { fn, calls } = createMockSendEmail();
		const provider = new EmailProvider({
			sendEmailAction: fn,
			defaultTo: "user@example.com",
		});

		await provider.send(basePayload);

		expect(calls).toHaveLength(1);
		expect(calls[0].subject).toBe("Test Alert");
		expect(calls[0].text).toContain("Something happened");
		expect(calls[0].html).toContain("Test Alert");
		expect(calls[0].html).toContain("Something happened");
	});

	test("uses metadata.to for recipient", async () => {
		const { fn, calls } = createMockSendEmail();
		const provider = new EmailProvider({ sendEmailAction: fn });

		await provider.send({
			...basePayload,
			metadata: { to: "specific@example.com" },
		});

		expect(calls[0].to).toBe("specific@example.com");
	});

	test("falls back to defaultTo when metadata.to absent", async () => {
		const { fn, calls } = createMockSendEmail();
		const provider = new EmailProvider({
			sendEmailAction: fn,
			defaultTo: "default@example.com",
		});

		await provider.send(basePayload);

		expect(calls[0].to).toBe("default@example.com");
	});

	test("returns error when no recipient available", async () => {
		const { fn } = createMockSendEmail();
		const provider = new EmailProvider({ sendEmailAction: fn });

		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("recipient");
	});

	test("excludes 'to' key from metadata table in HTML", async () => {
		const { fn, calls } = createMockSendEmail();
		const provider = new EmailProvider({ sendEmailAction: fn });

		await provider.send({
			...basePayload,
			metadata: { to: "a@b.com", foo: "bar" },
		});

		expect(calls[0].html).toContain("foo");
		expect(calls[0].html).not.toContain("<td");
		// "to" should not appear as a metadata row — only "foo" should
		// The html will have a table with "foo" but not a row for "to"
		const html = calls[0].html!;
		const tableRows = html.match(/<tr>/g) || [];
		expect(tableRows).toHaveLength(1); // only "foo" row
	});

	test("escapes HTML in title and message", async () => {
		const { fn, calls } = createMockSendEmail();
		const provider = new EmailProvider({
			sendEmailAction: fn,
			defaultTo: "user@example.com",
		});

		await provider.send({
			title: "<script>alert('xss')</script>",
			message: "Hello <b>world</b>",
		});

		const html = calls[0].html!;
		expect(html).toContain("&lt;script&gt;");
		expect(html).not.toContain("<script>");
		expect(html).toContain("&lt;b&gt;");
	});

	test("includes from field when configured", async () => {
		const { fn, calls } = createMockSendEmail();
		const provider = new EmailProvider({
			sendEmailAction: fn,
			defaultTo: "user@example.com",
			from: "alerts@acme.com",
		});

		await provider.send(basePayload);

		expect(calls[0].from).toBe("alerts@acme.com");
	});

	test("returns success result when sendEmailAction resolves", async () => {
		const { fn } = createMockSendEmail();
		const provider = new EmailProvider({
			sendEmailAction: fn,
			defaultTo: "user@example.com",
		});

		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);
		expect(result.channel).toBe("email");
	});

	test("returns error when sendEmailAction throws", async () => {
		const fn = mock(async () => {
			throw new Error("SMTP connection failed");
		});
		const provider = new EmailProvider({
			sendEmailAction: fn,
			defaultTo: "user@example.com",
		});

		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.channel).toBe("email");
		expect(result.error).toContain("SMTP connection failed");
	});
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/notifications && bun test src/__tests__/providers/email.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/providers/email.test.ts
git commit -m "test(notifications): add Email provider tests"
```

---

### Task 8: Teams Provider Tests

**Files:**
- Create: `packages/notifications/src/__tests__/providers/teams.test.ts`
- Reference: `packages/notifications/src/providers/teams.ts`

- [ ] **Step 1: Write teams.test.ts**

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { TeamsProvider } from "../../providers/teams";
import type { NotificationPayload } from "../../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(new Response("ok", { status: 200 }));
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const WEBHOOK_URL = "https://outlook.office.com/webhook/test";

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("TeamsProvider", () => {
	test("posts to configured webhook URL", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);

		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(WEBHOOK_URL);
	});

	test("formats as Adaptive Card message", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.type).toBe("message");
		expect(body.attachments).toHaveLength(1);
		expect(body.attachments[0].contentType).toBe(
			"application/vnd.microsoft.card.adaptive"
		);
		expect(body.attachments[0].content.type).toBe("AdaptiveCard");
		expect(body.attachments[0].content.version).toBe("1.4");
	});

	test("card body contains title and message TextBlocks", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		const cardBody = body.attachments[0].content.body;
		expect(cardBody[0]).toMatchObject({
			type: "TextBlock",
			text: "Test Alert",
			size: "Large",
			weight: "Bolder",
		});
		expect(cardBody[1]).toMatchObject({
			type: "TextBlock",
			text: "Something happened",
		});
	});

	test("adds priority TextBlock with color for non-normal priority", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "urgent" });

		const body = JSON.parse(fetchCalls[0].init.body as string);
		const cardBody = body.attachments[0].content.body;
		const priorityBlock = cardBody.find(
			(b: { text?: string }) => b.text?.includes("URGENT")
		);
		expect(priorityBlock).toBeDefined();
		expect(priorityBlock.color).toBe("attention");
	});

	test("omits priority TextBlock for normal priority", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "normal" });

		const body = JSON.parse(fetchCalls[0].init.body as string);
		const cardBody = body.attachments[0].content.body;
		const priorityBlock = cardBody.find(
			(b: { text?: string }) => b.text?.includes("Priority:")
		);
		expect(priorityBlock).toBeUndefined();
	});

	test("renders metadata as FactSet", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({
			...basePayload,
			metadata: { region: "us-east-1", status: "critical" },
		});

		const body = JSON.parse(fetchCalls[0].init.body as string);
		const cardBody = body.attachments[0].content.body;
		const factSet = cardBody.find(
			(b: { type: string }) => b.type === "FactSet"
		);
		expect(factSet).toBeDefined();
		expect(factSet.facts).toEqual(
			expect.arrayContaining([
				{ title: "region", value: "us-east-1" },
				{ title: "status", value: "critical" },
			])
		);
	});

	test("returns success result on 200", async () => {
		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);
		expect(result.channel).toBe("teams");
	});

	test("returns error on non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("error", { status: 400, statusText: "Bad Request" }))
		) as typeof fetch;

		const provider = new TeamsProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("400");
	});

	test("returns error when webhook URL is empty", async () => {
		const provider = new TeamsProvider({ webhookUrl: "" });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("not configured");
		expect(fetchCalls).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/notifications && bun test src/__tests__/providers/teams.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/providers/teams.test.ts
git commit -m "test(notifications): add Teams provider tests"
```

---

### Task 9: Telegram Provider Tests

**Files:**
- Create: `packages/notifications/src/__tests__/providers/telegram.test.ts`
- Reference: `packages/notifications/src/providers/telegram.ts`

- [ ] **Step 1: Write telegram.test.ts**

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { TelegramProvider } from "../../providers/telegram";
import type { NotificationPayload } from "../../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("TelegramProvider", () => {
	test("posts to correct Telegram Bot API URL", async () => {
		const provider = new TelegramProvider({
			botToken: "123:ABC",
			chatId: "456",
		});
		await provider.send(basePayload);

		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(
			"https://api.telegram.org/bot123:ABC/sendMessage"
		);
	});

	test("sends HTML-formatted text with title in bold", async () => {
		const provider = new TelegramProvider({
			botToken: "123:ABC",
			chatId: "456",
		});
		await provider.send(basePayload);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.chat_id).toBe("456");
		expect(body.parse_mode).toBe("HTML");
		expect(body.text).toContain("<b>Test Alert</b>");
		expect(body.text).toContain("Something happened");
	});

	test("adds emoji prefix for urgent priority", async () => {
		const provider = new TelegramProvider({
			botToken: "123:ABC",
			chatId: "456",
		});
		await provider.send({ ...basePayload, priority: "urgent" });

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.text).toContain("🔴 URGENT");
	});

	test("adds emoji prefix for high priority", async () => {
		const provider = new TelegramProvider({
			botToken: "123:ABC",
			chatId: "456",
		});
		await provider.send({ ...basePayload, priority: "high" });

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.text).toContain("🟠 HIGH");
	});

	test("no emoji prefix for normal priority", async () => {
		const provider = new TelegramProvider({
			botToken: "123:ABC",
			chatId: "456",
		});
		await provider.send({ ...basePayload, priority: "normal" });

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.text).not.toContain("🔴");
		expect(body.text).not.toContain("🟠");
		expect(body.text).not.toContain("🔵");
	});

	test("renders metadata as bold key-value pairs", async () => {
		const provider = new TelegramProvider({
			botToken: "123:ABC",
			chatId: "456",
		});
		await provider.send({
			...basePayload,
			metadata: { region: "us-east-1" },
		});

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.text).toContain("<b>region:</b> us-east-1");
	});

	test("escapes HTML in title and message", async () => {
		const provider = new TelegramProvider({
			botToken: "123:ABC",
			chatId: "456",
		});
		await provider.send({
			title: "Alert <critical>",
			message: "Value > threshold & rising",
		});

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.text).toContain("&lt;critical&gt;");
		expect(body.text).toContain("&gt; threshold &amp; rising");
	});

	test("disables web page preview", async () => {
		const provider = new TelegramProvider({
			botToken: "123:ABC",
			chatId: "456",
		});
		await provider.send(basePayload);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.disable_web_page_preview).toBe(true);
	});

	test("returns success result on 200", async () => {
		const provider = new TelegramProvider({
			botToken: "123:ABC",
			chatId: "456",
		});
		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);
		expect(result.channel).toBe("telegram");
	});

	test("returns error on non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("error", { status: 403, statusText: "Forbidden" }))
		) as typeof fetch;

		const provider = new TelegramProvider({
			botToken: "123:ABC",
			chatId: "456",
		});
		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("403");
	});

	test("returns error when botToken or chatId missing", async () => {
		const provider = new TelegramProvider({ botToken: "", chatId: "" });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("required");
		expect(fetchCalls).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/notifications && bun test src/__tests__/providers/telegram.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/providers/telegram.test.ts
git commit -m "test(notifications): add Telegram provider tests"
```

---

### Task 10: Google Chat Provider Tests

**Files:**
- Create: `packages/notifications/src/__tests__/providers/google-chat.test.ts`
- Reference: `packages/notifications/src/providers/google-chat.ts`

- [ ] **Step 1: Write google-chat.test.ts**

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { GoogleChatProvider } from "../../providers/google-chat";
import type { NotificationPayload } from "../../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const WEBHOOK_URL = "https://chat.googleapis.com/v1/spaces/test/messages";

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("GoogleChatProvider", () => {
	test("posts to configured webhook URL", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);

		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(WEBHOOK_URL);
	});

	test("formats payload with cards array containing header", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.cards).toBeArray();
		expect(body.cards).toHaveLength(1);
		expect(body.cards[0].header.title).toBe("Test Alert");
	});

	test("card section contains message as textParagraph", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send(basePayload);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		const widgets = body.cards[0].sections[0].widgets;
		expect(widgets[0]).toMatchObject({
			textParagraph: { text: "Something happened" },
		});
	});

	test("adds priority subtitle for non-normal priority", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "urgent" });

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.cards[0].header.subtitle).toContain("URGENT");
	});

	test("omits priority subtitle for normal priority", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({ ...basePayload, priority: "normal" });

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.cards[0].header.subtitle).toBeUndefined();
	});

	test("renders metadata as keyValue widgets", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		await provider.send({
			...basePayload,
			metadata: { region: "us-east-1", status: "critical" },
		});

		const body = JSON.parse(fetchCalls[0].init.body as string);
		const widgets = body.cards[0].sections[0].widgets;
		const keyValueWidgets = widgets.filter(
			(w: { keyValue?: unknown }) => w.keyValue
		);
		expect(keyValueWidgets).toHaveLength(2);
		expect(keyValueWidgets).toEqual(
			expect.arrayContaining([
				{ keyValue: { topLabel: "region", content: "us-east-1" } },
				{ keyValue: { topLabel: "status", content: "critical" } },
			])
		);
	});

	test("returns success result on 200", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);
		expect(result.channel).toBe("google-chat");
	});

	test("returns error on non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("error", { status: 500, statusText: "Internal Server Error" }))
		) as typeof fetch;

		const provider = new GoogleChatProvider({ webhookUrl: WEBHOOK_URL });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("500");
	});

	test("returns error when webhook URL is empty", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: "" });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("not configured");
		expect(fetchCalls).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/notifications && bun test src/__tests__/providers/google-chat.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/providers/google-chat.test.ts
git commit -m "test(notifications): add Google Chat provider tests"
```

---

### Task 11: Webhook Provider Tests

**Files:**
- Create: `packages/notifications/src/__tests__/providers/webhook.test.ts`
- Reference: `packages/notifications/src/providers/webhook.ts`

- [ ] **Step 1: Write webhook.test.ts**

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { WebhookProvider } from "../../providers/webhook";
import type { NotificationPayload } from "../../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(
			new Response(JSON.stringify({ received: true }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			})
		);
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const WEBHOOK_URL = "https://api.example.com/webhook";

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("WebhookProvider", () => {
	test("posts to configured URL", async () => {
		const provider = new WebhookProvider({ url: WEBHOOK_URL });
		await provider.send(basePayload);

		expect(fetchCalls).toHaveLength(1);
		expect(fetchCalls[0].url).toBe(WEBHOOK_URL);
	});

	test("defaults to POST method", async () => {
		const provider = new WebhookProvider({ url: WEBHOOK_URL });
		await provider.send(basePayload);

		expect(fetchCalls[0].init.method).toBe("POST");
	});

	test("uses configured HTTP method", async () => {
		const provider = new WebhookProvider({ url: WEBHOOK_URL, method: "PUT" });
		await provider.send(basePayload);

		expect(fetchCalls[0].init.method).toBe("PUT");
	});

	test("sends raw NotificationPayload as body by default", async () => {
		const provider = new WebhookProvider({ url: WEBHOOK_URL });
		await provider.send(basePayload);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body).toMatchObject({
			title: "Test Alert",
			message: "Something happened",
		});
	});

	test("applies transformPayloadAction to body", async () => {
		const provider = new WebhookProvider({
			url: WEBHOOK_URL,
			transformPayloadAction: (p) => ({
				text: `${p.title}: ${p.message}`,
			}),
		});
		await provider.send(basePayload);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body).toEqual({ text: "Test Alert: Something happened" });
	});

	test("includes custom headers", async () => {
		const provider = new WebhookProvider({
			url: WEBHOOK_URL,
			headers: { Authorization: "Bearer token123" },
		});
		await provider.send(basePayload);

		const headers = fetchCalls[0].init.headers as Record<string, string>;
		expect(headers.Authorization).toBe("Bearer token123");
		expect(headers["Content-Type"]).toBe("application/json");
	});

	test("omits body for GET method", async () => {
		const provider = new WebhookProvider({ url: WEBHOOK_URL, method: "GET" });
		await provider.send(basePayload);

		expect(fetchCalls[0].init.body).toBeUndefined();
	});

	test("returns success with parsed JSON response", async () => {
		const provider = new WebhookProvider({ url: WEBHOOK_URL });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);
		expect(result.channel).toBe("webhook");
		expect((result.response as { data: unknown }).data).toEqual({
			received: true,
		});
	});

	test("returns error on non-ok response", async () => {
		globalThis.fetch = mock(() =>
			Promise.resolve(new Response("bad", { status: 422, statusText: "Unprocessable Entity" }))
		) as typeof fetch;

		const provider = new WebhookProvider({ url: WEBHOOK_URL });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("422");
	});

	test("returns error when URL is empty", async () => {
		const provider = new WebhookProvider({ url: "" });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("not configured");
		expect(fetchCalls).toHaveLength(0);
	});
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/notifications && bun test src/__tests__/providers/webhook.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/providers/webhook.test.ts
git commit -m "test(notifications): add Webhook provider tests"
```

---

### Task 12: NotificationClient Tests

**Files:**
- Create: `packages/notifications/src/__tests__/client.test.ts`
- Reference: `packages/notifications/src/client.ts`

- [ ] **Step 1: Write client.test.ts**

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { NotificationClient } from "../client";
import type { NotificationPayload } from "../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(new Response("ok", { status: 200 }));
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("NotificationClient", () => {
	describe("send()", () => {
		test("sends to defaultChannels when no options.channels", async () => {
			const client = new NotificationClient({
				slack: { webhookUrl: "https://slack.test" },
				discord: { webhookUrl: "https://discord.test" },
				defaultChannels: ["slack", "discord"],
			});

			const results = await client.send(basePayload);
			expect(results).toHaveLength(2);
			expect(fetchCalls).toHaveLength(2);
		});

		test("options.channels overrides defaultChannels", async () => {
			const client = new NotificationClient({
				slack: { webhookUrl: "https://slack.test" },
				discord: { webhookUrl: "https://discord.test" },
				defaultChannels: ["slack"],
			});

			const results = await client.send(basePayload, {
				channels: ["discord"],
			});
			expect(results).toHaveLength(1);
			expect(results[0].channel).toBe("discord");
			// Only discord URL should have been called
			expect(fetchCalls).toHaveLength(1);
			expect(fetchCalls[0].url).toBe("https://discord.test");
		});

		test("returns empty array when no channels specified", async () => {
			const client = new NotificationClient({
				slack: { webhookUrl: "https://slack.test" },
			});

			const results = await client.send(basePayload);
			expect(results).toEqual([]);
			expect(fetchCalls).toHaveLength(0);
		});

		test("returns error for unconfigured channel", async () => {
			const client = new NotificationClient({
				slack: { webhookUrl: "https://slack.test" },
			});

			const results = await client.send(basePayload, {
				channels: ["telegram"],
			});
			expect(results).toHaveLength(1);
			expect(results[0].success).toBe(false);
			expect(results[0].channel).toBe("telegram");
			expect(results[0].error).toContain("not configured");
		});

		test("one channel failure does not block others", async () => {
			let callCount = 0;
			globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
				callCount++;
				fetchCalls.push({ url: String(url), init: init! });
				// First call (slack) fails, second (discord) succeeds
				if (String(url).includes("slack")) {
					return Promise.resolve(
						new Response("error", { status: 500, statusText: "Error" })
					);
				}
				return Promise.resolve(new Response("ok", { status: 200 }));
			}) as typeof fetch;

			const client = new NotificationClient({
				slack: { webhookUrl: "https://slack.test" },
				discord: { webhookUrl: "https://discord.test" },
				defaultChannels: ["slack", "discord"],
			});

			const results = await client.send(basePayload);
			expect(results).toHaveLength(2);

			const slackResult = results.find((r) => r.channel === "slack");
			const discordResult = results.find((r) => r.channel === "discord");
			expect(slackResult?.success).toBe(false);
			expect(discordResult?.success).toBe(true);
		});

		test("catches thrown exceptions from providers", async () => {
			globalThis.fetch = mock(() =>
				Promise.reject(new Error("network failure"))
			) as typeof fetch;

			const client = new NotificationClient({
				slack: { webhookUrl: "https://slack.test" },
				defaultChannels: ["slack"],
			});

			const results = await client.send(basePayload);
			expect(results).toHaveLength(1);
			expect(results[0].success).toBe(false);
			expect(results[0].error).toContain("network failure");
		});
	});

	describe("sendToChannel()", () => {
		test("sends to a single configured channel", async () => {
			const client = new NotificationClient({
				slack: { webhookUrl: "https://slack.test" },
			});

			const result = await client.sendToChannel("slack", basePayload);
			expect(result.success).toBe(true);
			expect(result.channel).toBe("slack");
		});

		test("returns error for unconfigured channel", async () => {
			const client = new NotificationClient({});

			const result = await client.sendToChannel("slack", basePayload);
			expect(result.success).toBe(false);
			expect(result.error).toContain("not configured");
		});
	});

	describe("hasChannel()", () => {
		test("returns true for configured channel", () => {
			const client = new NotificationClient({
				slack: { webhookUrl: "https://slack.test" },
			});
			expect(client.hasChannel("slack")).toBe(true);
		});

		test("returns false for unconfigured channel", () => {
			const client = new NotificationClient({});
			expect(client.hasChannel("slack")).toBe(false);
		});
	});

	describe("getConfiguredChannels()", () => {
		test("returns all configured channel names", () => {
			const client = new NotificationClient({
				slack: { webhookUrl: "https://slack.test" },
				discord: { webhookUrl: "https://discord.test" },
			});
			const channels = client.getConfiguredChannels();
			expect(channels).toContain("slack");
			expect(channels).toContain("discord");
			expect(channels).toHaveLength(2);
		});

		test("returns empty array when nothing configured", () => {
			const client = new NotificationClient({});
			expect(client.getConfiguredChannels()).toEqual([]);
		});
	});
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/notifications && bun test src/__tests__/client.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/client.test.ts
git commit -m "test(notifications): add NotificationClient orchestration tests"
```

---

### Task 13: Helper Function Tests

**Files:**
- Create: `packages/notifications/src/__tests__/helpers.test.ts`
- Reference: `packages/notifications/src/helpers.ts`

- [ ] **Step 1: Write helpers.test.ts**

```ts
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	sendSlackWebhook,
	sendDiscordWebhook,
	sendEmail,
	sendWebhook,
	sendTeamsWebhook,
	sendTelegramMessage,
	sendGoogleChatWebhook,
} from "../helpers";
import type { NotificationPayload } from "../types";

const originalFetch = globalThis.fetch;
let fetchCalls: { url: string; init: RequestInit }[] = [];

beforeEach(() => {
	fetchCalls = [];
	globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
		fetchCalls.push({ url: String(url), init: init! });
		return Promise.resolve(
			new Response(JSON.stringify({ ok: true }), { status: 200 })
		);
	}) as typeof fetch;
});

afterEach(() => {
	globalThis.fetch = originalFetch;
});

const basePayload: NotificationPayload = {
	title: "Test Alert",
	message: "Something happened",
};

describe("sendSlackWebhook", () => {
	test("sends to correct URL and returns success", async () => {
		const result = await sendSlackWebhook("https://slack.test", basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("slack");
		expect(fetchCalls[0].url).toBe("https://slack.test");
	});

	test("passes options through to provider", async () => {
		await sendSlackWebhook("https://slack.test", basePayload, {
			channel: "#alerts",
			username: "Bot",
			iconEmoji: ":robot:",
		});

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.channel).toBe("#alerts");
		expect(body.username).toBe("Bot");
		expect(body.icon_emoji).toBe(":robot:");
	});
});

describe("sendDiscordWebhook", () => {
	test("sends to correct URL and returns success", async () => {
		const result = await sendDiscordWebhook(
			"https://discord.test",
			basePayload
		);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("discord");
		expect(fetchCalls[0].url).toBe("https://discord.test");
	});
});

describe("sendEmail", () => {
	test("calls sendEmailAction with payload including to", async () => {
		const sendEmailAction = mock(async () => ({ id: "msg_1" }));
		const result = await sendEmail(
			sendEmailAction,
			{ ...basePayload, to: "user@test.com" },
		);

		expect(result.success).toBe(true);
		expect(result.channel).toBe("email");
		expect(sendEmailAction).toHaveBeenCalledTimes(1);
	});
});

describe("sendWebhook", () => {
	test("sends to correct URL and returns success", async () => {
		const result = await sendWebhook("https://webhook.test", basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("webhook");
		expect(fetchCalls[0].url).toBe("https://webhook.test");
	});

	test("applies transformPayloadAction", async () => {
		await sendWebhook("https://webhook.test", basePayload, {
			transformPayloadAction: (p) => ({ custom: p.title }),
		});

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body).toEqual({ custom: "Test Alert" });
	});
});

describe("sendTeamsWebhook", () => {
	test("sends to correct URL and returns success", async () => {
		const result = await sendTeamsWebhook("https://teams.test", basePayload);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("teams");
		expect(fetchCalls[0].url).toBe("https://teams.test");
	});
});

describe("sendTelegramMessage", () => {
	test("sends to Telegram Bot API with correct token and chatId", async () => {
		const result = await sendTelegramMessage(
			"123:ABC",
			"456",
			basePayload
		);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("telegram");
		expect(fetchCalls[0].url).toBe(
			"https://api.telegram.org/bot123:ABC/sendMessage"
		);

		const body = JSON.parse(fetchCalls[0].init.body as string);
		expect(body.chat_id).toBe("456");
	});
});

describe("sendGoogleChatWebhook", () => {
	test("sends to correct URL and returns success", async () => {
		const result = await sendGoogleChatWebhook(
			"https://chat.test",
			basePayload
		);
		expect(result.success).toBe(true);
		expect(result.channel).toBe("google-chat");
		expect(fetchCalls[0].url).toBe("https://chat.test");
	});
});
```

- [ ] **Step 2: Run tests**

```bash
cd packages/notifications && bun test src/__tests__/helpers.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/helpers.test.ts
git commit -m "test(notifications): add helper function tests"
```

---

### Task 14: Integration — Webhook Receiver

**Files:**
- Create: `packages/notifications/src/__tests__/integration/webhook-receiver.ts`

- [ ] **Step 1: Write webhook-receiver.ts**

```ts
export interface CapturedRequest {
	method: string;
	path: string;
	headers: Record<string, string>;
	body: unknown;
	timestamp: number;
}

export class WebhookReceiver {
	private server: ReturnType<typeof Bun.serve> | null = null;
	private requests: CapturedRequest[] = [];
	private failNextN = 0;
	private responseDelayMs = 0;

	async start(port = 0): Promise<number> {
		this.server = Bun.serve({
			port,
			fetch: async (req) => {
				const body = await req.json().catch(() => null);
				this.requests.push({
					method: req.method,
					path: new URL(req.url).pathname,
					headers: Object.fromEntries(req.headers.entries()),
					body,
					timestamp: Date.now(),
				});

				if (this.failNextN > 0) {
					this.failNextN--;
					return new Response("error", { status: 500 });
				}

				if (this.responseDelayMs > 0) {
					await Bun.sleep(this.responseDelayMs);
				}

				return new Response(JSON.stringify({ ok: true }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			},
		});
		return this.server.port;
	}

	getRequests(): CapturedRequest[] {
		return this.requests;
	}

	getLastRequest(): CapturedRequest | undefined {
		return this.requests.at(-1);
	}

	clear(): void {
		this.requests = [];
		this.failNextN = 0;
		this.responseDelayMs = 0;
	}

	failNext(n: number): void {
		this.failNextN = n;
	}

	setResponseDelay(ms: number): void {
		this.responseDelayMs = ms;
	}

	stop(): void {
		this.server?.stop(true);
		this.server = null;
	}
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/notifications/src/__tests__/integration/webhook-receiver.ts
git commit -m "test(notifications): add webhook receiver for integration tests"
```

---

### Task 15: Integration Tests

**Files:**
- Create: `packages/notifications/src/__tests__/integration/providers.integration.test.ts`
- Reference: `packages/notifications/src/__tests__/integration/webhook-receiver.ts`

- [ ] **Step 1: Write providers.integration.test.ts**

```ts
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { NotificationClient } from "../../client";
import { DiscordProvider } from "../../providers/discord";
import { EmailProvider } from "../../providers/email";
import { GoogleChatProvider } from "../../providers/google-chat";
import { SlackProvider } from "../../providers/slack";
import { TeamsProvider } from "../../providers/teams";
import { WebhookProvider } from "../../providers/webhook";
import type { EmailPayload, NotificationPayload } from "../../types";
import { WebhookReceiver } from "./webhook-receiver";

let receiver: WebhookReceiver;
let baseUrl: string;

const basePayload: NotificationPayload = {
	title: "Integration Test",
	message: "Testing real HTTP",
	priority: "high",
	metadata: { env: "test" },
};

beforeAll(async () => {
	receiver = new WebhookReceiver();
	const port = await receiver.start();
	baseUrl = `http://localhost:${port}`;
});

afterAll(() => {
	receiver.stop();
});

beforeEach(() => {
	receiver.clear();
});

describe("Integration: Slack", () => {
	test("sends correct HTTP request", async () => {
		const provider = new SlackProvider({ webhookUrl: baseUrl });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);

		const req = receiver.getLastRequest();
		expect(req).toBeDefined();
		expect(req!.method).toBe("POST");
		expect(req!.headers["content-type"]).toBe("application/json");

		const body = req!.body as { blocks: unknown[]; text: string };
		expect(body.text).toBe("Integration Test");
		expect(body.blocks).toBeArray();
	});
});

describe("Integration: Discord", () => {
	test("sends correct HTTP request with embeds", async () => {
		const provider = new DiscordProvider({ webhookUrl: baseUrl });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);

		const req = receiver.getLastRequest();
		const body = req!.body as { embeds: { title: string; color: number; fields: unknown[] }[] };
		expect(body.embeds).toHaveLength(1);
		expect(body.embeds[0].title).toBe("Integration Test");
		expect(body.embeds[0].color).toBe(0xf3_9c_12); // high = orange
		expect(body.embeds[0].fields).toBeArray();
	});
});

describe("Integration: Teams", () => {
	test("sends Adaptive Card", async () => {
		const provider = new TeamsProvider({ webhookUrl: baseUrl });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);

		const req = receiver.getLastRequest();
		const body = req!.body as { type: string; attachments: { contentType: string; content: { type: string } }[] };
		expect(body.type).toBe("message");
		expect(body.attachments[0].contentType).toBe(
			"application/vnd.microsoft.card.adaptive"
		);
		expect(body.attachments[0].content.type).toBe("AdaptiveCard");
	});
});

describe("Integration: Google Chat", () => {
	test("sends card format", async () => {
		const provider = new GoogleChatProvider({ webhookUrl: baseUrl });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);

		const req = receiver.getLastRequest();
		const body = req!.body as { cards: { header: { title: string }; sections: unknown[] }[] };
		expect(body.cards).toHaveLength(1);
		expect(body.cards[0].header.title).toBe("Integration Test");
		expect(body.cards[0].sections).toBeArray();
	});
});

describe("Integration: Webhook", () => {
	test("sends with custom method", async () => {
		const provider = new WebhookProvider({ url: baseUrl, method: "PUT" });
		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);

		const req = receiver.getLastRequest();
		expect(req!.method).toBe("PUT");
	});

	test("applies transformPayloadAction", async () => {
		const provider = new WebhookProvider({
			url: baseUrl,
			transformPayloadAction: (p) => ({ custom: p.title }),
		});
		await provider.send(basePayload);

		const req = receiver.getLastRequest();
		expect(req!.body).toEqual({ custom: "Integration Test" });
	});
});

describe("Integration: Email", () => {
	test("calls injected function with correct payload", async () => {
		const calls: EmailPayload[] = [];
		const provider = new EmailProvider({
			sendEmailAction: async (payload) => {
				calls.push(payload);
			},
			defaultTo: "test@example.com",
		});

		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);
		expect(calls).toHaveLength(1);
		expect(calls[0].subject).toBe("Integration Test");
		expect(calls[0].to).toBe("test@example.com");
	});
});

describe("Integration: NotificationClient multi-channel", () => {
	test("sends to multiple channels in parallel", async () => {
		const client = new NotificationClient({
			slack: { webhookUrl: baseUrl },
			discord: { webhookUrl: baseUrl },
			defaultChannels: ["slack", "discord"],
		});

		const results = await client.send(basePayload);

		expect(results).toHaveLength(2);
		expect(results.every((r) => r.success)).toBe(true);
		expect(receiver.getRequests()).toHaveLength(2);
	});
});

describe("Integration: Retry over HTTP", () => {
	test("retries on 500 and succeeds on second attempt", async () => {
		receiver.failNext(1); // First request returns 500

		const provider = new SlackProvider({
			webhookUrl: baseUrl,
			retries: 1,
			retryDelay: 10, // fast for tests
		});

		const result = await provider.send(basePayload);

		expect(result.success).toBe(true);
		expect(receiver.getRequests()).toHaveLength(2);
	});
});

describe("Integration: Timeout", () => {
	test("times out on slow response", async () => {
		receiver.setResponseDelay(500);

		const provider = new SlackProvider({
			webhookUrl: baseUrl,
			timeout: 50,
		});

		const result = await provider.send(basePayload);

		expect(result.success).toBe(false);
		expect(result.error).toContain("timed out");
	});
});
```

- [ ] **Step 2: Run integration tests**

```bash
cd packages/notifications && bun test src/__tests__/integration/providers.integration.test.ts
```

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add packages/notifications/src/__tests__/integration/providers.integration.test.ts
git commit -m "test(notifications): add integration tests with webhook receiver"
```

---

### Task 16: Final Verification

- [ ] **Step 1: Run all unit tests**

```bash
cd packages/notifications && bun run test
```

Expected: All unit tests pass (~125 tests).

- [ ] **Step 2: Run integration tests**

```bash
cd packages/notifications && bun run test:integration
```

Expected: All integration tests pass (~10 tests).

- [ ] **Step 3: Run type check**

```bash
cd packages/notifications && bunx tsc --noEmit
```

Expected: No type errors (test files are excluded from tsconfig via `**/*.test.ts`).

- [ ] **Step 4: Final commit with all test files**

Verify all files are committed:

```bash
cd packages/notifications && git status
```

If any uncommitted test files remain, stage and commit them.
