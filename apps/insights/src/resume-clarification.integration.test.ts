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
	investigationCharges,
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
	input: { legacy?: boolean; corrupt?: boolean; body?: string } = {}
) {
	const organizationId = crypto.randomUUID(),
		websiteId = crypto.randomUUID(),
		insightId = crypto.randomUUID(),
		observationId = crypto.randomUUID(),
		replyId = crypto.randomUUID();
	ids.push(organizationId);
	await db
		.insert(organization)
		.values({
			id: organizationId,
			name: "Synthetic evidence",
			slug: organizationId,
			createdAt: new Date(),
		});
	await db
		.insert(websites)
		.values({
			id: websiteId,
			organizationId,
			domain: "evidence.example.invalid",
		});
	await db
		.insert(analyticsInsights)
		.values({
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
	await db
		.insert(insightObservations)
		.values({
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
	await db
		.insert(insightReplies)
		.values({
			id: replyId,
			insightId,
			authorName: "Example teammate",
			body: input.body ?? "Explain the original result",
			sourceObservationId: observationId,
			intent: "clarification",
			createdAt: new Date("2026-09-13"),
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
integration("included saved-evidence replies", () => {
	afterEach(() => mock.restore());
	afterAll(async () => {
		if (ids.length)
			await db.delete(organization).where(inArray(organization.id, ids));
		await closeInsightsQueue();
		await shutdownPostgres();
	});
	it.each([
		null,
		100,
		200,
	])("loads the durable accepted quote of %s cents before any fresh analysis", async (acceptedPriceCents) => {
		const f = await fixture();
		await db
			.update(insightReplies)
			.set({ intent: "analysis", acceptedPriceCents })
			.where(eq(insightReplies.id, f.replyId));
		const resolve = spyOn(
			billing,
			"resolveInvestigationBilling"
		).mockResolvedValue({ mode: "fixed", customerId: "synthetic-customer" });
		const originalReserve = billing.reserveInvestigationCharge;
		const reserve = spyOn(
			billing,
			"reserveInvestigationCharge"
		).mockImplementation(async (input) => {
			expect(input.expectedPriceCents).toBe(acceptedPriceCents ?? undefined);
			if (acceptedPriceCents === 100)
				throw new Error("Durable quote reached reservation");
			return originalReserve(input);
		});
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
		).rejects.toThrow(
			acceptedPriceCents === null
				? "Accept the investigation price"
				: acceptedPriceCents === 100
					? "Durable quote reached reservation"
					: "no longer available"
		);
		expect(resolve).toHaveBeenCalledTimes(acceptedPriceCents === null ? 0 : 1);
		expect(reserve).toHaveBeenCalledTimes(acceptedPriceCents === null ? 0 : 1);
		expect(newWork).not.toHaveBeenCalled();
		expect(
			await db
				.select()
				.from(investigationCharges)
				.where(eq(investigationCharges.organizationId, f.organizationId))
		).toHaveLength(0);
	});

	it("loads the original observation beyond history truncation, saves only assistant text, and never bills or mutates the case", async () => {
		const f = await fixture();
		await db
			.insert(insightReplies)
			.values(
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
		await db
			.insert(insightObservations)
			.values({
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
		const billingCall = spyOn(
			billing,
			"resolveInvestigationBilling"
		).mockImplementation(forbidden);
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
		expect(
			await db
				.select()
				.from(investigationCharges)
				.where(eq(investigationCharges.organizationId, f.organizationId))
		).toHaveLength(0);
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
	it("delivers a saved failure notice even when releasing its paid unit is pending", async () => {
		const f = await fixture();
		await db
			.update(insightReplies)
			.set({
				intent: "analysis",
				slackDelivery: {
					type: "slack",
					channelId: "C_SYNTHETIC",
					threadTs: "123.456",
				},
			})
			.where(eq(insightReplies.id, f.replyId));
		const released = spyOn(
			billing,
			"releaseInvestigationChargeForOperation"
		).mockRejectedValue(new Error("Synthetic billing outage"));
		let deliveries = 0;
		await recordInsightReplyFailure(f.replyId, true, async (input) => {
			expect(input.result).toBeNull();
			deliveries++;
			return "123.457";
		});
		expect(released).toHaveBeenCalledTimes(1);
		expect(deliveries).toBe(1);
		const [reply] = await db
			.select()
			.from(insightReplies)
			.where(eq(insightReplies.id, f.replyId));
		expect(reply?.status).toBe("failed");
	});
});
