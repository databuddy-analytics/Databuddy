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
			const results = await client.send(basePayload, { channels: ["discord"] });
			expect(results).toHaveLength(1);
			expect(results[0].channel).toBe("discord");
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
			const results = await client.send(basePayload, { channels: ["telegram"] });
			expect(results).toHaveLength(1);
			expect(results[0].success).toBe(false);
			expect(results[0].channel).toBe("telegram");
			expect(results[0].error).toContain("not configured");
		});

		test("one channel failure does not block others", async () => {
			globalThis.fetch = mock((url: string | URL | Request, init?: RequestInit) => {
				fetchCalls.push({ url: String(url), init: init! });
				if (String(url).includes("slack")) {
					return Promise.resolve(new Response("error", { status: 500, statusText: "Error" }));
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

	describe("default config propagation", () => {
		test("default retries propagate to providers", async () => {
			let fetchCallCount = 0;
			globalThis.fetch = mock(() => {
				fetchCallCount++;
				return Promise.reject(new Error("fail"));
			}) as typeof fetch;

			const client = new NotificationClient({
				slack: { webhookUrl: "https://slack.test" },
				defaultRetries: 2,
				defaultRetryDelay: 1,
				defaultChannels: ["slack"],
			});

			const results = await client.send(basePayload);
			expect(results).toHaveLength(1);
			expect(results[0].success).toBe(false);
			// 1 initial + 2 retries = 3 fetch calls
			expect(fetchCallCount).toBe(3);
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
