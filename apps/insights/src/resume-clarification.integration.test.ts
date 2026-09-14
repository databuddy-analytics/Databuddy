import "@databuddy/test/env";
import {
	afterAll,
	afterEach,
	describe,
	expect,
	it,
	mock,
	spyOn,
} from "bun:test";
import { db, eq, inArray, shutdownPostgres } from "@databuddy/db";
import {
	analyticsInsights,
	insightObservations,
	insightReplies,
	organization,
	websites,
} from "@databuddy/db/schema";
import { closeInsightsQueue } from "@databuddy/redis";
import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import { appliedInsightActionReply } from "@databuddy/shared/insights";
import { createEvidenceSnapshot } from "./evidence-snapshot";
import { resumeInsightReply, recordInsightReplyFailure } from "./resume";
import * as billing from "./investigation-billing";

const integration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" ? describe : describe.skip;
const ids: string[] = [];
const signal: InvestigationSignal = {
	signalKey: "goal:workspace",
	entity: { type: "goal", id: "workspace", label: "Workspace" },
	metric: {
		label: "Completed visitors",
		current: 20,
		previous: 100,
		format: "number",
	},
	changePercent: -80,
	severity: "warning",
	sentiment: "negative",
	period: {
		current: { from: "2026-09-05", to: "2026-09-11" },
		previous: { from: "2026-08-29", to: "2026-09-04" },
	},
};
const outcome: InvestigationOutcome = {
	title: "Workspace changed",
	summary: "The cause is unknown.",
	rootCause: null,
	impact: null,
	evidence: ["20 completed visitors"],
	publish: false,
	next: { type: "resolve", reason: "No inspected repair" },
};
async function fixture(
	input: {
		legacy?: boolean;
		corrupt?: boolean;
		body?: string;
		intent?: "analysis" | "clarification" | "verification";
	} = {}
) {
	const organizationId = crypto.randomUUID(),
		websiteId = crypto.randomUUID(),
		insightId = crypto.randomUUID(),
		observationId = crypto.randomUUID(),
		replyId = crypto.randomUUID();
	ids.push(organizationId);
	await db.insert(organization).values({
		id: organizationId,
		name: "Synthetic evidence",
		slug: organizationId,
		createdAt: new Date(),
	});
	await db.insert(websites).values({
		id: websiteId,
		organizationId,
		domain: "evidence.example.invalid",
	});
	await db.insert(analyticsInsights).values({
		id: insightId,
		organizationId,
		websiteId,
		title: "Workspace changed",
		description: "A saved result",
		subjectKey: signal.signalKey,
		status: "resolved",
		severity: "warning",
		sentiment: "negative",
	});
	const snapshot = createEvidenceSnapshot({
		organizationId: input.corrupt ? "wrong-organization" : organizationId,
		websiteId,
		capturedAt: "2026-09-12T00:00:00.000Z",
		signal,
		evidence: [],
		reads: [
			{
				toolName: "get_goal_analytics",
				toolCallId: "saved-read",
				input: {
					goalId: "workspace",
					startDate: "2026-09-05",
					endDate: "2026-09-11",
				},
				output: { total_users_entered: 200, total_users_completed: 20 },
			},
		],
		descriptions: {
			get_goal_analytics: "Counts eligible website visitors, not attempts.",
		},
	});
	await db.insert(insightObservations).values({
		id: observationId,
		organizationId,
		websiteId,
		insightId,
		signalKey: signal.signalKey,
		signal,
		outcome,
		evidence: [],
		snapshot: input.legacy ? null : snapshot,
		asOf: new Date("2026-09-12"),
		createdAt: new Date("2026-09-12"),
		recheckAt: new Date("2026-09-19"),
	});
	await db.insert(insightReplies).values({
		id: replyId,
		insightId,
		authorName: "Example teammate",
		body: input.body ?? "Explain the original result",
		sourceObservationId: observationId,
		intent: input.intent ?? "clarification",
		createdAt:
			input.intent === "analysis" ? new Date() : new Date("2026-09-13"),
		status: "queued",
	});
	return {
		organizationId,
		websiteId,
		insightId,
		observationId,
		replyId,
		snapshot,
	};
}
const forbidden = () => {
	throw new Error("An included clarification must not perform new work");
};
const business = {
	loadCurrentBusinessScope: forbidden,
	loadBusinessProfile: forbidden,
	recallBusinessContext: forbidden,
};
const freshBusiness: NonNullable<Parameters<typeof resumeInsightReply>[4]> = {
	loadCurrentBusinessScope: async (scope) => ({
		...scope,
		domain: "evidence.example.invalid",
	}),
	loadBusinessProfile: async () => ({
		capturedAt: new Date().toISOString(),
		status: "disabled",
		sources: [],
		issues: [],
	}),
	recallBusinessContext: async () => ({
		capturedAt: new Date().toISOString(),
		status: "disabled",
		sources: [],
		issues: [],
	}),
};

