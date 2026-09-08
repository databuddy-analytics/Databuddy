import "@databuddy/test/env";
import { describe, expect, it, spyOn } from "bun:test";
import { randomUUIDv7 } from "bun";
import { db, eq, inArray, shutdownPostgres } from "@databuddy/db";
import {
	organization,
	websites,
	insightRuns,
	insightRunItems,
} from "@databuddy/db/schema";
import { getAutumn } from "@databuddy/rpc/autumn";
import { hasTestDb } from "@databuddy/test";
import * as billing from "@databuddy/ai/agents/execution";
import * as context from "./business-context";
import * as detection from "./detection";
import * as definitions from "./funnel-detection";
import * as routes from "./route-health-detection";
import * as selection from "./business-aware-selection";
import * as plans from "./run-candidate-plan";

const integration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" && hasTestDb
		? describe
		: describe.skip;

integration("selection billing across native generation retries", () => {
	it("reuses the charge key before freeze, skips selection after freeze, and separates runs and websites", async () => {
		const organizationId = randomUUIDv7();
		const siteIds = [randomUUIDv7(), randomUUIDv7()];
		const runIds = [randomUUIDv7(), randomUUIDv7()];
		const itemIds = [randomUUIDv7(), randomUUIDv7(), randomUUIDv7()];
		const secret = process.env.AUTUMN_SECRET_KEY;
		process.env.AUTUMN_SECRET_KEY = "synthetic-selection-billing";
		const autumn = getAutumn();
		const requests: string[] = [];
		const charges = new Map<string, number>();
		const track = spyOn(autumn, "track").mockImplementation(
			async (request, options) => {
				const key = new Headers(options?.headers).get("Idempotency-Key");
				expect(key).toBeTruthy();
				if (!key) throw new Error("Missing charge identity");
				requests.push(key);
				expect(request.featureId).toBe("agent_credits");
				expect(request.value).toBeGreaterThan(0);
				// Emulate only the provider's idempotency boundary; billing logic is native.
				if (!charges.has(key)) charges.set(key, request.value ?? 0);
				return {
					customerId: request.customerId,
					value: request.value ?? 0,
					balance: null,
				};
			}
		);
		const check = spyOn(autumn, "check").mockResolvedValue({
			allowed: true,
			customerId: "synthetic-customer",
			balance: null,
			flag: null,
		});
		const customer = spyOn(
			billing,
			"resolveAgentBillingCustomerId"
		).mockResolvedValue("synthetic-customer");
		const metrics = spyOn(detection, "detectSignals").mockResolvedValue(
			["visitors", "sessions"].map((metric) => ({
				metric,
				label: metric,
				baseline: 1000,
				current: 400,
				deltaPercent: -60,
				detectedAt: "2026-09-07",
				direction: "down",
				severity: "warning",
				method: "wow",
			}))
		);
		const goals = spyOn(
			definitions,
			"detectFunnelGoalSignals"
		).mockResolvedValue([]);
		const health = spyOn(routes, "detectRouteHealthSignals").mockResolvedValue(
			[]
		);
		const profile = spyOn(
			context,
			"loadWebsiteBusinessProfile"
		).mockResolvedValue({
			capturedAt: "2026-09-08T00:00:00.000Z",
			status: "ready",
			issues: [],
			sources: [
				{
					id: "synthetic-reply",
					kind: "team_reply",
					observedAt: "2026-09-08T00:00:00.000Z",
					content:
						"The team explains both traffic changes after the docs migration.",
				},
			],
		});
		const choose = spyOn(
			selection,
			"chooseInvestigationSignals"
		).mockResolvedValue({
			modelId: "openai/gpt-5.6-terra",
			usage: {
				inputTokens: 1000,
				outputTokens: 100,
				totalTokens: 1100,
				inputTokenDetails: {
					noCacheTokens: 1000,
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
				},
				outputTokenDetails: { textTokens: 100, reasoningTokens: 0 },
			},
			output: { selections: [] },
		});
		const freeze = plans.freezeInsightRunCandidatePlan;
		const interrupt = spyOn(plans, "freezeInsightRunCandidatePlan")
			.mockRejectedValueOnce(new Error("Interrupted before freeze"))
			.mockImplementationOnce(async (...args) => {
				await freeze(...args);
				throw new Error("Interrupted after freeze");
			});
		try {
			await db.insert(organization).values({
				id: organizationId,
				name: "Synthetic billing retry",
				slug: organizationId,
				createdAt: new Date(),
			});
			await db.insert(websites).values(
				siteIds.map((id, index) => ({
					id,
					organizationId,
					domain: `site-${index}.example.com`,
					settings: { businessContextStartedAt: "2026-09-01T00:00:00.000Z" },
				}))
			);
			await db.insert(insightRuns).values(
				runIds.map((id, index) => ({
					id,
					organizationId,
					status: index === 0 ? ("running" as const) : ("succeeded" as const),
				}))
			);
			const identities = [
				{ websiteId: siteIds[0]!, runId: runIds[0]!, itemId: itemIds[0]! },
				{ websiteId: siteIds[1]!, runId: runIds[0]!, itemId: itemIds[1]! },
				{ websiteId: siteIds[0]!, runId: runIds[1]!, itemId: itemIds[2]! },
			].map((identity) => ({
				...identity,
				organizationId,
				queueJobId: `synthetic-${identity.itemId}`,
			}));
			await db.insert(insightRunItems).values(
				identities.map(({ itemId, ...identity }) => ({
					...identity,
					id: itemId,
					status: "running" as const,
				}))
			);
			// Import after installing source stubs: generation captures sources per module.
			const { generateWebsiteInsights } = await import("./generation");
			const input = {
				...identities[0]!,
				reason: "scheduled" as const,
				timezone: "UTC",
				requestedByUserId: null,
				finalAttempt: false,
			};
			await expect(generateWebsiteInsights(input)).rejects.toThrow(
				"Interrupted before freeze"
			);
			expect(
				await plans.loadInsightRunCandidatePlan(input, "scheduled")
			).toBeNull();
			await expect(generateWebsiteInsights(input)).rejects.toThrow(
				"Interrupted after freeze"
			);
			expect(
				await plans.loadInsightRunCandidatePlan(input, "scheduled")
			).toMatchObject({ candidates: [] });
			expect(requests).toEqual([
				`insights:${input.runId}:${input.websiteId}:selection`,
				`insights:${input.runId}:${input.websiteId}:selection`,
			]);
			expect(charges.size).toBe(1);
			await generateWebsiteInsights(input);
			expect(choose).toHaveBeenCalledTimes(2);
			expect(track).toHaveBeenCalledTimes(2);
			for (const identity of identities.slice(1)) {
				if (identity.runId !== input.runId) {
					await db
						.update(insightRuns)
						.set({ status: "succeeded" })
						.where(eq(insightRuns.id, input.runId));
					await db
						.update(insightRuns)
						.set({ status: "running" })
						.where(eq(insightRuns.id, identity.runId));
				}
				await generateWebsiteInsights({ ...input, ...identity });
			}
			expect(charges.size).toBe(3);
			expect(requests.slice(2)).toEqual(
				identities
					.slice(1)
					.map(
						(identity) =>
							`insights:${identity.runId}:${identity.websiteId}:selection`
					)
			);
		} finally {
			for (const stub of [
				track,
				check,
				customer,
				metrics,
				goals,
				health,
				profile,
				choose,
				interrupt,
			])
				stub.mockRestore();
			if (secret === undefined) delete process.env.AUTUMN_SECRET_KEY;
			else process.env.AUTUMN_SECRET_KEY = secret;
			await db
				.delete(insightRunItems)
				.where(inArray(insightRunItems.id, itemIds));
			await db.delete(insightRuns).where(inArray(insightRuns.id, runIds));
			await db.delete(websites).where(inArray(websites.id, siteIds));
			await db.delete(organization).where(eq(organization.id, organizationId));
			await shutdownPostgres();
		}
	});
});
