import "@databuddy/test/env";

import { eq } from "@databuddy/db";
import {
	analyticsInsights,
	insightObservations,
	insightReplies,
} from "@databuddy/db/schema";
import { appRouter, type Context } from "@databuddy/rpc";
import {
	closeInsightsQueue,
	getInsightsQueue,
	insightsResumeJobId,
} from "@databuddy/redis";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import {
	addToOrganization,
	cleanup,
	db,
	expectCode,
	hasTestDb,
	insertOrganization,
	insertWebsite,
	reset,
	signUp,
	userContext,
} from "@databuddy/test";
import { createProcedureClient, type AnyProcedure } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";

const iit = hasTestDb ? it : it.skip;

function investigationOutcome(nextType: "act" | "watch"): InvestigationOutcome {
	const next: InvestigationOutcome["next"] =
		nextType === "act"
			? {
					action: "Inspect the signup submit path.",
					kind: "code",
					owner: "Engineering",
					target: "Signup submit handler",
					type: "act",
					verification: "Signup conversion recovers for 24 hours.",
				}
			: {
					escalation: "Escalate if signup conversion falls another 10%.",
					type: "watch",
				};
	return {
		evidence: ["Signup conversion changed in the measured window."],
		impact: "Signup completion is affected.",
		impactConfidence: 0.8,
		next,
		rootCause: null,
		rootCauseConfidence: 0.2,
		sources: ["web"],
		summary: "Signup conversion needs attention.",
		title: "Signup conversion changed",
	};
}

function call<T extends AnyProcedure>(procedure: T, context: Context) {
	return createProcedureClient(procedure, { context });
}

beforeEach(() => reset());
afterAll(async () => {
	await closeInsightsQueue();
	await cleanup();
});

