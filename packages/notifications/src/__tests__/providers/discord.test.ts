import { afterEach, describe, expect, mock, test } from "bun:test";
import type { SafeFetchInit } from "@databuddy/shared/ssrf-guard";

const safeFetchMock = mock(
	(_url: string, _init?: SafeFetchInit) =>
		Promise.resolve(new Response(null, { status: 204 }))
);

mock.module("@databuddy/shared/ssrf-guard", () => ({
	safeFetch: safeFetchMock,
}));

const { buildDiscordEmbed, DiscordProvider } = await import(
	"../../providers/discord"
);

describe("buildDiscordEmbed", () => {
	test("hides internal metadata and keeps user-facing fields", () => {
		const embed = buildDiscordEmbed({
			title: "Anomaly detected",
			message: "Traffic changed.",
			metadata: {
				dashboardUrl: "https://app.databuddy.cc/monitors/1",
				alarmId: "internal-alarm-id",
				template: "anomaly",
				zScore: 7.1,
			},
		});

		expect(embed.fields).toHaveLength(1);
		expect(embed.fields?.[0]?.name).toBe("Dashboard Url");
		expect(JSON.stringify(embed)).not.toContain("internal-alarm-id");
		expect(JSON.stringify(embed)).not.toContain("zScore");
	});

	test("bounds title and description length before calling Discord", () => {
		const embed = buildDiscordEmbed({
			title: "T".repeat(400),
			message: "M".repeat(5000),
		});

		expect(embed.title?.length).toBe(256);
		expect(embed.description?.length).toBe(4096);
	});

	test("caps fields at Discord's 25-field embed limit", () => {
		const embed = buildDiscordEmbed({
			title: "Anomaly detected",
			message: "Traffic changed.",
			metadata: Object.fromEntries(
				Array.from({ length: 100 }, (_, index) => [`field${index}`, index])
			),
		});

		expect(embed.fields).toHaveLength(25);
	});

	test("only surfaces a color and priority footer for elevated priority", () => {
		const normal = buildDiscordEmbed({
			title: "Site alert",
			message: "The site is unavailable.",
			priority: "normal",
		});
		expect(normal.color).toBeUndefined();
		expect(normal.footer).toBeUndefined();

		const urgent = buildDiscordEmbed({
			title: "Site alert",
			message: "The site is unavailable.",
			priority: "urgent",
		});
		expect(urgent.color).toBeDefined();
		expect(urgent.footer?.text).toBe("Priority: URGENT");
	});
});

describe("DiscordProvider", () => {
	afterEach(() => {
		safeFetchMock.mockClear();
		safeFetchMock.mockImplementation((_url: string, _init?: SafeFetchInit) =>
			Promise.resolve(new Response(null, { status: 204 }))
		);
	});

	test("returns a failed result when no webhook URL is configured", async () => {
		const provider = new DiscordProvider({ webhookUrl: "" });
		const result = await provider.send({ title: "t", message: "m" });

		expect(result).toEqual({
			success: false,
			channel: "discord",
			error: "Discord webhook URL not configured",
		});
		expect(safeFetchMock).not.toHaveBeenCalled();
	});

	test("posts an embed payload and reports success on a 204 response", async () => {
		const provider = new DiscordProvider({
			webhookUrl: "https://discord.com/api/webhooks/123/token",
		});

		const result = await provider.send({
			title: "Site alert",
			message: "The site is unavailable.",
		});

		expect(result.success).toBe(true);
		expect(result.channel).toBe("discord");
		expect(safeFetchMock).toHaveBeenCalledTimes(1);

		const [url, init] = safeFetchMock.mock.calls[0] as [string, SafeFetchInit];
		expect(url).toBe("https://discord.com/api/webhooks/123/token");
		const body = JSON.parse(init.body as string);
		expect(body.embeds[0].title).toBe("Site alert");
	});

	test("returns a failed result when Discord responds with an error status", async () => {
		safeFetchMock.mockImplementationOnce(() =>
			Promise.resolve(new Response("invalid webhook", { status: 404 }))
		);

		const provider = new DiscordProvider({
			webhookUrl: "https://discord.com/api/webhooks/123/token",
		});

		const result = await provider.send({ title: "t", message: "m" });

		expect(result.success).toBe(false);
		expect(result.channel).toBe("discord");
		expect(result.error).toContain("Discord API error: 404");
	});
});