function nativeProvider(
	options: {
		price?: number;
		loseConfirmation?: boolean;
		failConfirmation?: boolean;
	} = {}
) {
	const holds = new Set<string>();
	const keys = new Set<string>();
	let reserved = 0,
		confirmed = 0,
		released = 0;
	let loseConfirmation = options.loseConfirmation === true;
	let failConfirmation = options.failConfirmation === true;
	const client = billing.createInvestigationBillingClient({
		secretKey: "synthetic-local-only",
		fetcher: async (request) => {
			if (!(request instanceof Request))
				throw new Error("Expected native SDK request");
			expect(new URL(request.url).hostname).toBe("api.useautumn.com");
			const body = (await request.json()) as Record<string, unknown>;
			if (request.url.includes("balances.check")) {
				const key = request.headers.get("Idempotency-Key")!;
				if (keys.has(key))
					return Response.json(
						{
							code: "duplicate_idempotency_key",
							message: "Duplicate idempotency key",
						},
						{ status: 409 }
					);
				keys.add(key);
				const lock = body.lock as { lock_id: string };
				holds.add(lock.lock_id);
				reserved++;
				return Response.json({
					allowed: true,
					customer_id: "synthetic-customer",
					flag: null,
					balance: {
						feature_id: "investigation_runs",
						granted: 100,
						remaining: 0,
						usage: 101,
						unlimited: false,
						overage_allowed: true,
						max_purchase: null,
						next_reset_at: null,
						breakdown: [
							{
								id: "synthetic-grant",
								plan_id: "synthetic-plan",
								included_grant: 100,
								prepaid_grant: 0,
								remaining: 0,
								usage: 101,
								unlimited: false,
								reset: null,
								expires_at: null,
								price: {
									amount: options.price ?? 1,
									billing_units: 1,
									billing_method: "usage_based",
									max_purchase: null,
								},
							},
						],
					},
				});
			}
			if (!request.url.includes("balances.finalize"))
				throw new Error("Unexpected native SDK endpoint");
			expect(request.headers.get("Idempotency-Key")).toBeNull();
			const id = String(body.lock_id);
			if (failConfirmation)
				return Response.json(
					{ code: "service_unavailable", message: "Synthetic provider outage" },
					{ status: 503 }
				);
			if (!holds.delete(id))
				return Response.json(
					{ code: "invalid_request", message: `Lock not found for ID: ${id}` },
					{ status: 400 }
				);
			if (body.action === "release") released++;
			else {
				confirmed++;
				if (loseConfirmation) {
					loseConfirmation = false;
					throw new TypeError("Synthetic lost confirmation response");
				}
			}
			return Response.json({ success: true });
		},
	});
	return {
		client,
		setFinalizeFailure: (value: boolean) => {
			failConfirmation = value;
		},
		state: () => ({ reserved, confirmed, released, holds: holds.size }),
	};
}