describe("insight investigation timeline", () => {
	iit("paginates one latest row per stable investigation", async () => {
		const member = await signUp();
		const organization = await insertOrganization();
		await addToOrganization(member.id, organization.id, "member");
		const website = await insertWebsite({ organizationId: organization.id });
		const ids = {
			olderSignup: randomUUIDv7(),
			latestSignup: randomUUIDv7(),
			checkout: randomUUIDv7(),
			activation: randomUUIDv7(),
			legacy: randomUUIDv7(),
		};
		await db().insert(analyticsInsights).values([
			{
				...insightRow({
					id: ids.olderSignup,
					organizationId: organization.id,
					subjectKey: "goal:signup",
					websiteId: website.id,
				}),
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				dedupeKey: `${website.id}|legacy|signup|older`,
				title: "Older signup finding",
			},
			{
				...insightRow({
					id: ids.latestSignup,
					organizationId: organization.id,
					subjectKey: "goal:signup",
					websiteId: website.id,
				}),
				createdAt: new Date("2026-01-04T00:00:00.000Z"),
				dedupeKey: `${website.id}|legacy|signup|latest`,
				title: "Latest signup finding",
			},
			{
				...insightRow({
					id: ids.checkout,
					organizationId: organization.id,
					subjectKey: "goal:checkout",
					websiteId: website.id,
				}),
				createdAt: new Date("2026-01-03T00:00:00.000Z"),
			},
			{
				...insightRow({
					id: ids.activation,
					organizationId: organization.id,
					subjectKey: "goal:activation",
					websiteId: website.id,
				}),
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
			},
			{
				...insightRow({
					id: ids.legacy,
					organizationId: organization.id,
					subjectKey: "legacy:card",
					websiteId: website.id,
				}),
				createdAt: new Date("2026-01-05T00:00:00.000Z"),
			},
		]);
		await db().insert(insightObservations).values(
			(["goal:signup", "goal:checkout", "goal:activation"] as const).map(
				(subjectKey, index) => ({
					asOf: new Date(`2026-01-0${index + 1}T12:00:00.000Z`),
					evidence: [],
					id: randomUUIDv7(),
					insightId:
						subjectKey === "goal:signup"
							? ids.latestSignup
							: subjectKey === "goal:checkout"
								? ids.checkout
								: ids.activation,
					organizationId: organization.id,
					outcome: investigationOutcome("watch"),
					recheckAt: new Date("2026-01-10T00:00:00.000Z"),
					signal: signal(
						website.id,
						subjectKey,
						`2026-01-0${index + 1}`
					),
					signalKey: subjectKey,
					websiteId: website.id,
				}))
		);

		const context = userContext(member, organization.id);
		const firstPage = await call(appRouter.insights.history, context)({
			limit: 2,
			offset: 0,
			organizationId: organization.id,
		});
		expect(firstPage.insights.map((insight) => insight.id)).toEqual([
			ids.latestSignup,
			ids.checkout,
		]);
		expect(firstPage.hasMore).toBe(true);

		const secondPage = await call(appRouter.insights.history, context)({
			limit: 2,
			offset: 2,
			organizationId: organization.id,
		});
		expect(secondPage.insights.map((insight) => insight.id)).toEqual([
			ids.activation,
		]);
		expect(secondPage.hasMore).toBe(false);
	});

	iit("persists a reply beside every observation for the same signal", async () => {
		const member = await signUp();
		const organization = await insertOrganization();
		await addToOrganization(member.id, organization.id, "member");
		const website = await insertWebsite({ organizationId: organization.id });
		const previousInsightId = randomUUIDv7();
		const insightId = randomUUIDv7();
		const signalKey = "goal:signup";

		await db().insert(analyticsInsights).values([
			{
				...insightRow({
					id: previousInsightId,
					organizationId: organization.id,
					subjectKey: signalKey,
					websiteId: website.id,
				}),
				dedupeKey: `${website.id}|previous|${signalKey}`,
			},
			insightRow({
				id: insightId,
				organizationId: organization.id,
				subjectKey: signalKey,
				websiteId: website.id,
			}),
		]);

		const firstObservationId = randomUUIDv7();
		const secondObservationId = randomUUIDv7();
		await db().insert(insightObservations).values([
			{
				id: firstObservationId,
				organizationId: organization.id,
				websiteId: website.id,
				insightId,
				signalKey,
				asOf: new Date("2026-01-10T00:00:00.000Z"),
				createdAt: new Date("2026-01-10T12:00:00.000Z"),
				signal: signal(website.id, signalKey, "2026-01-10"),
				evidence: [
					{
						source: "product",
						summary: "Signup conversion fell from 40% to 20%.",
					},
				],
				outcome: investigationOutcome("act"),
				recheckAt: new Date("2026-01-17T00:00:00.000Z"),
			},
			{
				id: secondObservationId,
				organizationId: organization.id,
				websiteId: website.id,
				insightId: null,
				signalKey,
				asOf: new Date("2026-01-01T00:00:00.000Z"),
				createdAt: new Date("2026-01-11T12:00:00.000Z"),
				signal: signal(website.id, signalKey, "2026-01-01"),
				evidence: [],
				outcome: investigationOutcome("watch"),
				recheckAt: new Date("2026-01-18T00:00:00.000Z"),
			},
		]);

		const context = userContext(member, organization.id);
		const added = await call(appRouter.insights.reply, context)({
			body: "  The signup form changed in yesterday's deploy.  ",
			insightId: previousInsightId,
		});
		expect(added.reply.body).toBe(
			"The signup form changed in yesterday's deploy."
		);
		expect(added.reply.status).toBe("queued");
		expect(
			(await getInsightsQueue().getJob(insightsResumeJobId(added.reply.id)))?.data
		).toEqual({ replyId: added.reply.id });

		const result = await call(appRouter.insights.getById, context)({
			insightId: previousInsightId,
		});
		expect(result.canReply).toBe(true);
		expect(result.insight?.id).toBe(insightId);
		expect(result.timeline.map((item) => item.id)).toEqual([
			firstObservationId,
			secondObservationId,
			added.reply.id,
		]);
		expect(result.timeline[1]).toMatchObject({
			kind: "investigation",
			period: {
				current: { from: "2026-01-04", to: "2026-01-10" },
				previous: { from: "2025-12-28", to: "2026-01-03" },
			},
		});
		expect(result.timeline[0]).toMatchObject({
			outcome: {
				next: { type: "act" },
				title: "Signup conversion changed",
			},
		});
		expect(result.timeline[0]).not.toHaveProperty("asOf");
		expect(result.timeline[0]).not.toHaveProperty("outcome.sources");
		expect(result.timeline[2]).toMatchObject({
			author: "test",
			body: "The signup form changed in yesterday's deploy.",
			kind: "reply",
			status: "queued",
		});
		expect(
			await db().select().from(insightReplies)
		).toEqual([
			expect.objectContaining({
				authorId: member.id,
				authorName: "test",
				body: "The signup form changed in yesterday's deploy.",
				insightId,
				status: "queued",
			}),
		]);

		await db()
			.update(insightReplies)
			.set({ status: "succeeded" })
			.where(eq(insightReplies.id, added.reply.id));
		const competing = await Promise.allSettled([
			call(appRouter.insights.reply, context)({
				body: "First simultaneous reply",
				insightId,
			}),
			call(appRouter.insights.reply, context)({
				body: "Second simultaneous reply",
				insightId,
			}),
		]);
		expect(competing.filter((item) => item.status === "fulfilled")).toHaveLength(
			1
		);
		expect(competing.filter((item) => item.status === "rejected")).toHaveLength(
			1
		);
		expect(await db().select().from(insightReplies)).toHaveLength(2);
	});

	iit("keeps investigation replies read-only for viewers", async () => {
		const viewer = await signUp();
		const member = await signUp();
		const organization = await insertOrganization();
		await addToOrganization(viewer.id, organization.id, "viewer");
		await addToOrganization(member.id, organization.id, "member");
		const website = await insertWebsite({ organizationId: organization.id });
		const insightId = randomUUIDv7();
		await db().insert(analyticsInsights).values(
			insightRow({
				id: insightId,
				organizationId: organization.id,
				subjectKey: "goal:signup",
				websiteId: website.id,
			})
		);
		await db().insert(insightObservations).values({
			asOf: new Date("2026-01-10T00:00:00.000Z"),
			evidence: [],
			id: randomUUIDv7(),
			insightId,
			organizationId: organization.id,
			outcome: investigationOutcome("watch"),
			recheckAt: new Date("2026-01-17T00:00:00.000Z"),
			signal: signal(website.id, "goal:signup", "2026-01-10"),
			signalKey: "goal:signup",
			websiteId: website.id,
		});

		await expectCode(
			call(appRouter.insights.reply, userContext(viewer, organization.id))({
				body: "Viewer context",
				insightId,
			}),
			"FORBIDDEN"
		);
		expect(await db().select().from(insightReplies)).toHaveLength(0);

		const failedReplyId = randomUUIDv7();
		await db().insert(insightReplies).values({
			authorId: viewer.id,
			authorName: "Viewer",
			body: "Retry this",
			createdAt: new Date("2026-01-10T00:00:00.000Z"),
			id: failedReplyId,
			insightId,
			status: "failed",
		});
		const newerReplyId = randomUUIDv7();
		await db().insert(insightReplies).values({
			authorId: member.id,
			authorName: "Member",
			body: "Newer context",
			createdAt: new Date("2026-01-11T00:00:00.000Z"),
			id: newerReplyId,
			insightId,
			status: "succeeded",
		});
		await expectCode(
			call(
				appRouter.insights.retryReply,
				userContext(viewer, organization.id)
			)({ replyId: failedReplyId }),
			"FORBIDDEN"
		);
		expect(
			(
				await db()
					.select({ status: insightReplies.status })
					.from(insightReplies)
					.where(eq(insightReplies.id, failedReplyId))
			)[0]?.status
		).toBe("failed");
		expect(
			await getInsightsQueue().getJob(insightsResumeJobId(failedReplyId))
		).toBeUndefined();
		await expectCode(
			call(
				appRouter.insights.retryReply,
				userContext(member, organization.id)
			)({ replyId: failedReplyId }),
			"BAD_REQUEST"
		);
		expect(
			await getInsightsQueue().getJob(insightsResumeJobId(failedReplyId))
		).toBeUndefined();
		await db()
			.delete(insightReplies)
			.where(eq(insightReplies.id, newerReplyId));

		const retried = await call(
			appRouter.insights.retryReply,
			userContext(member, organization.id)
		)({ replyId: failedReplyId });
		expect(retried.status).toBe("queued");
		expect(
			(await getInsightsQueue().getJob(insightsResumeJobId(failedReplyId)))?.data
		).toEqual({ replyId: failedReplyId });
	});

	iit("does not expose or mutate another organization's investigation", async () => {
		const owner = await signUp();
		const outsider = await signUp();
		const organization = await insertOrganization();
		const outsiderOrganization = await insertOrganization();
		await addToOrganization(owner.id, organization.id, "owner");
		await addToOrganization(outsider.id, outsiderOrganization.id, "owner");
		const website = await insertWebsite({ organizationId: organization.id });
		const insightId = randomUUIDv7();
		await db().insert(analyticsInsights).values(
			insightRow({
				id: insightId,
				organizationId: organization.id,
				subjectKey: "goal:purchase",
				websiteId: website.id,
			})
		);
		const unavailable = await call(
			appRouter.insights.getById,
			userContext(owner, organization.id)
		)({ insightId });
		expect(unavailable.canReply).toBe(false);
		expect(unavailable.insight).toBeNull();

		const context = userContext(outsider, outsiderOrganization.id);
		const hidden = await call(appRouter.insights.getById, context)({ insightId });
		expect(hidden).toEqual({
			canReply: false,
			insight: null,
			timeline: [],
		});
		await expectCode(
			call(appRouter.insights.reply, context)({ body: "Not mine", insightId }),
			"FORBIDDEN"
		);
		expect(await db().select().from(insightReplies)).toHaveLength(0);
	});
});

