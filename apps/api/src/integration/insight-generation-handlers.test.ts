import "@databuddy/test/env";

import { insightObservations, insightRuns } from "@databuddy/db/schema";
import { appRouter, type Context } from "@databuddy/rpc";
import type {
	InvestigationOutcome,
	InvestigationSignal,
} from "@databuddy/shared/insights";
import {
	addToOrganization,
	cleanup,
	db,
	hasTestDb,
	insertOrganization,
	insertWebsite,
	reset,
	signUp,
	userContext,
} from "@databuddy/test";
import { createProcedureClient, type AnyProcedure } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const iit = hasTestDb ? it : it.skip;

function call<T extends AnyProcedure>(procedure: T, context: Context) {
	return createProcedureClient(procedure, { context });
}

function signal(signalKey: string): InvestigationSignal {
	return {
		signalKey,
		entity: { type: "goal", id: signalKey, label: "Signup" },
		metric: {
			label: "Signup conversion",
			current: 20,
			previous: 40,
			format: "percent",
		},
		changePercent: -50,
		severity: "warning",
		sentiment: "negative",
		period: {
			current: { from: "2026-01-04", to: "2026-01-10" },
			previous: { from: "2025-12-28", to: "2026-01-03" },
		},
	};
}

function outcome(
	type: InvestigationOutcome["next"]["type"],
	{
		publish = false,
		recommendation = null,
	}: {
		publish?: boolean;
		recommendation?: InvestigationOutcome["recommendation"];
	} = {}
): InvestigationOutcome {
	const next: InvestigationOutcome["next"] =
		type === "act"
			? {
					action: "Restore the missing signup event.",
					target: "Signup submit handler",
					type,
					verification: "Signup conversion recovers for 24 hours.",
				}
			: type === "ask"
				? { question: "Did the signup release change?", type }
				: type === "watch"
					? {
						escalation: "Escalate if signup conversion falls another 10%.",
						type,
					}
					: { reason: "The measured change recovered.", type };

	return {
		evidence: ["Signup conversion changed in the measured window."],
		impact: type === "act" ? "Signup completion is affected." : null,
		next,
		publish,
		recommendation,
		rootCause:
			type === "act"
				? "The signup submit handler stopped emitting completions."
				: null,
		summary: "Signup conversion changed.",
		title: "Signup conversion changed",
	};
}

beforeEach(() => reset());
afterAll(() => cleanup());

describe("insight generation run summary", () => {
	iit("summarizes only the latest run's completed outcomes for its organization", async () => {
		const member = await signUp();
		const organization = await insertOrganization();
		const otherOrganization = await insertOrganization();
		await addToOrganization(member.id, organization.id, "member");
		const website = await insertWebsite({ organizationId: organization.id });
		const otherWebsite = await insertWebsite({
			organizationId: otherOrganization.id,
		});
		const olderRunId = randomUUIDv7();
		const latestRunId = randomUUIDv7();
		const otherRunId = randomUUIDv7();

		await db().insert(insightRuns).values([
			{
				completedItems: 1,
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				id: olderRunId,
				organizationId: organization.id,
				status: "succeeded",
				totalItems: 1,
			},
			{
				completedItems: 1,
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
				id: latestRunId,
				organizationId: organization.id,
				status: "succeeded",
				totalItems: 1,
			},
			{
				completedItems: 1,
				createdAt: new Date("2026-01-03T00:00:00.000Z"),
				id: otherRunId,
				organizationId: otherOrganization.id,
				status: "succeeded",
				totalItems: 1,
			},
		]);

		await db().insert(insightObservations).values([
			{
				asOf: new Date("2026-01-01T12:00:00.000Z"),
				id: randomUUIDv7(),
				organizationId: organization.id,
				outcome: outcome("act", { publish: true }),
				recheckAt: new Date("2026-01-08T00:00:00.000Z"),
				runId: olderRunId,
				signal: signal("older"),
				signalKey: "older",
				websiteId: website.id,
			},
			...(["act", "ask", "watch", "resolve", "resolve"] as const).map(
				(type, index) => ({
					asOf: new Date(`2026-01-0${index + 2}T12:00:00.000Z`),
					id: randomUUIDv7(),
					organizationId: organization.id,
					outcome:
						index === 4
							? outcome(type, {
									publish: true,
									recommendation: {
										action: "Add a signup completion goal.",
										changes: null,
										operation: null,
									},
								})
							: outcome(type, {
									publish: type === "act" || type === "ask" || type === "resolve",
								}),
					recheckAt: new Date("2026-01-10T00:00:00.000Z"),
					runId: latestRunId,
					signal: signal(`latest-${index}`),
					signalKey: `latest-${index}`,
					websiteId: website.id,
				})
			),
			{
				asOf: new Date("2026-01-03T12:00:00.000Z"),
				id: randomUUIDv7(),
				organizationId: otherOrganization.id,
				outcome: outcome("act", { publish: true }),
				recheckAt: new Date("2026-01-10T00:00:00.000Z"),
				runId: otherRunId,
				signal: signal("other"),
				signalKey: "other",
				websiteId: otherWebsite.id,
			},
		]);

		const result = await call(
			appRouter.insightGeneration.getLatestRun,
			userContext(member, organization.id)
		)({ organizationId: organization.id });

		expect(result).toEqual({
			analyzedSignalCount: 5,
			analyzedWebsiteCount: 1,
			attentionCount: 2,
			completedItems: 1,
			failedItems: 0,
			id: latestRunId,
			insightCount: 4,
			monitoringCount: 1,
			publishedRecommendationCount: 1,
			resolvedCount: 2,
			skippedItems: 0,
			status: "succeeded",
			totalItems: 1,
		});
	});

	iit("returns zero outcome counts when a completed run has no observations", async () => {
		const member = await signUp();
		const organization = await insertOrganization();
		await addToOrganization(member.id, organization.id, "member");
		const runId = randomUUIDv7();
		await db().insert(insightRuns).values({
			completedItems: 1,
			id: runId,
			organizationId: organization.id,
			status: "succeeded",
			totalItems: 1,
		});

		const result = await call(
			appRouter.insightGeneration.getLatestRun,
			userContext(member, organization.id)
		)({ organizationId: organization.id });

		expect(result).toMatchObject({
			analyzedSignalCount: 0,
			analyzedWebsiteCount: 0,
			attentionCount: 0,
			id: runId,
			insightCount: 0,
			monitoringCount: 0,
			publishedRecommendationCount: 0,
			resolvedCount: 0,
		});
	});
});