function wireProvider(remote: ReturnType<typeof nativeProvider>) {
	const nativeReserve = billing.reserveInvestigationCharge;
	const nativeSettle = billing.settleInvestigationCharge;
	const nativeRelease = billing.releaseInvestigationCharge;
	spyOn(billing, "resolveInvestigationBilling").mockResolvedValue({
		mode: "fixed",
		customerId: "synthetic-customer",
	});
	return {
		reserve: spyOn(billing, "reserveInvestigationCharge").mockImplementation(
			(input) => nativeReserve(input, remote.client)
		),
		settle: spyOn(billing, "settleInvestigationCharge").mockImplementation(
			(input) => nativeSettle(input, remote.client)
		),
		release: spyOn(billing, "releaseInvestigationCharge").mockImplementation(
			(input) => nativeRelease(input, remote.client)
		),
	};
}

integration("included saved-evidence replies", () => {
	afterEach(() => mock.restore());
	afterAll(async () => {
		if (ids.length)
			await db.delete(organization).where(inArray(organization.id, ids));
		await closeInsightsQueue();
		await shutdownPostgres();
	});
	it.each([
		["legacy"],
		["unconfigured"],
	] as const)("refuses new analysis under %s terms before provider reservation or fresh work", async (mode) => {
		const f = await fixture({ intent: "analysis" });
		spyOn(billing, "resolveInvestigationBilling").mockResolvedValue({
			mode,
			customerId: mode === "legacy" ? "synthetic-customer" : null,
		});
		const reserve = spyOn(
			billing,
			"reserveInvestigationCharge"
		).mockImplementation(forbidden);
		const newWork = mock(forbidden);
		await expect(
			resumeInsightReply(
				f.replyId,
				newWork,
				newWork,
				newWork,
				{
					loadCurrentBusinessScope: newWork,
					loadBusinessProfile: newWork,
					recallBusinessContext: newWork,
				},
				newWork
			)
		).rejects.toThrow("Activate investigation billing");
		expect(reserve).not.toHaveBeenCalled();
		expect(newWork).not.toHaveBeenCalled();
		expect(
			await db
				.select()
				.from(insightObservations)
				.where(eq(insightObservations.insightId, f.insightId))
		).toHaveLength(1);
	});

	it("rejects an attached $2 usage price at the native reservation boundary before measurements or model work", async () => {
		const f = await fixture({ intent: "analysis" });
		const remote = nativeProvider({ price: 2 });
		wireProvider(remote);
		const newWork = mock(forbidden);
		await expect(
			resumeInsightReply(
				f.replyId,
				newWork,
				newWork,
				newWork,
				{
					loadCurrentBusinessScope: newWork,
					loadBusinessProfile: newWork,
					recallBusinessContext: newWork,
				},
				newWork
			)
		).rejects.toThrow("price could not be verified");
		expect(newWork).not.toHaveBeenCalled();
		expect(remote.state()).toEqual({
			reserved: 1,
			confirmed: 0,
			released: 1,
			holds: 0,
		});
		expect(
			await db
				.select()
				.from(insightObservations)
				.where(eq(insightObservations.insightId, f.insightId))
		).toHaveLength(1);
	});

	it("loads the original observation beyond history truncation, saves only assistant text, and never bills or mutates the case", async () => {
		const f = await fixture();
		await db.insert(insightReplies).values(
			Array.from({ length: 14 }, (_, i) => ({
				id: crypto.randomUUID(),
				insightId: f.insightId,
				authorName: "Example teammate",
				body: `Question ${i}`,
				assistantText: `Answer ${i}`,
				sourceObservationId: f.observationId,
				intent: "clarification" as const,
				status: "succeeded" as const,
				createdAt: new Date(Date.parse("2026-09-12") + 1000 * (i + 1)),
			}))
		);
		await db.insert(insightObservations).values({
			id: crypto.randomUUID(),
			organizationId: f.organizationId,
			websiteId: f.websiteId,
			insightId: f.insightId,
			signalKey: signal.signalKey,
			signal,
			outcome: { ...outcome, title: "A newer unrelated unit" },
			evidence: [],
			asOf: new Date("2026-09-13"),
			createdAt: new Date("2026-09-13T00:00:01Z"),
			recheckAt: new Date("2026-09-20"),
		});
		const before = await db
			.select()
			.from(analyticsInsights)
			.where(eq(analyticsInsights.id, f.insightId));
		const billingCall = mock(forbidden);
		spyOn(billing, "resolveInvestigationBilling").mockImplementation(
			billingCall
		);
		spyOn(billing, "reserveInvestigationCharge").mockImplementation(
			billingCall
		);
		spyOn(billing, "settleInvestigationCharge").mockImplementation(billingCall);
		spyOn(billing, "releaseInvestigationCharge").mockImplementation(
			billingCall
		);
		const result = await resumeInsightReply(
			f.replyId,
			forbidden,
			forbidden,
			forbidden,
			business,
			async (input) => {
				expect(input.snapshot).toEqual(f.snapshot);
				expect(input.outcome.title).toBe(outcome.title);
				expect(input.history).toHaveLength(12);
				expect(input.history[0]?.assistantText).toBe("Answer 2");
				expect(input.history.at(-1)?.assistantText).toBe("Answer 13");
				return {
					text: "180 eligible visitors did not complete, calculated from 200 entrants minus 20 completions.",
					modelId: "openai/gpt-5.6-luna",
					usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
				};
			}
		);
		expect(result).toBe("succeeded");
		expect(billingCall).not.toHaveBeenCalled();
		const [reply] = await db
			.select()
			.from(insightReplies)
			.where(eq(insightReplies.id, f.replyId));
		expect(reply?.status).toBe("succeeded");
		expect(reply?.observationId).toBeNull();
		expect(reply?.assistantText).toContain("180 eligible visitors");
		expect(
			await db
				.select()
				.from(analyticsInsights)
				.where(eq(analyticsInsights.id, f.insightId))
		).toEqual(before);
		expect(
			await db
				.select()
				.from(insightObservations)
				.where(eq(insightObservations.insightId, f.insightId))
		).toHaveLength(2);
	});
	it.each([
		"Please run a new analysis",
		appliedInsightActionReply("goal"),
	])("never selects new work from new public reply text: %s", async (body) => {
		const f = await fixture({ body });
		let calls = 0;
		await resumeInsightReply(
			f.replyId,
			forbidden,
			forbidden,
			forbidden,
			business,
			async () => {
				calls++;
				return {
					text: "This reply only explains saved evidence.",
					modelId: "openai/gpt-5.6-luna",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				};
			}
		);
		expect(calls).toBe(1);
	});
	it("keeps a legacy missing snapshot explicit without fresh reads", async () => {
		const f = await fixture({ legacy: true });
		await resumeInsightReply(
			f.replyId,
			forbidden,
			forbidden,
			forbidden,
			business,
			async (input) => {
				expect(input.snapshot).toBeNull();
				return {
					text: "Raw evidence was not retained.",
					modelId: "openai/gpt-5.6-luna",
					usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
				};
			}
		);
	});
	it("rejects a snapshot with a different organization before generation", async () => {
		const f = await fixture({ corrupt: true });
		await expect(
			resumeInsightReply(
				f.replyId,
				forbidden,
				forbidden,
				forbidden,
				business,
				forbidden
			)
		).rejects.toThrow("different investigation");
	});
	it("delivers a final failure notice without creating a replacement billing operation", async () => {
		const f = await fixture({ intent: "analysis" });
		await db
			.update(insightReplies)
			.set({
				slackDelivery: {
					type: "slack",
					channelId: "C_SYNTHETIC",
					threadTs: "123.456",
				},
			})
			.where(eq(insightReplies.id, f.replyId));
		const billingWork = mock(forbidden);
		spyOn(billing, "reserveInvestigationCharge").mockImplementation(
			billingWork
		);
		spyOn(billing, "settleInvestigationCharge").mockImplementation(billingWork);
		let deliveries = 0;
		await recordInsightReplyFailure(f.replyId, true, async (input) => {
			expect(input.result).toBeNull();
			deliveries++;
			return "123.457";
		});
		expect(billingWork).not.toHaveBeenCalled();
		expect(deliveries).toBe(1);
		const [reply] = await db
			.select()
			.from(insightReplies)
			.where(eq(insightReplies.id, f.replyId));
		expect(reply?.status).toBe("failed");
	});

	it("replays a lost native confirmation after the reply is saved without another model call or debit", async () => {
		const f = await fixture({ intent: "analysis" });
		await db
			.update(insightReplies)
			.set({
				slackDelivery: {
					type: "slack",
					channelId: "C_SYNTHETIC",
					threadTs: "123.456",
				},
			})
			.where(eq(insightReplies.id, f.replyId));
		const remote = nativeProvider({ loseConfirmation: true });
		const calls = wireProvider(remote);
		const model = mock(async () => ({
			outcome,
			completion: "complete" as const,
			snapshot: { ...f.snapshot, completion: "complete" as const },
			toolCallCount: 1,
		}));
		const refresh = mock(async () => ({
			signal,
			evidence: ["Fresh synthetic measurement"],
		}));
		const messages: string[] = [];
		const deliver = mock(
			async (
				input: Parameters<
					NonNullable<Parameters<typeof resumeInsightReply>[2]>
				>[0]
			) => {
				messages.push(input.clientMessageId);
				return "123.457";
			}
		);
		const run = () =>
			resumeInsightReply(
				f.replyId,
				model,
				deliver,
				refresh,
				freshBusiness,
				forbidden
			);
		await expect(run()).rejects.toThrow();
		const [saved] = await db
			.select()
			.from(insightReplies)
			.where(eq(insightReplies.id, f.replyId));
		expect(saved?.status).toBe("succeeded");
		expect(saved?.observationId).not.toBeNull();
		expect(remote.state()).toEqual({
			reserved: 1,
			confirmed: 1,
			released: 0,
			holds: 0,
		});
		expect(deliver).toHaveBeenCalledTimes(1);
		expect(await run()).toBe("succeeded");
		expect(await run()).toBe("succeeded");
		expect(model).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(calls.reserve).toHaveBeenCalledTimes(1);
		expect(calls.release).not.toHaveBeenCalled();
		expect(new Set(messages)).toEqual(new Set([`${f.replyId}-success`]));
		expect(remote.state()).toEqual({
			reserved: 1,
			confirmed: 1,
			released: 0,
			holds: 0,
		});
		const [replayed] = await db
			.select()
			.from(insightReplies)
			.where(eq(insightReplies.id, f.replyId));
		expect(replayed?.observationId).toBe(saved?.observationId);
		expect(
			await db
				.select()
				.from(insightObservations)
				.where(eq(insightObservations.insightId, f.insightId))
		).toHaveLength(2);
	});

	it("delivers the saved answer during repeated settlement outages and later finalizes it without reanalysis", async () => {
		const f = await fixture({ intent: "analysis" });
		await db
			.update(insightReplies)
			.set({
				slackDelivery: {
					type: "slack",
					channelId: "C_SYNTHETIC",
					threadTs: "123.456",
				},
			})
			.where(eq(insightReplies.id, f.replyId));
		const remote = nativeProvider({ failConfirmation: true });
		const calls = wireProvider(remote);
		const model = mock(async () => ({
			outcome,
			completion: "complete" as const,
			snapshot: { ...f.snapshot, completion: "complete" as const },
			toolCallCount: 1,
		}));
		const refresh = mock(async () => ({ signal, evidence: [] }));
		const deliver = mock(async () => "123.457");
		const run = () =>
			resumeInsightReply(
				f.replyId,
				model,
				deliver,
				refresh,
				freshBusiness,
				forbidden
			);
		await expect(run()).rejects.toThrow();
		expect(deliver).toHaveBeenCalledTimes(1);
		await recordInsightReplyFailure(f.replyId, true, forbidden);
		await expect(run()).rejects.toThrow();
		expect(deliver).toHaveBeenCalledTimes(2);
		expect(remote.state()).toEqual({
			reserved: 1,
			confirmed: 0,
			released: 0,
			holds: 1,
		});
		remote.setFinalizeFailure(false);
		expect(await run()).toBe("succeeded");
		expect(model).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(calls.reserve).toHaveBeenCalledTimes(1);
		expect(calls.release).not.toHaveBeenCalled();
		expect(remote.state()).toEqual({
			reserved: 1,
			confirmed: 1,
			released: 0,
			holds: 0,
		});
	});

	it("keeps an incomplete published analysis visible and releases its native hold", async () => {
		const f = await fixture({ intent: "analysis" });
		const remote = nativeProvider();
		wireProvider(remote);
		const incomplete: InvestigationOutcome = {
			...outcome,
			publish: true,
			next: {
				type: "ask",
				question: "Did the signup release ship before September 11?",
			},
		};
		const model = mock(async () => ({
			outcome: incomplete,
			completion: "incomplete" as const,
			snapshot: f.snapshot,
			toolCallCount: 1,
		}));
		const refresh = mock(async () => ({ signal, evidence: [] }));
		expect(
			await resumeInsightReply(
				f.replyId,
				model,
				forbidden,
				refresh,
				freshBusiness,
				forbidden
			)
		).toBe("succeeded");
		expect(remote.state()).toEqual({
			reserved: 1,
			confirmed: 0,
			released: 1,
			holds: 0,
		});
		const [saved] = await db
			.select()
			.from(insightReplies)
			.where(eq(insightReplies.id, f.replyId));
		const [observation] = await db
			.select()
			.from(insightObservations)
			.where(eq(insightObservations.id, saved!.observationId!));
		expect(observation?.outcome.publish).toBe(true);
		expect(observation?.snapshot?.completion).toBe("incomplete");
		expect(
			await resumeInsightReply(
				f.replyId,
				model,
				forbidden,
				refresh,
				freshBusiness,
				forbidden
			)
		).toBe("succeeded");
		expect(model).toHaveBeenCalledTimes(1);
		expect(remote.state().confirmed).toBe(0);
	});

	it("keeps trusted verification free while refreshing the original investigation", async () => {
		const f = await fixture({ intent: "verification" });
		const billingWork = mock(forbidden);
		spyOn(billing, "resolveInvestigationBilling").mockImplementation(
			billingWork
		);
		spyOn(billing, "reserveInvestigationCharge").mockImplementation(
			billingWork
		);
		spyOn(billing, "settleInvestigationCharge").mockImplementation(billingWork);
		spyOn(billing, "releaseInvestigationCharge").mockImplementation(
			billingWork
		);
		const model = mock(async (input) => {
			expect(input.request?.kind).toBe("verification");
			return {
				outcome,
				completion: "complete" as const,
				snapshot: { ...f.snapshot, completion: "complete" as const },
				toolCallCount: 1,
			};
		});
		const refresh = mock(async () => ({ signal, evidence: [] }));
		expect(
			await resumeInsightReply(
				f.replyId,
				model,
				forbidden,
				refresh,
				freshBusiness,
				forbidden
			)
		).toBe("succeeded");
		expect(model).toHaveBeenCalledTimes(1);
		expect(refresh).toHaveBeenCalledTimes(1);
		expect(billingWork).not.toHaveBeenCalled();
	});
});
