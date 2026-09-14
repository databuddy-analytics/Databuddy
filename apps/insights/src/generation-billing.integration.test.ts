import "@databuddy/test/env";
import { afterAll, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import { z } from "zod";
import { db, eq, inArray, shutdownPostgres, sql } from "@databuddy/db";
import {
	analyticsInsights,
	insightObservations,
	insightRunEffects,
	insightRunItems,
	insightRuns,
	organization,
	websites,
} from "@databuddy/db/schema";
import * as execution from "@databuddy/ai/agents/execution";
import { summarizeAgentUsage } from "@databuddy/ai/lib/usage-telemetry";
import { INVESTIGATION_USAGE } from "@databuddy/shared/billing";
import { investigationOutcomeSchema } from "@databuddy/shared/insights";
import { randomUUIDv7 } from "bun";
import * as agent from "./agent";
import * as billing from "./investigation-billing";
import * as delivery from "./delivery";
import { prepareInvestigation } from "./investigation";
import { freezeInsightRunCandidatePlan } from "./run-candidate-plan";
import { recoverStaleInsightRuns } from "./recovery";
import { INSIGHTS_GENERATE_WEBSITE_JOB_NAME } from "@databuddy/redis";
import { createEvidenceSnapshot } from "./evidence-snapshot";
import { loadInvestigationHistory } from "./observations";
import * as detection from "./detection";
import * as definitions from "./funnel-detection";
import * as routes from "./route-health-detection";
import * as context from "./business-context";
import * as selection from "./business-aware-selection";

const reserveRequestSchema = z.object({
	customer_id: z.literal("synthetic-customer"),
	feature_id: z.literal(INVESTIGATION_USAGE.featureId),
	required_balance: z.literal(1),
	send_event: z.literal(true),
	lock: z.object({
		enabled: z.literal(true),
		lock_id: z.string().min(1),
		expires_at: z.number(),
	}),
});
const finalizeRequestSchema = z.object({
	lock_id: z.string().min(1),
	action: z.enum(["confirm", "release"]),
});

const integration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" ? describe : describe.skip;

integration("native generation fixed-unit persistence", () => {
	beforeAll(async () => {
		await db.execute(sql`select 1`);
	}, 15_000);
	const ids: string[] = [];
	const requests: {
		body: z.infer<typeof reserveRequestSchema> | z.infer<typeof finalizeRequestSchema>;
		key: string | null;
	}[] = [];
	// This state belongs only to the synthetic provider, never to application storage.
	const holds = new Map<string, { expiresAt: number; state: "held" | "confirmed" | "released" }>();
	const reservationKeys = new Set<string>();
	const reservationsSince = (index: number) => requests.slice(index).flatMap(({ body, key }) =>
		"lock" in body ? [{ ...body, key }] : []
	);
	const actionsSince = (index: number) => requests.slice(index).map(({ body }) =>
		"action" in body ? body.action : "reserve"
	);
	const originalSecret = process.env.AUTUMN_SECRET_KEY;
	let complete = true;
	let interrupting = false;
	let fail = false;
	let providerUnavailable = false;
	let loseFinalizeReceipt = false;
	let ambiguousReservation = false;
	let monthlyAllowance: number | null = null;
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
			if (!(request instanceof Request) || new URL(request.url).hostname !== "api.useautumn.com")
				throw new Error("Only the synthetic Autumn transport is permitted");
			const key = request.headers.get("Idempotency-Key");
			if (request.url.includes("balances.check")) {
				const body = reserveRequestSchema.parse(await request.json());
				requests.push({ body, key });
				expect(key).toBe(`${body.lock.lock_id}:reserve`);
				if (!key) throw new Error("Missing native reservation idempotency key");
				if (reservationKeys.has(key))
					return Response.json({ message: "duplicate idempotency key" }, { status: 409 });
				reservationKeys.add(key);
				if (!denyReservation)
					holds.set(body.lock.lock_id, { expiresAt: body.lock.expires_at, state: "held" });
				const granted = monthlyAllowance ?? 1;
				const resetsAt = monthlyAllowance === null ? null : Date.now() + 30 * 86_400_000;
				return Response.json({
					allowed: !denyReservation,
					customer_id: "synthetic-customer",
					balance: {
						feature_id: INVESTIGATION_USAGE.featureId,
						granted,
						remaining: monthlyAllowance === null ? 0 : -1,
						usage: monthlyAllowance === null ? 1 : granted + 1,
						unlimited: false,
						overage_allowed: monthlyAllowance !== null,
						max_purchase: null,
						next_reset_at: resetsAt,
						breakdown: [{
							id: "synthetic-grant", plan_id: "synthetic-plan", included_grant: granted,
							prepaid_grant: 0, remaining: monthlyAllowance === null ? 0 : -1,
							usage: monthlyAllowance === null ? 1 : granted + 1, unlimited: false,
							reset: resetsAt === null ? null : { interval: "month", resets_at: resetsAt },
							expires_at: null,
							price: monthlyAllowance === null ? null : {
								amount: 1, billing_units: 1, billing_method: "usage_based", max_purchase: null,
							},
						}],
					},
					flag: null,
				}, { status: ambiguousReservation ? 202 : 200 });
			}
			if (!request.url.includes("balances.finalize")) throw new Error("Unexpected native Autumn endpoint");
			const body = finalizeRequestSchema.parse(await request.json());
			requests.push({ body, key });
			if (providerUnavailable) return Response.json({ success: true }, { status: 202 });
			const hold = holds.get(body.lock_id);
			if (!hold || hold.state !== "held" || hold.expiresAt <= Date.now())
				return Response.json({ code: "invalid_request", message: `Lock not found for ID: ${body.lock_id}` }, { status: 400 });
			hold.state = body.action === "confirm" ? "confirmed" : "released";
			return Response.json({ success: true }, { status: loseFinalizeReceipt ? 202 : 200 });
		}
	);

	beforeEach(() => {
		requests.length = 0;
		holds.clear();
		reservationKeys.clear();
		complete = true;
		interrupting = false;
		fail = false;
		providerUnavailable = false;
		loseFinalizeReceipt = false;
		ambiguousReservation = false;
		denyReservation = false;
		monthlyAllowance = null;
		calls = 0;
		detected = [];
		mode.mockResolvedValue({ mode: "fixed", customerId: "synthetic-customer" });
		choose.mockClear();
		telemetry.mockClear();
		tokenDebit.mockClear();
		deliver.mockClear();
	});

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

	async function fixture(metric = "checkout", freeze = true, asOf = new Date().toISOString()) {
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
				asOf,
				candidates: [candidate],
			});
		return { ...input, signal: candidate.signal, candidate, asOf };
	}

	it.each([100, 500])("keeps quiet completed answers readable and settles one extra unit after %s monthly investigations", async (allowance) => {
		monthlyAllowance = allowance;
		const input = await fixture();
		const { generateWebsiteInsights } = await import("./generation");
		const before = calls;
		await generateWebsiteInsights(input);
		await generateWebsiteInsights(input);
		expect(calls - before).toBe(1);
		const reservations = reservationsSince(0);
		expect(reservations).toHaveLength(1);
		const reservation = reservations[0]!;
		expect(holds.get(reservation.lock.lock_id)?.state).toBe("confirmed");
		expect(reservation.lock.expires_at).toBe(Date.parse(input.asOf) + 23 * 60 * 60 * 1000);
		expect(actionsSince(0)).toEqual(["reserve", "confirm", "confirm"]);
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
		const incompleteReservation = reservationsSince(0)[0]!;
		expect(holds.get(incompleteReservation.lock.lock_id)?.state).toBe("released");
		expect(actionsSince(0)).toEqual(["reserve", "release"]);
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
		const failedReservation = reservationsSince(0)[1]!;
		expect(holds.get(failedReservation.lock.lock_id)?.state).toBe("released");
		expect(actionsSince(0)).toEqual(["reserve", "release", "reserve", "release"]);
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
		await expect(generateWebsiteInsights(input)).rejects.toThrow("unconfirmed response");
		const reservation = reservationsSince(0)[0]!;
		expect(holds.get(reservation.lock.lock_id)?.state).toBe("held");
		const effects = await db
			.select()
			.from(insightRunEffects)
			.where(eq(insightRunEffects.runItemId, input.itemId));
		expect(effects).toHaveLength(1);
		expect(effects[0]?.status).toBe("succeeded");
		providerUnavailable = false;
		await generateWebsiteInsights(input);
		expect(calls - before).toBe(1);
		expect(holds.get(reservation.lock.lock_id)?.state).toBe("confirmed");
		expect(reservationsSince(0)).toHaveLength(1);
		expect(actionsSince(0)).toEqual(["reserve", "confirm", "confirm"]);
		expect(deliver).toHaveBeenCalledTimes(1);
		expect(tokenDebit).not.toHaveBeenCalled();
	});

	it.each([false, true])("preserves a completed job for native settlement recovery (final attempt: %s)", async (finalAttempt) => {
		const { processInsightsJob } = await import("./jobs");
		interrupting = true;
		providerUnavailable = true;
		const input = await fixture();
		const job = {
			id: input.queueJobId,
			name: INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
			data: input,
			opts: { attempts: 2 },
			attemptsMade: finalAttempt ? 1 : 0,
			attemptsStarted: finalAttempt ? 2 : 1,
		};
		await expect(processInsightsJob(job)).rejects.toThrow("unconfirmed response");
		const reservation = reservationsSince(0)[0]!;
		const [pending] = await db.select().from(insightRunItems).where(eq(insightRunItems.id, input.itemId));
		expect(pending?.status).toBe(finalAttempt ? "failed" : "queued");
		expect(pending?.errorMessage).toContain("unconfirmed response");
		expect(pending?.preparedStatus).toBe("succeeded");
		expect(holds.get(reservation.lock.lock_id)?.state).toBe("held");
		expect(calls).toBe(1);
		expect(deliver).toHaveBeenCalledTimes(1);
		if (finalAttempt) {
			await db.update(insightRunItems).set({
				updatedAt: new Date(Date.now() - 20 * 60 * 1000),
			}).where(eq(insightRunItems.id, input.itemId));
			await recoverStaleInsightRuns();
			const [stillFailed] = await db.select().from(insightRunItems).where(eq(insightRunItems.id, input.itemId));
			expect(stillFailed?.status).toBe("failed");
		}
		providerUnavailable = false;
		if (finalAttempt) {
			await recoverStaleInsightRuns();
		} else {
			await expect(processInsightsJob({ ...job, attemptsMade: 1, attemptsStarted: 2 })).resolves.toEqual({
				status: "succeeded", resultCount: 1,
			});
		}
		const [completed] = await db.select().from(insightRunItems).where(eq(insightRunItems.id, input.itemId));
		expect(completed?.status).toBe("succeeded");
		expect(holds.get(reservation.lock.lock_id)?.state).toBe("confirmed");
		expect(reservationsSince(0)).toHaveLength(1);
		expect(calls).toBe(1);
		expect(deliver).toHaveBeenCalledTimes(1);
		expect(tokenDebit).not.toHaveBeenCalled();
	});

	it.each([
		"empty",
		"unavailable",
		"reservation",
		"saved settlement",
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
		if (availability === "unavailable")
			mode.mockRejectedValue(new Error("Billing temporarily unavailable"));
		if (availability === "reservation" || availability === "saved settlement") {
			denyReservation = availability === "reservation";
			const paid = prepareInvestigation(
				{ ...detected[0]!, metric: "fresh-checkout" },
				7
			);
			await freezeInsightRunCandidatePlan(input, "manual", {
				asOf: input.asOf,
				candidates: [
					paid,
					...detected.map((item) => prepareInvestigation(item, 7)),
				],
			});
		}
		if (availability === "saved settlement") {
			// Stop after the first paid observation commits, leaving its two included
			// checks unfinished and its hold entirely in the synthetic provider.
			interrupting = true;
			prepareDelivery.mockRejectedValueOnce(new Error("Interrupted before included checks"));
			await expect(generateWebsiteInsights({ ...input, finalAttempt: false })).rejects.toThrow("Interrupted before included checks");
			expect(calls).toBe(1);
			expect(actionsSince(0)).toEqual(["reserve"]);
			expect(await db.select().from(insightObservations).where(eq(insightObservations.runId, input.runId))).toHaveLength(1);
			interrupting = false;
			providerUnavailable = true;
		}
		const modeCalls = mode.mock.calls.length;
		const before = requests.length;
		const beforeCalls = calls;
		if (availability === "reservation" || availability === "saved settlement") {
			await expect(generateWebsiteInsights(input)).rejects.toThrow();
		} else {
			await generateWebsiteInsights(input);
		}
		expect(mode).toHaveBeenCalledTimes(modeCalls + (availability === "saved settlement" ? 0 : 1));
		expect(choose).not.toHaveBeenCalled();
		expect(calls - beforeCalls).toBe(2);
		expect(requests).toHaveLength(
			before + (availability === "reservation" || availability === "saved settlement" ? 1 : 0)
		);
		expect(reservationsSince(before)).toHaveLength(availability === "reservation" ? 1 : 0);
		expect(holds.size).toBe(availability === "saved settlement" ? 1 : 0);
		expect(actionsSince(before)).toEqual(
			availability === "reservation" ? ["reserve"] : availability === "saved settlement" ? ["confirm"] : []
		);
		expect(
			await db
				.select()
				.from(insightObservations)
				.where(eq(insightObservations.runId, input.runId))
		).toHaveLength(availability === "saved settlement" ? 3 : 2);
		if (availability === "saved settlement") {
			const reservation = reservationsSince(0)[0]!;
			expect(holds.get(reservation.lock.lock_id)?.state).toBe("held");
			expect(deliver).toHaveBeenCalledTimes(1);
			const [runItem] = await db.select().from(insightRunItems).where(eq(insightRunItems.id, input.itemId));
			expect(runItem?.preparedAt).not.toBeNull();
			expect(runItem?.preparedStatus).toBe("succeeded");
			providerUnavailable = false;
			await expect(generateWebsiteInsights(input)).resolves.toMatchObject({ status: "succeeded" });
			expect(calls).toBe(3);
			expect(reservationsSince(0)).toHaveLength(1);
			expect(holds.get(reservation.lock.lock_id)?.state).toBe("confirmed");
			expect(deliver).toHaveBeenCalledTimes(1);
		}
		denyReservation = false;
		expect(tokenDebit).not.toHaveBeenCalled();
		mode.mockResolvedValue({ mode: "fixed", customerId: "synthetic-customer" });
	});
	it("keeps an incomplete published ask free and replay-safe while a new manual run remains eligible", async () => {
		const { generateWebsiteInsights } = await import("./generation");
		const input = await fixture("goal:checkout", false);
		detected = [
			{
				baseline: 20,
				current: 10,
				deltaPercent: -50,
				detectedAt: "2026-09-08",
				direction: "down",
				label: "Checkout",
				method: "wow",
				metric: "goal:checkout",
				severity: "warning",
			},
		];
		const outcome = investigationOutcomeSchema.parse({
			title: "Checkout completions declined",
			summary: "The team must confirm whether the pause was intentional.",
			evidence: [
				"Checkout completions fell from 20 to 10 in the compared weeks.",
			],
			rootCause: null,
			impact: null,
			publish: true,
			next: { type: "ask", question: "Was the checkout pause intentional?" },
		});
		const ask = async (
			agentInput: agent.InsightAgentInput
		): Promise<agent.InsightAgentResult> => {
			calls += 1;
			return {
				completion: "incomplete",
				outcome,
				modelId: "openai/gpt-5.6-luna",
				usage,
				toolCallCount: 1,
				snapshot: createEvidenceSnapshot({
					organizationId: input.organizationId,
					websiteId: input.websiteId,
					capturedAt: agentInput.appContext.currentDateTime,
					signal: agentInput.signal,
					evidence: agentInput.evidence,
					reads: [],
					descriptions: {},
				}),
			};
		};
		runAgent.mockImplementationOnce(ask);
		const beforeCalls = calls;
		const beforeRequests = requests.length;
		const result = await generateWebsiteInsights(input);
		expect(result).toMatchObject({ status: "succeeded", resultCount: 1 });
		const [observation] = await db
			.select()
			.from(insightObservations)
			.where(eq(insightObservations.runId, input.runId));
		expect(observation?.snapshot?.completion).toBe("incomplete");
		expect(observation?.outcome).toMatchObject({
			publish: true,
			next: outcome.next,
		});
		expect(observation?.insightId).toBeTruthy();
		const [visible] = await db
			.select()
			.from(analyticsInsights)
			.where(eq(analyticsInsights.organizationId, input.organizationId));
		expect(visible).toMatchObject({
			id: observation?.insightId,
			status: "open",
			title: outcome.title,
		});
		const reservation = reservationsSince(beforeRequests)[0]!;
		expect(holds.get(reservation.lock.lock_id)?.state).toBe("released");
		expect(actionsSince(beforeRequests)).toEqual(["reserve", "release"]);
		const effects = await db
			.select()
			.from(insightRunEffects)
			.where(eq(insightRunEffects.runItemId, input.itemId));
		expect(effects).toHaveLength(1);
		expect(effects[0]?.status).toBe("succeeded");

		const afterRequests = requests.length;
		expect(await generateWebsiteInsights(input)).toEqual(result);
		expect(calls - beforeCalls).toBe(1);
		expect(actionsSince(afterRequests)).toEqual(["release"]);
		expect(reservationsSince(beforeRequests)).toHaveLength(1);
		expect(
			await db
				.select()
				.from(insightObservations)
				.where(eq(insightObservations.runId, input.runId))
		).toHaveLength(1);
		expect(
			await db
				.select()
				.from(insightRunEffects)
				.where(eq(insightRunEffects.runItemId, input.itemId))
		).toHaveLength(1);

		// The prior question is still cooling; a new explicit manual scan can
		// inspect the detected subject without replaying the old run identity.
		expect(observation!.recheckAt.getTime()).toBeGreaterThan(Date.now());
		await db
			.update(insightRuns)
			.set({ status: "succeeded" })
			.where(eq(insightRuns.id, input.runId));
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const nextInput = { ...input, runId, itemId, queueJobId: `job-${itemId}` };
		await db
			.insert(insightRuns)
			.values({
				id: runId,
				organizationId: input.organizationId,
				status: "running",
				reason: "manual",
			});
		await db
			.insert(insightRunItems)
			.values({
				id: itemId,
				runId,
				organizationId: input.organizationId,
				websiteId: input.websiteId,
				queueJobId: nextInput.queueJobId,
				status: "running",
			});
		runAgent.mockImplementationOnce(ask);
		expect(await generateWebsiteInsights(nextInput)).toMatchObject({
			status: "succeeded",
			resultCount: 1,
		});
		expect(calls - beforeCalls).toBe(2);
		const [nextObservation] = await db
			.select()
			.from(insightObservations)
			.where(eq(insightObservations.runId, runId));
		expect(nextObservation?.signalKey).toBe(observation?.signalKey);
		expect(nextObservation?.id).not.toBe(observation?.id);
		expect(nextObservation!.asOf.getTime()).toBeGreaterThan(
			observation!.asOf.getTime()
		);
		const nextReservation = reservationsSince(beforeRequests)[1]!;
		expect(nextReservation.lock.lock_id).not.toBe(reservation.lock.lock_id);
		expect(nextReservation.key).not.toBe(reservation.key);
		expect(holds.get(nextReservation.lock.lock_id)?.state).toBe("released");
		expect(tokenDebit).not.toHaveBeenCalled();
		detected = [];
	});

	it("retries a lost finalization receipt without another reservation or model call", async () => {
		const { generateWebsiteInsights } = await import("./generation");
		const input = await fixture();
		loseFinalizeReceipt = true;
		await expect(generateWebsiteInsights(input)).rejects.toThrow("unconfirmed response");
		const reservation = reservationsSince(0)[0]!;
		expect(holds.get(reservation.lock.lock_id)?.state).toBe("confirmed");
		loseFinalizeReceipt = false;
		await generateWebsiteInsights(input);
		expect(calls).toBe(1);
		expect(reservationsSince(0)).toHaveLength(1);
		expect(actionsSince(0)).toEqual(["reserve", "confirm", "confirm"]);
		expect(holds.size).toBe(1);
	});

	it("confirms the original hold after a crash between readable persistence and delivery preparation", async () => {
		const { generateWebsiteInsights } = await import("./generation");
		interrupting = true;
		const input = { ...(await fixture()), finalAttempt: false };
		prepareDelivery.mockRejectedValueOnce(new Error("Interrupted after observation persistence"));
		await expect(generateWebsiteInsights(input)).rejects.toThrow("Interrupted after observation persistence");
		const [observation] = await db.select().from(insightObservations).where(eq(insightObservations.runId, input.runId));
		expect(observation?.insightId).toBeTruthy();
		expect(observation?.snapshot?.completion).toBe("complete");
		const reservation = reservationsSince(0)[0]!;
		expect(holds.get(reservation.lock.lock_id)?.state).toBe("held");
		await generateWebsiteInsights({ ...input, finalAttempt: true });
		expect(calls).toBe(1);
		expect(reservationsSince(0)).toHaveLength(1);
		expect(holds.get(reservation.lock.lock_id)?.state).toBe("confirmed");
		expect(deliver).toHaveBeenCalledTimes(1);
		expect(await db.select().from(insightObservations).where(eq(insightObservations.runId, input.runId))).toHaveLength(1);
	});

	it("reserves separate units for separate signals and only finalizes on a completed portfolio retry", async () => {
		const { generateWebsiteInsights } = await import("./generation");
		const input = await fixture("checkout", false);
		const second = prepareInvestigation({
			baseline: 20, current: 20, deltaPercent: 0, detectedAt: "2026-09-08",
			direction: "up", label: "Signup", method: "wow", metric: "signup", severity: "info",
		}, 7);
		await freezeInsightRunCandidatePlan(input, "manual", { asOf: input.asOf, candidates: [input.candidate, second] });
		await generateWebsiteInsights(input);
		const reservations = reservationsSince(0);
		expect(reservations).toHaveLength(2);
		expect(new Set(reservations.map(({ key }) => key)).size).toBe(2);
		expect([...holds.values()].map(({ state }) => state)).toEqual(["confirmed", "confirmed"]);
		const afterInitial = requests.length;
		await generateWebsiteInsights(input);
		expect(calls).toBe(2);
		expect(reservationsSince(afterInitial)).toHaveLength(0);
		expect(actionsSince(afterInitial)).toEqual(["confirm", "confirm"]);
		expect(await db.select().from(insightObservations).where(eq(insightObservations.runId, input.runId))).toHaveLength(2);
	});

	it.each([false, true])("does not rerun failed model work through a duplicate native reservation (final attempt: %s)", async (finalAttempt) => {
		const { generateWebsiteInsights } = await import("./generation");
		const input = { ...(await fixture()), finalAttempt };
		fail = true;
		await expect(generateWebsiteInsights(input)).rejects.toThrow("Synthetic model failure");
		expect(telemetry).toHaveBeenCalledTimes(1);
		expect(telemetry.mock.calls[0]?.[0]).toMatchObject({ modelId: "openai/gpt-5.6-luna", usage });
		const first = reservationsSince(0)[0]!;
		expect(holds.get(first.lock.lock_id)?.state).toBe("released");
		fail = false;
		await expect(generateWebsiteInsights({ ...input, finalAttempt: true })).rejects.toThrow();
		const retries = reservationsSince(0);
		expect(retries).toHaveLength(2);
		expect(retries[1]).toEqual(first);
		expect(holds.size).toBe(1);
		expect(calls).toBe(1);
		expect(telemetry).toHaveBeenCalledTimes(1);
		expect(actionsSince(0).includes("confirm")).toBe(false);
		expect(await db.select().from(insightObservations).where(eq(insightObservations.runId, input.runId))).toHaveLength(0);
	});

	it("does not authorize work after an ambiguous reservation receipt or its duplicate", async () => {
		const { generateWebsiteInsights } = await import("./generation");
		const input = await fixture();
		ambiguousReservation = true;
		await expect(generateWebsiteInsights(input)).rejects.toThrow();
		ambiguousReservation = false;
		await expect(generateWebsiteInsights(input)).rejects.toThrow();
		const reservations = reservationsSince(0);
		expect(reservations).toHaveLength(2);
		expect(reservations[1]).toEqual(reservations[0]);
		expect(holds.size).toBe(1);
		expect([...holds.values()][0]?.state).toBe("held");
		expect(calls).toBe(0);
		expect(actionsSince(0)).toEqual(["reserve", "reserve"]);
	});

	it("refuses an expired frozen plan before requesting a fresh provider reservation", async () => {
		const { generateWebsiteInsights } = await import("./generation");
		const asOf = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
		const input = await fixture("checkout", true, asOf);
		await expect(generateWebsiteInsights(input)).rejects.toThrow("reservation expired");
		await expect(generateWebsiteInsights(input)).rejects.toThrow("reservation expired");
		expect(calls).toBe(0);
		expect(requests).toHaveLength(0);
		expect(holds.size).toBe(0);
	});
});
