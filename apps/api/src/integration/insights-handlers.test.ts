import "@databuddy/test/env";

import { createMcpTools } from "@databuddy/ai/mcp/tools";
import { eq } from "@databuddy/db";
import {
	analyticsInsights,
	funnelDefinitions,
	goals,
	insightObservations,
	insightReplies,
} from "@databuddy/db/schema";
import {
	appRouter,
	createInternalPrincipal,
	createRPCContext,
	type Context,
} from "@databuddy/rpc";
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
import { afterAll, beforeEach, describe, expect, it } from "vitest";

const iit = hasTestDb ? it : it.skip;

function investigationOutcome(nextType: "act" | "watch"): InvestigationOutcome {
	const next: InvestigationOutcome["next"] =
		nextType === "act"
			? {
					action: "Restore signup_completed emission in the signup submit handler.",
					target: "Signup submit handler",
					type: "act",
					verification:
						"The handler emits signup_completed and signup conversion recovers for 24 hours.",
				}
			: {
					escalation: "Escalate if signup conversion falls another 10%.",
					type: "watch",
				};
	return {
		evidence: ["Signup conversion changed in the measured window."],
		impact: "Signup completion is affected.",
		next,
		publish: true,
		rootCause:
			nextType === "act"
				? "The signup submit handler stopped emitting completions."
				: null,
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
					id: randomUUIDv7(),
					insightId:
						subjectKey === "goal:signup"
							? ids.latestSignup
							: subjectKey === "goal:checkout"
								? ids.checkout
								: ids.activation,
					organizationId: organization.id,
					outcome: investigationOutcome("act"),
					recheckAt: new Date("2026-01-10T00:00:00.000Z"),
					signal: signal(subjectKey),
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

	iit("does not promote a watch-only legacy row through another case's history", async () => {
		const member = await signUp();
		const organization = await insertOrganization();
		await addToOrganization(member.id, organization.id, "member");
		const website = await insertWebsite({ organizationId: organization.id });
		const actionableId = randomUUIDv7();
		const watchOnlyId = randomUUIDv7();
		const subjectKey = "goal:signup";
		await db().insert(analyticsInsights).values([
			{
				...insightRow({
					id: actionableId,
					organizationId: organization.id,
					subjectKey,
					websiteId: website.id,
				}),
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				dedupeKey: `${website.id}|actionable`,
			},
			{
				...insightRow({
					id: watchOnlyId,
					organizationId: organization.id,
					subjectKey,
					websiteId: website.id,
				}),
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
				dedupeKey: `${website.id}|watch-only`,
			},
		]);
		await db().insert(insightObservations).values([
			{
				asOf: new Date("2026-01-01T00:00:00.000Z"),
				id: randomUUIDv7(),
				insightId: actionableId,
				organizationId: organization.id,
				outcome: investigationOutcome("act"),
				recheckAt: new Date("2026-01-08T00:00:00.000Z"),
				signal: signal(subjectKey),
				signalKey: subjectKey,
				websiteId: website.id,
			},
			{
				asOf: new Date("2026-01-02T00:00:00.000Z"),
				id: randomUUIDv7(),
				insightId: watchOnlyId,
				organizationId: organization.id,
				outcome: investigationOutcome("watch"),
				recheckAt: new Date("2026-01-09T00:00:00.000Z"),
				signal: signal(subjectKey),
				signalKey: subjectKey,
				websiteId: website.id,
			},
		]);

		const result = await call(
			appRouter.insights.history,
			userContext(member, organization.id)
		)({
			limit: 10,
			offset: 0,
			organizationId: organization.id,
		});
		expect(result.insights.map((insight) => insight.id)).toEqual([
			actionableId,
		]);
	});

	iit("hides a case from the action inbox while a reply is being verified", async () => {
		const member = await signUp();
		const organization = await insertOrganization();
		await addToOrganization(member.id, organization.id, "member");
		const website = await insertWebsite({ organizationId: organization.id });
		const insightId = randomUUIDv7();
		const subjectKey = "goal:signup";
		await db().insert(analyticsInsights).values(
			insightRow({
				id: insightId,
				organizationId: organization.id,
				subjectKey,
				websiteId: website.id,
			})
		);
		await db().insert(insightObservations).values({
			asOf: new Date("2026-01-01T00:00:00.000Z"),
			id: randomUUIDv7(),
			insightId,
			organizationId: organization.id,
			outcome: investigationOutcome("act"),
			recheckAt: new Date("2026-01-08T00:00:00.000Z"),
			signal: signal(subjectKey),
			signalKey: subjectKey,
			websiteId: website.id,
		});
		await db().insert(insightReplies).values({
			authorId: member.id,
			authorName: "Test member",
			body: "Databuddy applied the suggested action.",
			id: randomUUIDv7(),
			insightId,
			status: "running",
		});

		const result = await call(
			appRouter.insights.history,
			userContext(member, organization.id)
		)({
			limit: 10,
			offset: 0,
			organizationId: organization.id,
		});

		expect(result.insights).toEqual([]);
	});

	iit("applies an executable goal action and queues verification together", async () => {
		const member = await signUp();
		const organization = await insertOrganization();
		await addToOrganization(member.id, organization.id, "member");
		const website = await insertWebsite({ organizationId: organization.id });
		const goalId = randomUUIDv7();
		const insightId = randomUUIDv7();
		const subjectKey = "goal:clicked-nav";
		const outcome: InvestigationOutcome = {
			...investigationOutcome("act"),
			next: {
				action: "Rename Clicked Nav to Navigation clicks.",
				execution: {
					action: "Rename Clicked Nav to Navigation clicks.",
					changes: {
						description: "Counts navigation activity across the site.",
						name: "Navigation clicks",
					},
					operation: "edit",
				},
				target: "Goal: Clicked Nav",
				type: "act",
				verification: "The goal definition matches the navigation metric.",
			},
			rootCause: "The existing goal name is too narrow for its configured target.",
		};
		const actionSignal = {
			...signal(subjectKey),
			entity: {
				id: goalId,
				label: "Clicked Nav",
				type: "goal" as const,
			},
		};

		await db().insert(goals).values({
			createdBy: member.id,
			description: "A narrow description.",
			id: goalId,
			name: "Clicked Nav",
			target: "nav_clicked",
			type: "EVENT",
			websiteId: website.id,
		});
		await db().insert(analyticsInsights).values(
			insightRow({
				id: insightId,
				organizationId: organization.id,
				subjectKey,
				websiteId: website.id,
			})
		);
		await db().insert(insightObservations).values({
			asOf: new Date("2026-01-10T00:00:00.000Z"),
			id: randomUUIDv7(),
			insightId,
			organizationId: organization.id,
			outcome,
			recheckAt: new Date("2026-01-17T00:00:00.000Z"),
			signal: actionSignal,
			signalKey: subjectKey,
			websiteId: website.id,
		});

		const applied = await call(
			appRouter.insights.applyGoalAction,
			userContext(member, organization.id)
		)({ insightId });

		expect(applied.reply).toMatchObject({
			body: "Databuddy applied the goal action. Recheck its verification condition against current data.",
			kind: "reply",
			status: "queued",
		});
		expect(
			await db()
				.select({ description: goals.description, name: goals.name })
				.from(goals)
				.where(eq(goals.id, goalId))
		).toEqual([
			{
				description: "Counts navigation activity across the site.",
				name: "Navigation clicks",
			},
		]);
		expect(
			(await getInsightsQueue().getJob(insightsResumeJobId(applied.reply.id)))
				?.data
		).toEqual({ replyId: applied.reply.id });
	});

	iit("remeasures an open goal investigation after a teammate edits its definition", async () => {
		const member = await signUp();
		const organization = await insertOrganization();
		await addToOrganization(member.id, organization.id, "member");
		const website = await insertWebsite({ organizationId: organization.id });
		const goalId = randomUUIDv7();
		const insightId = randomUUIDv7();
		const subjectKey = `goal:${goalId}`;
		await db().insert(goals).values({
			createdBy: member.id,
			id: goalId,
			name: "Signup complete",
			target: "signup_completed",
			type: "EVENT",
			websiteId: website.id,
		});
		await db().insert(analyticsInsights).values(
			insightRow({
				id: insightId,
				organizationId: organization.id,
				subjectKey,
				websiteId: website.id,
			})
		);
		await db().insert(insightObservations).values({
			asOf: new Date("2026-01-10T00:00:00.000Z"),
			id: randomUUIDv7(),
			insightId,
			organizationId: organization.id,
			outcome: investigationOutcome("act"),
			recheckAt: new Date("2026-01-17T00:00:00.000Z"),
			signal: {
				...signal(subjectKey),
				entity: { id: goalId, label: "Signup complete", type: "goal" },
			},
			signalKey: subjectKey,
			websiteId: website.id,
		});

		const context = userContext(member, organization.id);
		await call(appRouter.goals.update, context)({
			id: goalId,
			name: "Signup conversion",
		});
		await call(appRouter.goals.update, context)({
			description: "Counts completed signup events.",
			id: goalId,
		});

		const replies = await db()
			.select({
				authorName: insightReplies.authorName,
				body: insightReplies.body,
				id: insightReplies.id,
				status: insightReplies.status,
			})
			.from(insightReplies);
		expect(replies).toEqual([
			expect.objectContaining({
				authorName: "Databuddy",
				body: "Databuddy detected a goal definition change. Recheck the current evidence and resolve this investigation if the change addressed it.",
				status: "queued",
			}),
		]);
		expect(
			(await getInsightsQueue().getJob(insightsResumeJobId(replies[0]?.id ?? "")))
				?.data
		).toEqual({ replyId: replies[0]?.id });
	});

	iit("remeasures an open funnel-step investigation after its funnel changes", async () => {
		const member = await signUp();
		const organization = await insertOrganization();
		await addToOrganization(member.id, organization.id, "member");
		const website = await insertWebsite({ organizationId: organization.id });
		const funnelId = randomUUIDv7();
		const insightId = randomUUIDv7();
		const subjectKey = `funnel:${funnelId}:step:2`;
		await db().insert(funnelDefinitions).values({
			createdBy: member.id,
			id: funnelId,
			name: "Signup funnel",
			steps: [
				{ name: "Register", target: "/register", type: "PAGE_VIEW" },
				{ name: "Website", target: "/websites", type: "PAGE_VIEW" },
			],
			websiteId: website.id,
		});
		await db().insert(analyticsInsights).values(
			insightRow({
				id: insightId,
				organizationId: organization.id,
				subjectKey,
				websiteId: website.id,
			})
		);
		await db().insert(insightObservations).values({
			asOf: new Date("2026-01-10T00:00:00.000Z"),
			id: randomUUIDv7(),
			insightId,
			organizationId: organization.id,
			outcome: investigationOutcome("act"),
			recheckAt: new Date("2026-01-17T00:00:00.000Z"),
			signal: {
				...signal(subjectKey),
				entity: {
					id: `${funnelId}:step:2`,
					label: "Signup funnel → Website",
					type: "funnel_step",
				},
			},
			signalKey: subjectKey,
			websiteId: website.id,
		});

		await call(appRouter.funnels.update, userContext(member, organization.id))({
			description: "Tracks signup progress to the websites page.",
			id: funnelId,
		});

		expect(
			await db()
				.select({ body: insightReplies.body, status: insightReplies.status })
				.from(insightReplies)
		).toEqual([
			{
				body: "Databuddy detected a funnel definition change. Recheck the current evidence and resolve this investigation if the change addressed it.",
				status: "queued",
			},
		]);
	});

	iit("returns chronological insights without turning every observation into a case", async () => {
		const member = await signUp();
		const organization = await insertOrganization();
		await addToOrganization(member.id, organization.id, "member");
		const website = await insertWebsite({ organizationId: organization.id });
		const secondWebsite = await insertWebsite({
			organizationId: organization.id,
		});
		const otherOrganization = await insertOrganization();
		const otherWebsite = await insertWebsite({
			organizationId: otherOrganization.id,
		});
		const investigationId = randomUUIDv7();
		await db().insert(analyticsInsights).values(
			insightRow({
				id: investigationId,
				organizationId: organization.id,
				subjectKey: "goal:signup",
				websiteId: website.id,
			})
		);
		const improvedSignal = {
			...signal("goal:signup"),
			changePercent: 25,
			metric: {
				...signal("goal:signup").metric,
				current: 50,
				previous: 40,
			},
			sentiment: "positive" as const,
		};
		const improved: InvestigationOutcome = {
			evidence: ["Signup conversion rose from 40% to 50%."],
			impact: "Ten more visitors completed signup per 100 entrants.",
			next: {
				reason: "The improvement does not require corrective work.",
				type: "resolve",
			},
			publish: true,
			recommendation: {
				action:
					"Add “Counts completed signup events” to Signup completed’s description.",
				changes: {
					description: "Counts completed signup events.",
					name: null,
				},
				operation: "edit",
			},
			rootCause: null,
			summary: "Signup conversion improved from 40% to 50%.",
			title: "Signup conversion improved",
		};
		const legacyOutcome = investigationOutcome("watch");
		delete legacyOutcome.publish;
		await db().insert(insightObservations).values([
			{
				asOf: new Date("2025-12-01T00:00:00.000Z"),
				createdAt: new Date("2026-01-11T12:00:00.000Z"),
				id: randomUUIDv7(),
				insightId: null,
				organizationId: organization.id,
				outcome: improved,
				recheckAt: new Date("2026-02-10T00:00:00.000Z"),
				signal: improvedSignal,
				signalKey: "goal:signup",
				websiteId: website.id,
			},
			{
				asOf: new Date("2026-01-10T00:00:00.000Z"),
				createdAt: new Date("2026-01-10T12:00:00.000Z"),
				id: randomUUIDv7(),
				insightId: investigationId,
				organizationId: organization.id,
				outcome: investigationOutcome("act"),
				recheckAt: new Date("2026-01-11T00:00:00.000Z"),
				signal: signal("goal:signup"),
				signalKey: "goal:signup",
				websiteId: website.id,
			},
			{
				asOf: new Date("2026-01-09T00:00:00.000Z"),
				createdAt: new Date("2026-01-09T12:00:00.000Z"),
				id: randomUUIDv7(),
				insightId: null,
				organizationId: organization.id,
				outcome: investigationOutcome("watch"),
				recheckAt: new Date("2026-01-10T00:00:00.000Z"),
				signal: signal("goal:activation"),
				signalKey: "goal:activation",
				websiteId: secondWebsite.id,
			},
			{
				asOf: new Date("2026-01-08T00:00:00.000Z"),
				createdAt: new Date("2026-01-08T12:00:00.000Z"),
				id: randomUUIDv7(),
				insightId: null,
				organizationId: organization.id,
				outcome: {
					...investigationOutcome("watch"),
					publish: false,
					title: "Routine activation recheck",
				},
				recheckAt: new Date("2026-01-10T00:00:00.000Z"),
				signal: signal("goal:activation-routine"),
				signalKey: "goal:activation-routine",
				websiteId: secondWebsite.id,
			},
			{
				asOf: new Date("2026-01-07T00:00:00.000Z"),
				createdAt: new Date("2026-01-07T12:00:00.000Z"),
				id: randomUUIDv7(),
				insightId: null,
				organizationId: organization.id,
				outcome: legacyOutcome,
				recheckAt: new Date("2026-01-10T00:00:00.000Z"),
				signal: signal("goal:legacy"),
				signalKey: "goal:legacy",
				websiteId: secondWebsite.id,
			},
			{
				asOf: new Date("2026-01-12T00:00:00.000Z"),
				createdAt: new Date("2026-01-12T12:00:00.000Z"),
				id: randomUUIDv7(),
				insightId: null,
				organizationId: otherOrganization.id,
				outcome: investigationOutcome("watch"),
				recheckAt: new Date("2026-01-13T00:00:00.000Z"),
				signal: signal("goal:other"),
				signalKey: "goal:other",
				websiteId: otherWebsite.id,
			},
		]);

		const context = userContext(member, organization.id);
		const firstPage = await call(appRouter.insights.brief, context)({
			limit: 1,
			offset: 0,
			organizationId: organization.id,
		});
		expect(firstPage.hasMore).toBe(true);
		expect(firstPage.insights[0]).toMatchObject({
			impact: "Ten more visitors completed signup per 100 entrants.",
			investigationId: null,
			recommendation: {
				action:
					"Add “Counts completed signup events” to Signup completed’s description.",
				changes: {
					description: "Counts completed signup events.",
					name: null,
				},
				operation: "edit",
			},
			signal: {
				changePercent: 25,
				sentiment: "positive",
			},
			title: "Signup conversion improved",
			websiteId: website.id,
		});
		expect(firstPage.insights[0]).not.toHaveProperty("next");

		const secondPage = await call(appRouter.insights.brief, context)({
			limit: 1,
			offset: 1,
			organizationId: organization.id,
		});
		expect(secondPage.insights[0]?.investigationId).toBe(investigationId);

		const websiteOnly = await call(appRouter.insights.brief, context)({
			limit: 10,
			offset: 0,
			organizationId: organization.id,
			websiteId: secondWebsite.id,
		});
		expect(websiteOnly.insights).toHaveLength(1);
		expect(websiteOnly.insights[0]?.recommendation).toBeNull();
		expect(websiteOnly.insights[0]?.websiteId).toBe(secondWebsite.id);
	});

	iit("returns only the current published recommendation for each signal", async () => {
		const member = await signUp();
		const organization = await insertOrganization();
		await addToOrganization(member.id, organization.id, "member");
		const website = await insertWebsite({ organizationId: organization.id });
		const secondWebsite = await insertWebsite({
			organizationId: organization.id,
		});
		const emptyWebsite = await insertWebsite({
			organizationId: organization.id,
		});
		const otherOrganization = await insertOrganization();
		const otherWebsite = await insertWebsite({
			organizationId: otherOrganization.id,
		});
		const recommendationOutcome = (
			title: string,
			action: string
		): InvestigationOutcome => ({
			evidence: [`${title} is supported by current analytics.`],
			impact: null,
			next: {
				reason: "This suggestion does not need an investigation.",
				type: "resolve",
			},
			publish: true,
			recommendation: {
				action,
				changes: null,
				operation: null,
			},
			rootCause: null,
			summary: `${title} has a concrete improvement available.`,
			title,
		});
		const observation = (input: {
			action?: string;
			asOf: string;
			createdAt?: string;
			organizationId?: string;
			publish?: boolean;
			signalKey: string;
			title: string;
			websiteId?: string;
		}) => {
			const outcome = input.action
				? recommendationOutcome(input.title, input.action)
				: {
						...investigationOutcome("watch"),
						recommendation: null,
						title: input.title,
					};
			outcome.publish = input.publish ?? true;
			return {
				asOf: new Date(input.asOf),
				createdAt: new Date(input.createdAt ?? input.asOf),
				id: randomUUIDv7(),
				insightId: null,
				organizationId: input.organizationId ?? organization.id,
				outcome,
				recheckAt: new Date("2026-02-01T00:00:00.000Z"),
				signal: signal(input.signalKey),
				signalKey: input.signalKey,
				websiteId: input.websiteId ?? website.id,
			};
		};

		await db().insert(insightObservations).values([
			observation({
				action: "Use the original signup goal.",
				asOf: "2026-01-01T00:00:00.000Z",
				signalKey: "goal:signup",
				title: "Original signup recommendation",
			}),
			observation({
				asOf: "2026-01-03T00:00:00.000Z",
				publish: false,
				signalKey: "goal:signup",
				title: "Routine signup recheck",
			}),
			observation({
				action: "Use the updated signup goal.",
				asOf: "2026-01-02T00:00:00.000Z",
				signalKey: "goal:signup",
				title: "Updated signup recommendation",
			}),
			observation({
				action: "Add the measured checkout goal.",
				asOf: "2026-01-04T00:00:00.000Z",
				signalKey: "goal:checkout",
				title: "Checkout recommendation",
			}),
			observation({
				action: "Use the old activation goal.",
				asOf: "2026-01-05T00:00:00.000Z",
				signalKey: "goal:stale",
				title: "Stale recommendation",
			}),
			observation({
				asOf: "2026-01-06T00:00:00.000Z",
				signalKey: "goal:stale",
				title: "Stale recommendation retired",
			}),
			observation({
				action: "Add the activation goal.",
				asOf: "2026-01-07T00:00:00.000Z",
				signalKey: "goal:activation",
				title: "Activation recommendation",
				websiteId: secondWebsite.id,
			}),
			observation({
				action: "Do not expose this recommendation.",
				asOf: "2026-01-08T00:00:00.000Z",
				organizationId: otherOrganization.id,
				signalKey: "goal:other",
				title: "Other organization recommendation",
				websiteId: otherWebsite.id,
			}),
		]);

		const context = userContext(member, organization.id);
		const firstPage = await call(appRouter.insights.recommendations, context)({
			limit: 2,
			offset: 0,
			organizationId: organization.id,
		});
		expect(firstPage.hasMore).toBe(true);
		expect(firstPage.total).toBe(3);
		expect(
			firstPage.recommendations.map((item) => item.recommendation.action)
		).toEqual([
			"Add the activation goal.",
			"Add the measured checkout goal.",
		]);

		const secondPage = await call(appRouter.insights.recommendations, context)({
			limit: 2,
			offset: 2,
			organizationId: organization.id,
		});
		expect(secondPage.hasMore).toBe(false);
		expect(secondPage.total).toBe(3);
		expect(
			secondPage.recommendations.map((item) => item.recommendation.action)
		).toEqual(["Use the updated signup goal."]);

		const websiteOnly = await call(
			appRouter.insights.recommendations,
			context
		)({
			limit: 10,
			offset: 0,
			organizationId: organization.id,
			websiteId: website.id,
		});
		expect(
			websiteOnly.recommendations.map((item) => item.recommendation.action)
		).toEqual([
			"Add the measured checkout goal.",
			"Use the updated signup goal.",
		]);
		expect(websiteOnly.total).toBe(2);

		const pastEnd = await call(appRouter.insights.recommendations, context)({
			limit: 2,
			offset: 10,
			organizationId: organization.id,
		});
		expect(pastEnd).toMatchObject({
			hasMore: false,
			recommendations: [],
			total: 3,
		});

		const emptyScope = await call(appRouter.insights.recommendations, context)({
			limit: 10,
			offset: 0,
			organizationId: organization.id,
			websiteId: emptyWebsite.id,
		});
		expect(emptyScope).toMatchObject({
			hasMore: false,
			recommendations: [],
			total: 0,
		});
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
				signal: signal(signalKey),
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
				signal: signal(signalKey),
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
			entity: { id: "signup", label: "Signup", type: "goal" },
			kind: "investigation",
			metric: {
				current: 20,
				format: "percent",
				label: "Signup conversion",
				previous: 40,
			},
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

	iit("uses one scoped API-key reply across retries", async () => {
		const organization = await insertOrganization();
		const website = await insertWebsite({ organizationId: organization.id });
		await insertWebsite({ organizationId: organization.id });
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
			id: randomUUIDv7(),
			insightId,
			organizationId: organization.id,
			outcome: investigationOutcome("act"),
			recheckAt: new Date("2026-01-17T00:00:00.000Z"),
			signal: signal("goal:signup"),
			signalKey: "goal:signup",
			websiteId: website.id,
		});

		const principal = createInternalPrincipal({
			metadata: {
				resources: {
					global: ["manage:flags"],
					[`website:${website.id}`]: ["read:data", "manage:websites"],
				},
			},
			name: "MCP client",
			organizationId: organization.id,
			scopes: [],
		});
		const context = await createRPCContext(
			{ headers: new Headers() },
			principal
		);
		const input = {
			body: "The deploy completed at noon.",
			insightId,
			replyId: "mcp-request-1",
		};
		const mcpTools = createMcpTools({
			apiKey: principal.apiKey,
			organizationId: organization.id,
			requestHeaders: new Headers(),
			userId: null,
		});
		const listed = await mcpTools
			.find((tool) => tool.name === "list_investigations")
			?.handler({ limit: 20, offset: 0, websiteId: website.id });
		expect(listed?.isError).toBe(false);
		expect(listed?.structuredContent).toMatchObject({
			investigations: [expect.objectContaining({ id: insightId })],
		});
		const first = await call(appRouter.insights.reply, context)(input);
		const replyTool = mcpTools.find(
			(tool) => tool.name === "reply_to_investigation"
		);
		const retry = await replyTool?.handler({
			body: input.body,
			investigationId: insightId,
			replyId: input.replyId,
		});

		expect(retry?.isError).toBe(false);
		expect(retry?.structuredContent).toEqual({ reply: first.reply });
		expect(
			(await mcpTools.find((tool) => tool.name === "list_websites")?.handler({}))
				?.structuredContent
		).toEqual({
			total: 1,
			websites: [expect.objectContaining({ id: website.id })],
		});
		const listedWhileVerifying = await mcpTools
			.find((tool) => tool.name === "list_investigations")
			?.handler({ limit: 20, offset: 0, websiteId: website.id });
		expect(listedWhileVerifying?.isError).toBe(false);
		expect(listedWhileVerifying?.structuredContent).toMatchObject({
			investigations: [],
		});
		expect(await db().select().from(insightReplies)).toEqual([
			expect.objectContaining({
				authorId: null,
				authorName: "MCP client",
				body: input.body,
				id: input.replyId,
				insightId,
			}),
		]);

		const readOnlyPrincipal = createInternalPrincipal({
			name: "Read-only MCP client",
			organizationId: organization.id,
			scopes: ["read:data"],
		});
		const readOnlyContext = await createRPCContext(
			{ headers: new Headers() },
			readOnlyPrincipal
		);
		expect(
			(await call(appRouter.insights.getById, readOnlyContext)({ insightId }))
				.canReply
		).toBe(false);
		await expectCode(
			call(appRouter.insights.reply, readOnlyContext)({
				body: "I should not be able to reply.",
				insightId,
			}),
			"FORBIDDEN"
		);
		const denied = await createMcpTools({
			apiKey: readOnlyPrincipal.apiKey,
			organizationId: organization.id,
			requestHeaders: new Headers(),
			userId: null,
		})
			.find((tool) => tool.name === "reply_to_investigation")
			?.handler({
				body: "I should not be able to reply.",
				investigationId: insightId,
				replyId: "mcp-denied-request",
			});
		expect(denied?.isError).toBe(true);
		expect(denied?.content[0]).toMatchObject({
			type: "text",
			text: expect.stringContaining('"code":"unauthorized"'),
		});
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
			id: randomUUIDv7(),
			insightId,
			organizationId: organization.id,
			outcome: investigationOutcome("watch"),
			recheckAt: new Date("2026-01-17T00:00:00.000Z"),
			signal: signal("goal:signup"),
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
		title: "Signup conversion fell",
		description: "Signup conversion fell from 40% to 20%.",
		severity: "warning",
		sentiment: "negative",
		changePercent: -50,
		dedupeKey: `${input.websiteId}|${input.subjectKey}`,
		subjectKey: input.subjectKey,
		timezone: "UTC",
	};
}

function signal(signalKey: string) {
	return {
		signalKey,
		entity: { type: "goal" as const, id: "signup", label: "Signup" },
		metric: {
			label: "Signup conversion",
			current: 20,
			previous: 40,
			format: "percent" as const,
		},
		changePercent: -50,
		severity: "warning" as const,
		sentiment: "negative" as const,
		period: {
			current: { from: "2026-01-04", to: "2026-01-10" },
			previous: { from: "2025-12-28", to: "2026-01-03" },
		},
	};
}
