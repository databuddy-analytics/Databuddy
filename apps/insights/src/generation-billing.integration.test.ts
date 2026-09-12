import "@databuddy/test/env";
import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { db, eq, inArray, shutdownPostgres, sql } from "@databuddy/db";
import {
	analyticsInsights,
	insightObservations,
	insightRunEffects,
	insightRunItems,
	insightRuns,
	investigationCharges,
	organization,
	websites,
} from "@databuddy/db/schema";
import * as execution from "@databuddy/ai/agents/execution";
import { summarizeAgentUsage } from "@databuddy/ai/lib/usage-telemetry";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import { randomUUIDv7 } from "bun";
import * as agent from "./agent";
import * as billing from "./investigation-billing";
import * as delivery from "./delivery";
import { prepareInvestigation } from "./investigation";
import { freezeInsightRunCandidatePlan } from "./run-candidate-plan";
import { createEvidenceSnapshot } from "./evidence-snapshot";
import { loadInvestigationHistory } from "./observations";
import * as detection from "./detection";
import * as definitions from "./funnel-detection";
import * as routes from "./route-health-detection";
import * as context from "./business-context";
import * as selection from "./business-aware-selection";

const integration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integration("native generation fixed-unit persistence", () => {
	beforeAll(async () => {
		await db.execute(sql`select 1`);
	}, 15_000);
	const ids: string[] = [];
	const requests: Record<string, unknown>[] = [];
	const originalSecret = process.env.AUTUMN_SECRET_KEY;
	let complete = true;
	let interrupting = false;
	let fail = false;
	let providerUnavailable = false;
	let denyReservation = false;
	let calls = 0;
	let detected: detection.DetectedSignal[] = [];
	const usage = {
		inputTokens: 1000,
		outputTokens: 100,
		totalTokens: 1100,
		inputTokenDetails: {
			noCacheTokens: 1000,
			cacheReadTokens: 0,
			cacheWriteTokens: 0,
		},
		outputTokenDetails: { textTokens: 100, reasoningTokens: 0 },
	};
	process.env.AUTUMN_SECRET_KEY = "synthetic-generation-only";
	const mode = spyOn(billing, "resolveInvestigationBilling").mockResolvedValue({
		mode: "fixed",
		customerId: "synthetic-customer",
	});
	const access = spyOn(billing, "canRunInvestigation").mockResolvedValue(false);
	const detect = spyOn(detection, "detectSignals").mockImplementation(
		async () => detected
	);
	const goals = spyOn(definitions, "detectFunnelGoalSignals").mockResolvedValue(
		[]
	);
	const health = spyOn(routes, "detectRouteHealthSignals").mockResolvedValue(
		[]
	);
	const profile = spyOn(
		context,
		"loadWebsiteBusinessProfile"
	).mockResolvedValue({
		capturedAt: "2026-09-09T00:00:00.000Z",
		status: "ready",
		sources: [
			{
				id: "synthetic-profile",
				kind: "team_reply",
				observedAt: "2026-09-09T00:00:00.000Z",
				content: "Checkout is the primary outcome.",
			},
		],
		issues: [],
	});
	const recall = spyOn(
		context,
		"recallWebsiteBusinessContext"
	).mockResolvedValue({
		capturedAt: "2026-09-09T00:00:00.000Z",
		status: "disabled",
		sources: [],
		issues: [],
	});
	const choose = spyOn(
		selection,
		"chooseInvestigationSignals"
	).mockRejectedValue(new Error("Selection must not run without paid access"));
	const telemetry = spyOn(execution, "trackAgentUsage").mockImplementation(
		(input) => summarizeAgentUsage(input.modelId, input.usage)
	);
	const tokenDebit = spyOn(
		execution,
		"trackAgentUsageAndBill"
	).mockRejectedValue(
		new Error("A fixed investigation must not debit token credits")
	);
	const prepareDelivery = spyOn(
		delivery,
		"prepareInsightSlackEffects"
	).mockImplementation(async (input) => [
		{
			effectKey: `synthetic:${input.insight.id}`,
			payload: { text: "Synthetic completed investigation", blocks: [] },
		},
	]);
	const deliver = spyOn(
		delivery,
		"deliverInsightSlackEffect"
	).mockResolvedValue("synthetic-delivery-receipt");
	const runAgent = spyOn(agent, "runInsightAgent").mockImplementation(
		async (input) => {
			calls += 1;
			if (fail)
				throw new agent.InsightAgentExecutionError({
					cause: new Error("Synthetic model failure"),
					modelId: "openai/gpt-5.6-luna",
					usage,
					toolCallCount: 1,
				});
			const snapshot = createEvidenceSnapshot({
				organizationId: input.appContext.organizationId ?? "",
				websiteId: input.appContext.websiteId ?? "",
				capturedAt:
					input.appContext.currentDateTime ?? new Date().toISOString(),
				signal: input.signal,
				evidence: input.evidence,
				reads: [],
				descriptions: {},
			});
			snapshot.completion = complete ? "complete" : "incomplete";
			return {
				modelId: "openai/gpt-5.6-luna",
				usage,
				toolCallCount: 1,
				completion: complete ? "complete" : undefined,
				snapshot,
				outcome: {
					title: "Checkout comparison",
					summary: "20 completed checkouts, unchanged.",
					evidence: ["Both periods contain 20 completed checkouts"],
					rootCause: null,
					impact: null,
					publish: interrupting,
					next: interrupting
						? { type: "ask", question: "Which deployment is related?" }
						: { type: "resolve", reason: "No action is needed" },
				},
			};
		}
	);
	const transport = spyOn(globalThis, "fetch").mockImplementation(
		async (request) => {
			if (
				!(request instanceof Request) ||
				new URL(request.url).hostname !== "api.useautumn.com"
			)
				throw new Error("Only the synthetic Autumn transport is permitted");
			const body = (await request.json()) as Record<string, unknown>;
			requests.push(body);
			if (request.url.includes("balances.check"))
				return Response.json({
					allowed: !denyReservation,
					customer_id: "synthetic-customer",
					balance: {
						feature_id: INVESTIGATION_USAGE.featureId,
						granted: 1,
						remaining: 0,
						usage: 1,
						unlimited: false,
						overage_allowed: false,
						max_purchase: null,
						next_reset_at: null,
					},
					flag: null,
				});
			if (providerUnavailable)
				return Response.json({ success: true }, { status: 202 });
			return Response.json({ success: true });
		}
	);

	afterAll(async () => {
		for (const mock of [
			mode,
			access,
			detect,
			goals,
			health,
			profile,
			recall,
			choose,
			telemetry,
			tokenDebit,
			prepareDelivery,
			deliver,
			runAgent,
			transport,
		])
			mock.mockRestore();
		if (originalSecret === undefined) delete process.env.AUTUMN_SECRET_KEY;
		else process.env.AUTUMN_SECRET_KEY = originalSecret;
		if (ids.length)
			await db.delete(organization).where(inArray(organization.id, ids));
		await shutdownPostgres();
	});

	async function fixture(metric = "checkout", freeze = true) {
		const organizationId = randomUUIDv7();
		const websiteId = randomUUIDv7();
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		ids.push(organizationId);
		await db.insert(organization).values({
			id: organizationId,
			name: "Synthetic billing",
			slug: organizationId,
			createdAt: new Date(),
		});
		await db.insert(websites).values({
			id: websiteId,
			organizationId,
			domain: "billing.example.invalid",
			settings: { businessContextStartedAt: "2026-09-01T00:00:00.000Z" },
		});
		await db
			.insert(insightRuns)
			.values({ id: runId, organizationId, status: "running" });
		await db.insert(insightRunItems).values({
			id: itemId,
			runId,
			organizationId,
			websiteId,
			queueJobId: `job-${itemId}`,
			status: "running",
		});
		const input = {
			organizationId,
			websiteId,
			runId,
			itemId,
			queueJobId: `job-${itemId}`,
			reason: "manual" as const,
			finalAttempt: true,
			requestedByUserId: null,
			timezone: "UTC",
		};
		const candidate = prepareInvestigation(
			{
				baseline: 20,
				current: 20,
				deltaPercent: 0,
				detectedAt: "2026-09-08",
				direction: "up",
				label: "Checkout",
				method: "wow",
				metric,
				severity: "info",
			},
			7
		);
		if (freeze)
			await freezeInsightRunCandidatePlan(input, "manual", {
				asOf: "2026-09-09T00:00:00.000Z",
				candidates: [candidate],
			});
		return { ...input, signal: candidate.signal };
	}

	it("makes completed quiet answers readable and charges one unit, independently of publication", async () => {
		const input = await fixture();
		const { generateWebsiteInsights } = await import("./generation");
		const before = calls;
		await generateWebsiteInsights(input);
		await generateWebsiteInsights(input);
		expect(calls - before).toBe(1);
		const [charge] = await db
			.select()
			.from(investigationCharges)
			.where(eq(investigationCharges.runId, input.runId));
		expect(charge?.status).toBe("confirmed");
		expect(charge?.priceCents).toBe(100);
		const [observation] = await db
			.select()
			.from(insightObservations)
			.where(eq(insightObservations.runId, input.runId));
		expect(observation?.outcome.publish).toBe(false);
		expect(observation?.snapshot?.completion).toBe("complete");
		expect(observation?.insightId).toBeTruthy();
		expect(
			await db
				.select()
				.from(analyticsInsights)
				.where(eq(analyticsInsights.organizationId, input.organizationId))
		).toHaveLength(1);
		expect(tokenDebit).not.toHaveBeenCalled();
		expect(telemetry).toHaveBeenCalled();
	});

	it("releases missing completion and failed final attempts without a token debit", async () => {
		const { generateWebsiteInsights } = await import("./generation");
		complete = false;
		const incomplete = await fixture();
		await generateWebsiteInsights(incomplete);
		const [charge] = await db
			.select()
			.from(investigationCharges)
			.where(eq(investigationCharges.runId, incomplete.runId));
		expect(charge?.status).toBe("released");
		expect(
			await db
				.select()
				.from(analyticsInsights)
				.where(eq(analyticsInsights.organizationId, incomplete.organizationId))
		).toHaveLength(0);
		fail = true;
		const failed = await fixture();
		await expect(generateWebsiteInsights(failed)).rejects.toThrow(
			"Synthetic model failure"
		);
		const [failedCharge] = await db
			.select()
			.from(investigationCharges)
			.where(eq(investigationCharges.runId, failed.runId));
		expect(failedCharge?.status).toBe("released");
		expect(
			await db
				.select()
				.from(insightObservations)
				.where(eq(insightObservations.runId, failed.runId))
		).toHaveLength(0);
		expect(tokenDebit).not.toHaveBeenCalled();
		fail = false;
		complete = true;
	});

	it("keeps the final-attempt delivery durable through settlement outage and recovers without rerunning the model", async () => {
		const { generateWebsiteInsights } = await import("./generation");
		interrupting = true;
		providerUnavailable = true;
		const input = await fixture();
		const before = calls;
		await generateWebsiteInsights(input);
		const [charge] = await db
			.select()
			.from(investigationCharges)
			.where(eq(investigationCharges.runId, input.runId));
		expect(charge?.status).toBe("confirm_pending");
		const effects = await db
			.select()
			.from(insightRunEffects)
			.where(eq(insightRunEffects.runItemId, input.itemId));
		expect(effects).toHaveLength(1);
		expect(effects[0]?.status).toBe("succeeded");
		providerUnavailable = false;
		await generateWebsiteInsights(input);
		expect(calls - before).toBe(1);
		const [settled] = await db
			.select()
			.from(investigationCharges)
			.where(eq(investigationCharges.runId, input.runId));
		expect(settled?.status).toBe("confirmed");
		expect(requests.filter((request) => request.send_event)).toHaveLength(4);
		expect(tokenDebit).not.toHaveBeenCalled();
	});

	it.each([
		"empty",
		"unavailable",
		"reservation",
	])("includes native saved-check continuations through a %s billing failure", async (availability) => {
		const { generateWebsiteInsights } = await import("./generation");
		interrupting = false;
		const input = await fixture("goal:synthetic-goal", false);
		detected = ["goal:synthetic-goal", "goal:second-goal"].map((metric) => ({
			baseline: 20,
			current: 10,
			deltaPercent: -50,
			detectedAt: "2026-09-08",
			direction: "down",
			label: "Checkout",
			method: "wow",
			metric,
			severity: "info",
		}));
		const at = new Date("2026-09-08T00:00:00.000Z");
		for (const item of detected) {
			const signal = prepareInvestigation(item, 7).signal;
			const insightId = randomUUIDv7();
			await db.insert(analyticsInsights).values({
				id: insightId,
				organizationId: input.organizationId,
				websiteId: input.websiteId,
				title: "Saved repair",
				description: "Known definition repair",
				severity: "info",
				sentiment: "neutral",
				subjectKey: signal.signalKey,
				createdAt: at,
			});
			await db.insert(insightObservations).values({
				id: randomUUIDv7(),
				organizationId: input.organizationId,
				websiteId: input.websiteId,
				insightId,
				signalKey: signal.signalKey,
				signal,
				asOf: at,
				createdAt: at,
				recheckAt: at,
				outcome: {
					title: "Saved repair",
					summary: "Verify the saved goal condition",
					rootCause: "The saved goal target was incorrect",
					impact: null,
					evidence: ["The inspected goal used the previous target"],
					publish: true,
					next: {
						type: "act",
						action: "Correct the goal",
						target: "synthetic-goal",
						verification: "At least 20% conversion",
						execution: null,
						check: {
							metric: "overall_conversion_rate",
							startDate: "2026-09-01",
							endDate: "2026-09-07",
							minimumEntrants: 100,
							threshold: {
								anchor: "prior_baseline",
								comparison: "at_or_above",
								value: 20,
								evidenceRef: { source: "signal" },
							},
						},
					},
				},
			});
		}
		const history = await loadInvestigationHistory({
			organizationId: input.organizationId,
			websiteId: input.websiteId,
			signalKey: input.signal.signalKey,
		});
		expect(history).toHaveLength(1);
		expect(
			agent.savedVerificationCheck({ history, signal: input.signal })
		).toBeTruthy();
		const modeCalls = mode.mock.calls.length;
		if (availability === "unavailable")
			mode.mockRejectedValue(new Error("Billing temporarily unavailable"));
		if (availability === "reservation") {
			denyReservation = true;
			const paid = prepareInvestigation(
				{ ...detected[0]!, metric: "fresh-checkout" },
				7
			);
			await freezeInsightRunCandidatePlan(input, "manual", {
				asOf: "2026-09-09T00:00:00.000Z",
				candidates: [
					paid,
					...detected.map((item) => prepareInvestigation(item, 7)),
				],
			});
		}
		const before = requests.length;
		const beforeCalls = calls;
		if (availability === "reservation") {
			await expect(generateWebsiteInsights(input)).rejects.toThrow();
		} else {
			await generateWebsiteInsights(input);
		}
		expect(mode).toHaveBeenCalledTimes(modeCalls + 1);
		expect(choose).not.toHaveBeenCalled();
		expect(calls - beforeCalls).toBe(2);
		expect(requests).toHaveLength(
			before + (availability === "reservation" ? 1 : 0)
		);
		const charges = await db
			.select()
			.from(investigationCharges)
			.where(eq(investigationCharges.runId, input.runId));
		expect(charges).toHaveLength(availability === "reservation" ? 1 : 0);
		if (availability === "reservation")
			expect(charges[0]?.status).toBe("denied");
		expect(
			await db
				.select()
				.from(insightObservations)
				.where(eq(insightObservations.runId, input.runId))
		).toHaveLength(2);
		denyReservation = false;
		expect(tokenDebit).not.toHaveBeenCalled();
		mode.mockResolvedValue({ mode: "fixed", customerId: "synthetic-customer" });
	});
});
