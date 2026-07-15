import { describe, expect, it } from "bun:test";

process.env.REDIS_URL ??= "redis://localhost:6379/1";
process.env.BULLMQ_REDIS_URL ??= process.env.REDIS_URL;
process.env.BETTER_AUTH_SECRET ??= "test-auth-secret";
process.env.BETTER_AUTH_URL ??= "http://localhost:3001";

const {
	applyInsightGenerationConfigPatch,
	assertSingleActiveSlackBinding,
	insightGenerationRouter,
} = await import("./insight-generation");

const compatibilityConfig = {
	allowedTools: ["web_metrics", "product_metrics", "ops_context"] as const,
	cooldownHours: 6,
	createdAt: new Date("2026-01-01T00:00:00.000Z"),
	cron: null,
	deliveries: [],
	depth: "standard" as const,
	enabled: false,
	frequency: "daily" as const,
	id: "config-1",
	lastRunAt: null,
	lookbackDays: 7,
	maxInsightsPerWebsite: 3,
	maxSteps: 24,
	maxToolCalls: 16,
	modelTier: "balanced" as const,
	nextRunAt: null,
	organizationId: "org-1",
	source: "organization" as const,
	timezone: "UTC",
	updatedAt: new Date("2026-01-01T00:00:00.000Z"),
	websiteId: null,
};

describe("assertSingleActiveSlackBinding", () => {
	it("accepts exactly one binding", () => {
		expect(() => assertSingleActiveSlackBinding(1)).not.toThrow();
	});

	it("rejects missing and ambiguous bindings", () => {
		expect(() => assertSingleActiveSlackBinding(0)).toThrow(
			"Connect or use the Databuddy Slack app in this channel first"
		);
		expect(() => assertSingleActiveSlackBinding(2)).toThrow(
			"Multiple active Slack connections match this channel"
		);
	});
});

describe("insight generation compatibility contract", () => {
	it("keeps run history and deprecated config metadata available", () => {
		expect(insightGenerationRouter.listRuns["~orpc"].route.path).toBe(
			"/insights/generation/listRuns"
		);
		expect(
			Object.keys(insightGenerationRouter.getConfig["~orpc"].outputSchema.shape)
		).toEqual(
			expect.arrayContaining([
				"allowedTools",
				"cooldownHours",
				"cron",
				"depth",
				"lookbackDays",
				"maxInsightsPerWebsite",
				"maxSteps",
				"maxToolCalls",
				"modelTier",
				"websiteId",
			])
		);
		expect(
			insightGenerationRouter.getConfig["~orpc"].outputSchema.shape.source
				.options
		).toEqual(["default", "organization"]);
	});

	it("accepts and ignores origin/main retired settings", () => {
		const legacyPayload = {
			allowedTools: ["web_metrics", "business_context"],
			cooldownHours: 48,
			cron: "0 3 * * 1",
			depth: "deep",
			enabled: true,
			frequency: "weekly",
			lookbackDays: 30,
			maxInsightsPerWebsite: 2,
			maxSteps: 50,
			maxToolCalls: 50,
			modelTier: "deep",
			organizationId: "org-1",
			timezone: "Europe/Berlin",
		} as const;
		const upsertSchema =
			insightGenerationRouter.upsertConfig["~orpc"].inputSchema;
		const result = applyInsightGenerationConfigPatch(
			compatibilityConfig,
			upsertSchema.parse(legacyPayload)
		);

		expect(result).toEqual({
			...compatibilityConfig,
			enabled: true,
			frequency: "weekly",
			timezone: "Europe/Berlin",
		});
		expect(() =>
			upsertSchema.parse({ ...legacyPayload, maxSteps: 65 })
		).toThrow();
		expect(
			insightGenerationRouter.triggerRun["~orpc"].inputSchema.parse({
				...legacyPayload,
				websiteIds: ["site-1"],
			})
			).toMatchObject(legacyPayload);
	});

	it("ignores retired hourly, custom, and cron scheduling", () => {
		const custom = applyInsightGenerationConfigPatch(compatibilityConfig, {
			cron: "*/15 * * * *",
			frequency: "custom",
		});
		const hourly = applyInsightGenerationConfigPatch(compatibilityConfig, {
			frequency: "hourly",
		});

		expect(custom.frequency).toBe("daily");
		expect(custom.cron).toBeNull();
		expect(hourly.frequency).toBe("daily");
	});

	it("applies supported schedule settings", () => {
		expect(
			applyInsightGenerationConfigPatch(compatibilityConfig, {
				enabled: true,
				frequency: "weekly",
				timezone: "America/New_York",
			})
		).toMatchObject({
			enabled: true,
			frequency: "weekly",
			timezone: "America/New_York",
		});
	});
});