function insightRow(input: {
	id: string;
	organizationId: string;
	subjectKey: string;
	websiteId: string;
}): typeof analyticsInsights.$inferInsert {
	return {
		id: input.id,
		organizationId: input.organizationId,
		websiteId: input.websiteId,
		runId: randomUUIDv7(),
		title: "Signup conversion fell",
		description: "Signup conversion fell from 40% to 20%.",
		suggestion: "Inspect the signup submit path.",
		severity: "warning",
		sentiment: "negative",
		type: "conversion_leak",
		priority: 8,
		changePercent: -50,
		dedupeKey: `${input.websiteId}|${input.subjectKey}`,
		subjectKey: input.subjectKey,
		sources: ["web"],
		confidence: 0.9,
		metrics: [
			{ label: "Signup conversion", current: 20, previous: 40, format: "percent" },
		],
		timezone: "UTC",
		currentPeriodFrom: "2026-01-04",
		currentPeriodTo: "2026-01-10",
		previousPeriodFrom: "2025-12-28",
		previousPeriodTo: "2026-01-03",
	};
}

function signal(websiteId: string, signalKey: string, detectedAt: string) {
	return {
		signalKey,
		websiteId,
		insightType: "conversion_leak" as const,
		entity: { type: "goal" as const, id: "signup", label: "Signup" },
		metric: {
			key: signalKey,
			label: "Signup conversion",
			current: 20,
			previous: 40,
			format: "percent" as const,
		},
		changePercent: -50,
		direction: "down" as const,
		severity: "warning" as const,
		sentiment: "negative" as const,
		priority: 8,
		period: {
			current: { from: "2026-01-04", to: "2026-01-10" },
			previous: { from: "2025-12-28", to: "2026-01-03" },
		},
		detectedAt,
		detection: {
			method: "period_comparison" as const,
			reason: "Signup conversion fell by 50% week over week.",
		},
	};
}
