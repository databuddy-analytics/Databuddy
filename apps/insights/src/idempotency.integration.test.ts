import "@databuddy/test/env";
import { afterAll, beforeEach, describe, expect, it } from "bun:test";
import { shutdownPostgres, sql } from "@databuddy/db";
import {
	analyticsInsights,
	insightObservations,
	insightReplies,
	insightRunEffects,
	insightRunItems,
	insightRuns,
} from "@databuddy/db/schema";
import {
	closeInsightsQueue,
	getInsightsQueue,
	INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
	INSIGHTS_RESUME_JOB_NAME,
	type InsightsGenerateWebsiteJobData,
	insightsResumeJobId,
} from "@databuddy/redis";
import type { InvestigationOutcome } from "@databuddy/shared/insights";
import {
	closePostgres,
	db,
	hasTestDb,
	insertOrganization,
	insertWebsite,
	signUp,
	truncatePostgres,
} from "@databuddy/test";
import { eq } from "drizzle-orm";
import { randomUUIDv7 } from "bun";
import type { DetectedSignal } from "./detection";
import { generateWebsiteInsights } from "./generation";
import { prepareInvestigation } from "./investigation";
import {
	persistInvestigation,
	type WebsiteInvestigation,
} from "./persistence";
import { recordInsightReplyFailure, resumeInsightReply } from "./resume";
import {
	findRunObservation,
	loadInvestigationHistory,
	loadLatestSignalObservations,
} from "./observations";
import {
	drainInsightRunEffects,
	loadPreparedInsightRun,
	prepareInsightRun,
} from "./effects";
import {
	finalizeCompletedPreparedItem,
	recoverStaleInsightRuns,
	syncRunStatus,
} from "./recovery";

const runIntegration =
	process.env.INSIGHTS_INTEGRATION_TESTS === "true" && hasTestDb;
const describeIntegration = runIntegration ? describe : describe.skip;

async function replyStatus(id: string) {
	const [reply] = await db()
		.select({ status: insightReplies.status })
		.from(insightReplies)
		.where(eq(insightReplies.id, id));
	return reply?.status;
}

async function withAgentBillingDisabled<T>(run: () => Promise<T>): Promise<T> {
	const secret = process.env.AUTUMN_SECRET_KEY;
	delete process.env.AUTUMN_SECRET_KEY;
	try {
		return await run();
	} finally {
		if (secret === undefined) {
			delete process.env.AUTUMN_SECRET_KEY;
		} else {
			process.env.AUTUMN_SECRET_KEY = secret;
		}
	}
}

async function waitForDatabaseLock(table: string): Promise<void> {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		const result = await db().execute(sql<{ waiting: number }>`
			select count(*)::int as waiting
			from pg_stat_activity
			where datname = current_database()
				and pid <> pg_backend_pid()
				and wait_event_type = 'Lock'
				and query like ${`%${table}%`}
		`);
		if ((result.rows[0]?.waiting ?? 0) > 0) {
			return;
		}
		await new Promise((resolve) => setTimeout(resolve, 20));
	}
	throw new Error(`Timed out waiting for a database lock on ${table}`);
}

describeIntegration("insights idempotency integration", () => {
	beforeEach(async () => {
		await truncatePostgres();
	});

	afterAll(async () => {
		await closeInsightsQueue();
		await truncatePostgres();
		await shutdownPostgres();
		await closePostgres();
	});

	it("does not overwrite a reply committed after scheduled analysis began", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const insightId = randomUUIDv7();
		const runId = randomUUIDv7();
		const dedupeKey = `${website.id}|checkout`;
		const analysisStartedAt = new Date("2026-07-10T10:00:00.000Z");
		const replyCommittedAt = new Date("2026-07-10T10:01:00.000Z");
		await db().insert(analyticsInsights).values({
			...insightRow({
				dedupeKey,
				id: insightId,
				organizationId: org.id,
				runId: "original-run",
				title: "Original scheduled result",
				websiteId: website.id,
			}),
			createdAt: new Date("2026-07-10T09:00:00.000Z"),
		});
		await db()
			.update(analyticsInsights)
			.set({
				createdAt: replyCommittedAt,
				title: "Reply result that must win",
			})
			.where(eq(analyticsInsights.id, insightId));

		const staleCandidate = websiteInvestigation({
			title: "Stale scheduled result",
			website,
		});

		await expect(
			persistInvestigation({
				evidence: [],
				investigation: staleCandidate,
				notNewerThan: analysisStartedAt,
				organizationId: org.id,
				recheckAt: new Date("2026-07-17T10:00:00.000Z"),
				runId,
				timezone: "UTC",
			})
		).rejects.toThrow(
			"The investigation changed while scheduled analysis was running"
		);

		const [stored] = await db()
			.select({ createdAt: analyticsInsights.createdAt, title: analyticsInsights.title })
			.from(analyticsInsights)
			.where(eq(analyticsInsights.id, insightId));
		expect(stored).toEqual({
			createdAt: replyCommittedAt,
			title: "Reply result that must win",
		});
		const observations = await db()
			.select({ id: insightObservations.id })
			.from(insightObservations)
			.where(eq(insightObservations.websiteId, website.id));
		expect(observations).toHaveLength(0);
	});

	it("lazily upgrades a matching legacy insight without duplicating it", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const insightId = randomUUIDv7();
		const runId = randomUUIDv7();
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "succeeded",
		});
		await db().insert(analyticsInsights).values({
			...insightRow({
				dedupeKey: `temporary:${insightId}`,
				id: insightId,
				organizationId: org.id,
				runId: "legacy-run",
				title: "Legacy checkout result",
				websiteId: website.id,
			}),
			createdAt: new Date("2026-07-10T09:00:00.000Z"),
			dedupeKey: null,
		});

		const saved = await persistInvestigation({
			evidence: [],
			investigation: websiteInvestigation({
				title: "Current checkout result",
				website,
			}),
			notNewerThan: new Date("2026-07-10T10:00:00.000Z"),
			organizationId: org.id,
			recheckAt: new Date("2026-07-17T10:00:00.000Z"),
			runId,
			timezone: "UTC",
		});

		const rows = await db()
			.select({
				dedupeKey: analyticsInsights.dedupeKey,
				id: analyticsInsights.id,
				title: analyticsInsights.title,
			})
			.from(analyticsInsights)
			.where(eq(analyticsInsights.organizationId, org.id));
		expect(saved?.id).toBe(insightId);
		expect(rows).toEqual([
			{
				dedupeKey: `${website.id}|checkout`,
				id: insightId,
				title: "Current checkout result",
			},
		]);
	});

	it("keeps the case and observation identical when one run races", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
		});
		const asOf = new Date("2026-07-10T10:00:00.000Z");
		const results = await Promise.allSettled(
			["First outcome", "Second outcome"].map((title) =>
				persistInvestigation({
					evidence: [],
					investigation: websiteInvestigation({ title, website }),
					notNewerThan: asOf,
					organizationId: org.id,
					recheckAt: new Date("2026-07-17T10:00:00.000Z"),
					runId,
					timezone: "UTC",
				})
			)
		);

		expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(
			1
		);
		expect(results.filter((result) => result.status === "rejected")).toHaveLength(
			1
		);
		const [[stored], [observation]] = await Promise.all([
			db()
				.select({ title: analyticsInsights.title })
				.from(analyticsInsights)
				.where(eq(analyticsInsights.organizationId, org.id)),
			db()
				.select({ outcome: insightObservations.outcome })
				.from(insightObservations)
				.where(eq(insightObservations.runId, runId)),
		]);
		expect(stored.title).toBe(observation.outcome.title);
	});

	it("records first-time quiet outcomes without opening cases", async () => {
		const org = await insertOrganization();
		for (const { impact, next, title } of [
			{ impact: undefined, next: "watch", title: "watch outcome" },
			{ impact: undefined, next: "resolve", title: "resolve outcome" },
			{ impact: null, next: "ask", title: "unproven impact" },
		] as const) {
			const website = await insertWebsite({ organizationId: org.id });
			const runId = randomUUIDv7();
			const asOf = new Date("2026-07-10T10:00:00.000Z");
			const recheckAt = new Date("2026-07-17T10:00:00.000Z");
			await db().insert(insightRuns).values({
				id: runId,
				organizationId: org.id,
				status: "succeeded",
			});

			const saved = await persistInvestigation({
				evidence: [],
				investigation: websiteInvestigation({
					impact,
					next,
					title,
					website,
				}),
				notNewerThan: asOf,
				organizationId: org.id,
				recheckAt,
				runId,
				timezone: "UTC",
			});

			const [cases, observations, history] = await Promise.all([
				db()
					.select({ id: analyticsInsights.id })
					.from(analyticsInsights)
					.where(eq(analyticsInsights.websiteId, website.id)),
				db()
					.select({
						insightId: insightObservations.insightId,
						outcome: insightObservations.outcome,
						recheckAt: insightObservations.recheckAt,
					})
					.from(insightObservations)
					.where(eq(insightObservations.websiteId, website.id)),
				loadInvestigationHistory({
					organizationId: org.id,
					signalKey: "checkout",
					websiteId: website.id,
				}),
			]);

			expect(saved).toBeNull();
			expect(cases).toHaveLength(0);
			expect(observations).toEqual([
				{
					insightId: null,
					outcome: {
						...investigationOutcome(next, title),
						...(impact === null ? { impact: null } : {}),
					},
					recheckAt,
				},
			]);
			expect(history).toHaveLength(1);
			expect(history[0]?.kind).toBe("investigation");
		}
	});

	it("closes an existing case when the investigation becomes quiet", async () => {
		const org = await insertOrganization();
		for (const [next, resolvedReason, impact] of [
			["watch", "stale", undefined],
			["resolve", "recovered", undefined],
			["ask", "stale", null],
		] as const) {
			const website = await insertWebsite({ organizationId: org.id });
			const openedRunId = randomUUIDv7();
			const closedRunId = randomUUIDv7();
			await db().insert(insightRuns).values([
				{ id: openedRunId, organizationId: org.id, status: "succeeded" },
				{ id: closedRunId, organizationId: org.id, status: "succeeded" },
			]);
			const opened = await persistInvestigation({
				evidence: [],
				investigation: websiteInvestigation({
					next: "ask",
					title: "Checkout needs action",
					website,
				}),
				notNewerThan: new Date("2026-07-10T10:00:00.000Z"),
				organizationId: org.id,
				recheckAt: new Date("2026-08-09T10:00:00.000Z"),
				runId: openedRunId,
				timezone: "UTC",
			});
			const resolvedAt = new Date("2026-07-11T10:00:00.000Z");
			const quiet = await persistInvestigation({
				evidence: [],
				investigation: websiteInvestigation({
					impact,
					next,
					title: "Checkout no longer needs action",
					website,
				}),
				notNewerThan: resolvedAt,
				organizationId: org.id,
				recheckAt: new Date("2026-07-18T10:00:00.000Z"),
				runId: closedRunId,
				timezone: "UTC",
			});

			const [[stored], observations] = await Promise.all([
				db()
					.select({
						resolvedAt: analyticsInsights.resolvedAt,
						resolvedReason: analyticsInsights.resolvedReason,
						status: analyticsInsights.status,
					})
					.from(analyticsInsights)
					.where(eq(analyticsInsights.websiteId, website.id)),
				db()
					.select({ insightId: insightObservations.insightId })
					.from(insightObservations)
					.where(eq(insightObservations.websiteId, website.id)),
			]);

			expect(opened).not.toBeNull();
			expect(quiet).toBeNull();
			expect(stored).toEqual({
				resolvedAt,
				resolvedReason,
				status: "resolved",
			});
			expect(observations).toEqual([
				{ insightId: opened?.id },
				{ insightId: opened?.id },
			]);
		}
	});

	it("replays a linked quiet observation as zero visible results", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const openedRunId = randomUUIDv7();
		const quietRunId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const queueJobId = randomUUIDv7();
		await db().insert(insightRuns).values([
			{ id: openedRunId, organizationId: org.id, status: "succeeded" },
			{ id: quietRunId, organizationId: org.id, status: "running" },
		]);
		await db().insert(insightRunItems).values({
			id: itemId,
			organizationId: org.id,
			queueJobId,
			runId: quietRunId,
			status: "running",
			websiteId: website.id,
		});
		await persistInvestigation({
			evidence: [],
			investigation: websiteInvestigation({
				next: "ask",
				title: "Checkout needs action",
				website,
			}),
			notNewerThan: new Date("2026-07-10T10:00:00.000Z"),
			organizationId: org.id,
			recheckAt: new Date("2026-08-09T10:00:00.000Z"),
			runId: openedRunId,
			timezone: "UTC",
		});
		await persistInvestigation({
			evidence: [],
			investigation: websiteInvestigation({
				next: "watch",
				title: "Checkout is stable enough to watch",
				website,
			}),
			notNewerThan: new Date("2026-07-11T10:00:00.000Z"),
			organizationId: org.id,
			recheckAt: new Date("2026-07-18T10:00:00.000Z"),
			runId: quietRunId,
			timezone: "UTC",
		});

		const result = await generateWebsiteInsights({
			finalAttempt: false,
			itemId,
			organizationId: org.id,
			queueJobId,
			reason: "manual",
			requestedByUserId: null,
			runId: quietRunId,
			timezone: "UTC",
			websiteId: website.id,
		});
		const [item] = await db()
			.select({
				preparedStatus: insightRunItems.preparedStatus,
				resultCount: insightRunItems.resultCount,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		const effects = await db()
			.select({ id: insightRunEffects.id })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.runItemId, itemId));

		expect(result).toEqual({ resultCount: 0, status: "succeeded" });
		expect(item).toEqual({ preparedStatus: "succeeded", resultCount: 0 });
		expect(effects).toHaveLength(0);
	});

	it("resumes an older deep link and commits each reply once", async () => {
		const author = await signUp();
		const org = await insertOrganization();
		const website = await insertWebsite({
			integrations: {
				github: { owner: "databuddy-analytics", repo: "app" },
			},
			organizationId: org.id,
		});
		const otherWebsite = await insertWebsite({ organizationId: org.id });
		const olderInsightId = randomUUIDv7();
		const currentInsightId = randomUUIDv7();
		const otherInsightId = randomUUIDv7();
		const detected: DetectedSignal = {
			baseline: 40,
			current: 20,
			deltaPercent: -50,
			detectedAt: "2026-01-10",
			direction: "down",
			label: "Signup",
			method: "wow",
			metric: "goal:signup",
			severity: "warning",
		};
		const investigation = prepareInvestigation(detected, {
			lookbackDays: 7,
			websiteId: website.id,
		});
		const evidence = [
			{
				source: "web" as const,
				summary: "Signup conversion fell from 40% to 20%.",
			},
		];
		await db().insert(analyticsInsights).values([
			{
				...insightRow({
					dedupeKey: `older:${investigation.signal.signalKey}`,
					id: olderInsightId,
					organizationId: org.id,
					runId: "run-older",
					title: "Older signup case",
					websiteId: website.id,
				}),
				createdAt: new Date("2026-01-01T00:00:00.000Z"),
				subjectKey: investigation.signal.signalKey,
			},
			{
				...insightRow({
					dedupeKey: `other-site:${investigation.signal.signalKey}`,
					id: otherInsightId,
					organizationId: org.id,
					runId: "run-other-site",
					title: "Other website signup case",
					websiteId: otherWebsite.id,
				}),
				createdAt: new Date("2026-01-03T00:00:00.000Z"),
				subjectKey: investigation.signal.signalKey,
			},
			{
				...insightRow({
					dedupeKey: `current:${investigation.signal.signalKey}`,
					id: currentInsightId,
					organizationId: org.id,
					runId: "run-current",
					title: "Current signup case",
					websiteId: website.id,
				}),
				createdAt: new Date("2026-01-02T00:00:00.000Z"),
				subjectKey: investigation.signal.signalKey,
			},
		]);
		await db().insert(insightObservations).values({
			asOf: new Date("2026-01-10T00:00:00.000Z"),
			createdAt: new Date("2026-01-10T00:00:00.000Z"),
			evidence,
			id: randomUUIDv7(),
			insightId: currentInsightId,
			organizationId: org.id,
			outcome: investigationOutcome("ask"),
			recheckAt: new Date("2026-01-17T00:00:00.000Z"),
			runId: null,
			signal: investigation.signal,
			signalKey: investigation.signal.signalKey,
			websiteId: website.id,
		});
		const replyId = randomUUIDv7();
		await db().insert(insightReplies).values({
			authorId: author.id,
			authorName: "Test author",
			body: "The signup form changed in yesterday's deploy.",
			createdAt: new Date("2026-01-11T00:00:00.000Z"),
			id: replyId,
			insightId: olderInsightId,
			status: "running",
		});

		const action: InvestigationOutcome = {
			evidence: ["The form changed immediately before the conversion drop."],
			impact: "Signup completion is down by half.",
			impactConfidence: 0.95,
			next: {
				action: "Inspect the signup submit handler from the latest deploy.",
				kind: "code",
				owner: "Engineering",
				target: "Signup submit handler",
				type: "act",
				verification: "Signup conversion returns above 35% for 24 hours.",
			},
			rootCause: "The latest form change likely broke submission.",
			rootCauseConfidence: 0.8,
			sources: ["web"],
			summary: "The conversion drop began after the signup form changed.",
			title: "Signup submission likely broke after the deploy",
		};
		let calls = 0;
		let agentFinishedAt: Date | undefined;
		let receivedRepository: { owner: string; repo: string } | null = null;
		let receivedRequest: string | undefined;
		await expect(
			withAgentBillingDisabled(() =>
				resumeInsightReply(replyId, async (input) => {
					calls += 1;
					receivedRepository = input.githubRepository;
					receivedRequest = input.request?.body;
					await new Promise((resolve) => setTimeout(resolve, 5));
					agentFinishedAt = new Date();
					return { outcome: action, toolCallCount: 2 };
				})
			)
		).resolves.toBe("succeeded");
		expect(receivedRequest).toBe(
			"The signup form changed in yesterday's deploy."
		);
		expect(receivedRepository).toEqual({
			owner: "databuddy-analytics",
			repo: "app",
		});
		expect(calls).toBe(1);
		const [afterReply] = await db()
			.select({ createdAt: analyticsInsights.createdAt })
			.from(analyticsInsights)
			.where(eq(analyticsInsights.id, currentInsightId));
		if (!agentFinishedAt) {
			throw new Error("The reply agent did not finish");
		}
		expect(afterReply?.createdAt.getTime()).toBeGreaterThanOrEqual(
			agentFinishedAt.getTime()
		);

		await withAgentBillingDisabled(() =>
			resumeInsightReply(replyId, async () => {
				calls += 1;
				throw new Error("A completed reply must not rerun the agent");
			})
		);
		expect(calls).toBe(1);

		const secondReplyId = randomUUIDv7();
		await db().insert(insightReplies).values({
			authorId: null,
			authorName: "Test author",
			body: "That deploy was intentionally rolled back.",
			id: secondReplyId,
			insightId: olderInsightId,
			status: "queued",
		});
		const resolution: InvestigationOutcome = {
			...action,
			next: {
				reason: "The breaking deploy was intentionally rolled back.",
				type: "resolve",
			},
			summary: "The rollout was reversed and no further change is needed.",
			title: "Signup deploy was rolled back",
		};
		let secondHistoryKinds: string[] = [];
		let secondHistoryReplies: string[] = [];
		let secondRunUserId: string | undefined;
		let firstHistoricalWindow: { from: string; to: string } | undefined;
		await withAgentBillingDisabled(() =>
			resumeInsightReply(secondReplyId, async (input) => {
				secondHistoryKinds = input.history.map((item) => item.kind);
				secondHistoryReplies = input.history
					.filter((item) => item.kind === "reply")
					.map((item) => item.body);
				secondRunUserId = input.appContext.userId;
				firstHistoricalWindow = input.history.find(
					(item) => item.kind === "investigation"
				)?.signal.period.current;
				return {
					outcome: resolution,
					toolCallCount: 1,
				};
			})
		);
		expect(secondHistoryKinds).toEqual([
			"investigation",
			"reply",
			"investigation",
		]);
		expect(secondHistoryReplies).toEqual([
			"The signup form changed in yesterday's deploy.",
		]);
		expect(secondHistoryReplies).not.toContain(
			"That deploy was intentionally rolled back."
		);
		expect(secondRunUserId).toBe("system");
		expect(firstHistoricalWindow).toEqual(
			investigation.signal.period.current
		);

		const insights = await db()
			.select({
				id: analyticsInsights.id,
				resolvedReason: analyticsInsights.resolvedReason,
				status: analyticsInsights.status,
				title: analyticsInsights.title,
			})
			.from(analyticsInsights)
			.orderBy(analyticsInsights.createdAt);
		const observations = await db()
			.select({ id: insightObservations.id })
			.from(insightObservations);
		const replies = await db()
			.select({ status: insightReplies.status })
			.from(insightReplies)
			.orderBy(insightReplies.createdAt);
		expect(insights.find((row) => row.id === olderInsightId)?.title).toBe(
			"Older signup case"
		);
		expect(insights.find((row) => row.id === currentInsightId)).toMatchObject({
			resolvedReason: "recovered",
			status: "resolved",
			title: resolution.title,
		});
		expect(insights.find((row) => row.id === otherInsightId)?.title).toBe(
			"Other website signup case"
		);
		expect(observations).toHaveLength(3);
		expect(replies).toEqual([
			{ status: "succeeded" },
			{ status: "succeeded" },
		]);

		const failedReplyId = randomUUIDv7();
		await db().insert(insightReplies).values({
			authorId: author.id,
			authorName: "Test author",
			body: "Retry this context.",
			id: failedReplyId,
			insightId: olderInsightId,
			status: "running",
		});
		await recordInsightReplyFailure(failedReplyId, false);
		expect(await replyStatus(failedReplyId)).toBe("queued");
		await recordInsightReplyFailure(failedReplyId, true);
		expect(await replyStatus(failedReplyId)).toBe("failed");
		await db()
			.update(insightReplies)
			.set({ status: "succeeded" })
			.where(eq(insightReplies.id, failedReplyId));
		await recordInsightReplyFailure(failedReplyId, true);
		expect(await replyStatus(failedReplyId)).toBe("succeeded");
	});

	it("reconciles reply status at the worker boundary", async () => {
		const author = await signUp();
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const insightId = randomUUIDv7();
		const replyId = randomUUIDv7();
		await db().insert(analyticsInsights).values(
			insightRow({
				dedupeKey: `reply-worker:${replyId}`,
				id: insightId,
				organizationId: org.id,
				runId: "run-reply-worker",
				title: "Reply worker case",
				websiteId: website.id,
			})
		);
		await db().insert(insightReplies).values({
			authorId: author.id,
			authorName: "Test author",
			body: "Check this context",
			id: replyId,
			insightId,
			status: "queued",
		});

		const { processInsightsJob } = await import("./jobs");
		const job = {
			attemptsMade: 0,
			data: { replyId },
			id: insightsResumeJobId(replyId),
			name: INSIGHTS_RESUME_JOB_NAME,
			opts: { attempts: 3 },
		};
		await expect(
			processInsightsJob({ ...job, id: "wrong-reply-job" })
		).rejects.toThrow("identity does not match");
		expect(await replyStatus(replyId)).toBe("queued");

		await expect(processInsightsJob(job)).rejects.toThrow(
			"no investigation history"
		);
		expect(await replyStatus(replyId)).toBe("queued");

		await expect(
			processInsightsJob({ ...job, attemptsMade: 2 })
		).rejects.toThrow("no investigation history");
		expect(await replyStatus(replyId)).toBe("failed");
	});

	it("requeues stale replies that were committed without a queue job", async () => {
		const author = await signUp();
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const insightId = randomUUIDv7();
		const queuedReplyId = randomUUIDv7();
		const runningReplyId = randomUUIDv7();
		const createdAt = new Date("2026-07-01T00:00:00.000Z");
		await db().insert(analyticsInsights).values(
			insightRow({
				dedupeKey: `reply-recovery:${insightId}`,
				id: insightId,
				organizationId: org.id,
				runId: "run-reply-recovery",
				title: "Reply recovery case",
				websiteId: website.id,
			})
		);
		await db().insert(insightReplies).values([
			{
				authorId: author.id,
				authorName: "Test author",
				body: "Queued without a job",
				createdAt,
				id: queuedReplyId,
				insightId,
				status: "queued",
			},
			{
				authorId: author.id,
				authorName: "Test author",
				body: "Worker stalled",
				createdAt,
				id: runningReplyId,
				insightId,
				status: "running",
			},
		]);

		const result = await recoverStaleInsightRuns(
			new Date("2026-07-01T01:00:00.000Z")
		);
		expect(result).toMatchObject({ recoveredReplies: 2, scannedReplies: 2 });
		expect(await replyStatus(queuedReplyId)).toBe("queued");
		expect(await replyStatus(runningReplyId)).toBe("queued");

		const queue = getInsightsQueue();
		for (const replyId of [queuedReplyId, runningReplyId]) {
			const job = await queue.getJob(insightsResumeJobId(replyId));
			expect(job?.data).toEqual({ replyId });
			await job?.remove();
		}
	});

	it("keeps one outcome per run and reads memory as of the requested clock", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const firstRunId = randomUUIDv7();
		const secondRunId = randomUUIDv7();
		const thirdRunId = randomUUIDv7();
		await db().insert(insightRuns).values([
			{ id: firstRunId, organizationId: org.id, status: "succeeded" },
			{ id: secondRunId, organizationId: org.id, status: "succeeded" },
			{ id: thirdRunId, organizationId: org.id, status: "succeeded" },
		]);

		const detected: DetectedSignal = {
			baseline: 20,
			current: 5,
			deltaPercent: -75,
			detectedAt: "2026-01-01",
			direction: "down",
			label: "Signup",
			method: "wow",
			metric: "goal:signup",
			severity: "critical",
		};
		const investigation = prepareInvestigation(detected, {
			lookbackDays: 7,
			websiteId: website.id,
		});
		const secondaryInvestigation = prepareInvestigation(
			{
				...detected,
				deltaPercent: -50,
				label: "Purchase",
				metric: "goal:purchase",
			},
			{ lookbackDays: 7, websiteId: website.id }
		);
		const firstAsOf = new Date("2026-01-01T12:00:00.000Z");
		const secondaryAsOf = new Date("2026-01-03T12:00:00.000Z");
		const secondAsOf = new Date("2026-01-10T12:00:00.000Z");
		await db()
			.insert(insightObservations)
			.values([
				{
					asOf: firstAsOf,
					evidence: investigation.evidence,
					id: randomUUIDv7(),
					insightId: null,
					organizationId: org.id,
					outcome: investigationOutcome("watch"),
					recheckAt: new Date("2026-01-08T12:00:00.000Z"),
					runId: firstRunId,
					signal: investigation.signal,
					signalKey: investigation.signal.signalKey,
					websiteId: website.id,
				},
				{
					asOf: firstAsOf,
					evidence: investigation.evidence,
					id: randomUUIDv7(),
					insightId: null,
					organizationId: org.id,
					outcome: investigationOutcome("resolve"),
					recheckAt: new Date("2026-01-31T12:00:00.000Z"),
					runId: firstRunId,
					signal: investigation.signal,
					signalKey: investigation.signal.signalKey,
					websiteId: website.id,
				},
				{
					asOf: secondAsOf,
					evidence: investigation.evidence,
					id: randomUUIDv7(),
					insightId: null,
					organizationId: org.id,
					outcome: investigationOutcome("resolve"),
					recheckAt: new Date("2026-02-09T12:00:00.000Z"),
					runId: secondRunId,
					signal: investigation.signal,
					signalKey: investigation.signal.signalKey,
					websiteId: website.id,
				},
				{
					asOf: secondaryAsOf,
					evidence: investigation.evidence,
					id: randomUUIDv7(),
					insightId: null,
					organizationId: org.id,
					outcome: investigationOutcome("watch"),
					recheckAt: new Date("2026-01-10T12:00:00.000Z"),
					runId: thirdRunId,
					signal: secondaryInvestigation.signal,
					signalKey: secondaryInvestigation.signal.signalKey,
					websiteId: website.id,
				},
			])
			.onConflictDoNothing({
				target: [insightObservations.runId, insightObservations.websiteId],
			});

		const rows = await db()
			.select({ outcome: insightObservations.outcome })
			.from(insightObservations)
			.where(eq(insightObservations.websiteId, website.id));
		const replay = await findRunObservation({
			organizationId: org.id,
			runId: firstRunId,
			websiteId: website.id,
		});
		const historical = await loadLatestSignalObservations({
			asOf: new Date("2026-01-05T12:00:00.000Z"),
			organizationId: org.id,
			signalKeys: [
				investigation.signal.signalKey,
				secondaryInvestigation.signal.signalKey,
				investigation.signal.signalKey,
			],
			websiteId: website.id,
		});
		const latest = await loadLatestSignalObservations({
			asOf: new Date("2026-01-11T12:00:00.000Z"),
			organizationId: org.id,
			signalKeys: [
				investigation.signal.signalKey,
				secondaryInvestigation.signal.signalKey,
			],
			websiteId: website.id,
		});

		expect(rows).toHaveLength(3);
		expect(replay?.outcome.next.type).toBe("watch");
		expect(historical.size).toBe(2);
		expect(
			historical.get(investigation.signal.signalKey)?.recheckAt.toISOString()
		).toBe("2026-01-08T12:00:00.000Z");
		expect(
			historical.get(investigation.signal.signalKey)?.outcome.next.type
		).toBe("watch");
		expect(historical.get(investigation.signal.signalKey)?.asOf).toEqual(
			firstAsOf
		);
		expect(
			historical.get(investigation.signal.signalKey)?.evidence
		).toEqual(investigation.evidence);
		expect(
			historical.get(secondaryInvestigation.signal.signalKey)?.asOf
		).toEqual(secondaryAsOf);
		expect(latest.size).toBe(2);
		expect(latest.get(investigation.signal.signalKey)?.asOf).toEqual(secondAsOf);
		expect(
			latest.get(investigation.signal.signalKey)?.outcome.next.type
		).toBe("resolve");

		await db().delete(insightRuns).where(eq(insightRuns.id, firstRunId));
		const [preserved] = await db()
			.select({ runId: insightObservations.runId })
			.from(insightObservations)
			.where(eq(insightObservations.asOf, firstAsOf));
		expect(preserved?.runId).toBeNull();
	});

	it("prepares effects once and retries only unfinished provider calls", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const identity = {
			itemId,
			organizationId: org.id,
			queueJobId: null,
			runId,
			websiteId: website.id,
		};
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "running",
		});
		const slackPayload = (channelId: string) => ({
			blocks: [
				{
					type: "section",
					text: { type: "mrkdwn", text: "A bounded finding" },
				},
			],
			channelId,
			organizationId: org.id,
			text: "A bounded finding",
			websiteId: website.id,
		});
		const effects = [
			{
				effectKey: "channel-a",
				payload: slackPayload("channel-a"),
			},
			{
				effectKey: "channel-b",
				payload: slackPayload("channel-b"),
			},
		];
		expect(() =>
			prepareInsightRun({
				...identity,
				effects: [
					{
						effectKey: "wrong-tenant",
						payload: {
							...slackPayload("wrong-tenant"),
							organizationId: "another-organization",
						},
					},
				],
				result: { resultCount: 0, status: "succeeded" },
			})
		).toThrow("identity does not match");

		await prepareInsightRun({
			...identity,
			effects,
			result: { resultCount: 0, status: "succeeded" },
		});
		await prepareInsightRun({
			...identity,
			effects,
			result: { resultCount: 0, status: "succeeded" },
		});

		const initial = await db()
			.select({ id: insightRunEffects.id })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.runItemId, itemId));
		expect(initial).toHaveLength(2);
		const calls: Array<{ id: string; key: string }> = [];
		let failChannelB = true;
		const handlers = {
			slack: async (payload: { channelId: string }, id: string) => {
				calls.push({ id, key: payload.channelId });
				if (payload.channelId === "channel-b" && failChannelB) {
					throw new Error("temporary Slack failure");
				}
				return `ts:${payload.channelId}`;
			},
		};

		await expect(
			drainInsightRunEffects(identity, false, handlers)
		).rejects.toThrow("temporary Slack failure");
		const afterFirst = await db()
			.select({
				effectKey: insightRunEffects.effectKey,
				status: insightRunEffects.status,
			})
			.from(insightRunEffects)
			.where(eq(insightRunEffects.runItemId, itemId));
		expect(afterFirst).toEqual(
			expect.arrayContaining([
				{ effectKey: "channel-a", status: "succeeded" },
				{ effectKey: "channel-b", status: "pending" },
			])
		);
		const firstChannelBId = calls.find((call) => call.key === "channel-b")?.id;
		const firstChannelAId = calls.find((call) => call.key === "channel-a")?.id;
		failChannelB = false;
		calls.length = 0;
		await drainInsightRunEffects(identity, false, handlers);
		expect(calls).toEqual([{ id: firstChannelBId, key: "channel-b" }]);
		const prepared = await loadPreparedInsightRun(identity);
		expect(prepared).toMatchObject({
			resultCount: 0,
			status: "succeeded",
		});

		const [channelA] = await db()
			.select({ id: insightRunEffects.id })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.effectKey, "channel-a"));
		await db()
			.update(insightRunEffects)
			.set({ completedAt: null, status: "pending" })
			.where(eq(insightRunEffects.id, channelA.id));
		let concurrentCalls = 0;
		let releaseSuccess: (() => void) | undefined;
		let successStarted: (() => void) | undefined;
		const providerStarted = new Promise<void>((resolve) => {
			successStarted = resolve;
		});
		const failureRecorded = new Promise<void>((resolve) => {
			releaseSuccess = resolve;
		});
		const concurrentHandler = async () => {
			concurrentCalls += 1;
			if (concurrentCalls === 1) {
				successStarted?.();
				await failureRecorded;
				return "ts:channel-a";
			}
			throw new Error("concurrent final failure");
		};
		const successfulDrain = drainInsightRunEffects(identity, true, {
			slack: concurrentHandler,
		});
		await providerStarted;
		await expect(
			drainInsightRunEffects(identity, true, { slack: concurrentHandler })
		).rejects.toThrow("concurrent final failure");
		const [afterFinalFailure] = await db()
			.select({ status: insightRunEffects.status })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.id, channelA.id));
		expect(afterFinalFailure.status).toBe("failed");
		releaseSuccess?.();
		await successfulDrain;
		const [afterConcurrentDrain] = await db()
			.select({ status: insightRunEffects.status })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.id, channelA.id));
		expect(concurrentCalls).toBe(2);
		expect(afterConcurrentDrain.status).toBe("succeeded");

		await db()
			.update(insightRunEffects)
			.set({ completedAt: null, status: "pending" })
			.where(eq(insightRunEffects.id, channelA.id));
		const finalCalls: string[] = [];
		await expect(
			drainInsightRunEffects(identity, true, {
				slack: async (_payload, id) => {
					finalCalls.push(id);
					throw new Error("permanent Slack failure");
				},
			})
		).rejects.toThrow("permanent Slack failure");
		const [failed] = await db()
			.select({ status: insightRunEffects.status })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.id, channelA.id));
		expect(finalCalls).toEqual([channelA.id]);
		expect(firstChannelAId).toBe(channelA.id);
		expect(failed.status).toBe("failed");
		let replayCalls = 0;
		await expect(
			drainInsightRunEffects(identity, false, {
				slack: async () => {
					replayCalls += 1;
					return "ts:unexpected-replay";
				},
			})
		).rejects.toThrow("failed external effect");
		expect(replayCalls).toBe(0);
	});

	it("retries a known-success checkpoint without calling the provider again", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const identity = {
			itemId,
			organizationId: org.id,
			queueJobId: null,
			runId,
			websiteId: website.id,
		};
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "running",
		});
		await prepareInsightRun({
			...identity,
			effects: [
				{
					effectKey: "checkpoint-retry",
					payload: {
						blocks: [],
						channelId: "channel-checkpoint",
						organizationId: org.id,
						text: "A bounded finding",
						websiteId: website.id,
					},
				},
			],
			result: { resultCount: 0, status: "succeeded" },
		});

		await db().execute(sql.raw(`
			CREATE SEQUENCE insight_effect_checkpoint_test_seq START WITH 1;
			CREATE FUNCTION fail_first_insight_effect_checkpoint()
			RETURNS trigger
			LANGUAGE plpgsql
			AS $$
			BEGIN
				IF NEW.status = 'succeeded'
					AND OLD.status <> 'succeeded'
					AND nextval('insight_effect_checkpoint_test_seq') = 1
				THEN
					RAISE EXCEPTION 'transient success checkpoint failure';
				END IF;
				RETURN NEW;
			END;
			$$;
			CREATE TRIGGER fail_first_insight_effect_checkpoint_trigger
			BEFORE UPDATE OF status ON insight_run_effects
			FOR EACH ROW
			EXECUTE FUNCTION fail_first_insight_effect_checkpoint();
		`));

		let providerCalls = 0;
		try {
			await drainInsightRunEffects(identity, true, {
				slack: async () => {
					providerCalls += 1;
					return "ts:checkpoint-retry";
				},
			});
		} finally {
			await db().execute(sql.raw(`
				DROP TRIGGER IF EXISTS fail_first_insight_effect_checkpoint_trigger
				ON insight_run_effects;
				DROP FUNCTION IF EXISTS fail_first_insight_effect_checkpoint();
				DROP SEQUENCE IF EXISTS insight_effect_checkpoint_test_seq;
			`));
		}

		const [effect] = await db()
			.select({
				externalId: insightRunEffects.externalId,
				status: insightRunEffects.status,
			})
			.from(insightRunEffects)
			.where(eq(insightRunEffects.runItemId, itemId));
		expect(providerCalls).toBe(1);
		expect(effect).toEqual({
			externalId: "ts:checkpoint-retry",
			status: "succeeded",
		});
	});

	it("keeps a final-attempt success when run synchronization fails", async () => {
		const { processInsightsJob } = await import("./jobs");
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const queueJobId = `job-${itemId}`;
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
			totalItems: 1,
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			queueJobId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "running",
		});
		await prepareInsightRun({
			itemId,
			organizationId: org.id,
			queueJobId,
			runId,
			websiteId: website.id,
			effects: [],
			result: { resultCount: 0, status: "succeeded" },
		});

		await db().execute(sql.raw(`
			CREATE SEQUENCE insight_item_checkpoint_test_seq START WITH 1;
			CREATE FUNCTION fail_first_insight_item_checkpoint()
			RETURNS trigger
			LANGUAGE plpgsql
			AS $$
			BEGIN
				IF NEW.status = 'succeeded'
					AND OLD.status <> 'succeeded'
					AND nextval('insight_item_checkpoint_test_seq') = 1
				THEN
					RAISE EXCEPTION 'transient item success checkpoint failure';
				END IF;
				RETURN NEW;
			END;
			$$;
			CREATE TRIGGER fail_first_insight_item_checkpoint_trigger
			BEFORE UPDATE OF status ON insight_run_items
			FOR EACH ROW
			EXECUTE FUNCTION fail_first_insight_item_checkpoint();

			CREATE FUNCTION fail_insight_run_sync()
			RETURNS trigger
			LANGUAGE plpgsql
			AS $$
			BEGIN
				IF NEW.status = 'succeeded' THEN
					RAISE EXCEPTION 'forced run synchronization failure';
				END IF;
				RETURN NEW;
			END;
			$$;
			CREATE TRIGGER fail_insight_run_sync_trigger
			BEFORE UPDATE OF status ON insight_runs
			FOR EACH ROW
			EXECUTE FUNCTION fail_insight_run_sync();
		`));

		const data: InsightsGenerateWebsiteJobData = {
			itemId,
			organizationId: org.id,
			reason: "manual",
			runId,
			websiteId: website.id,
		};
		try {
			await expect(
				processInsightsJob({
					attemptsMade: 2,
					data,
					id: queueJobId,
					name: INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
					opts: { attempts: 3 },
				})
			).rejects.toThrow('Failed query: update "insight_runs"');
		} finally {
			await db().execute(sql.raw(`
				DROP TRIGGER IF EXISTS fail_first_insight_item_checkpoint_trigger
				ON insight_run_items;
				DROP FUNCTION IF EXISTS fail_first_insight_item_checkpoint();
				DROP SEQUENCE IF EXISTS insight_item_checkpoint_test_seq;
				DROP TRIGGER IF EXISTS fail_insight_run_sync_trigger
				ON insight_runs;
				DROP FUNCTION IF EXISTS fail_insight_run_sync();
			`));
		}

		const [item] = await db()
			.select({
				attempts: insightRunItems.attempts,
				errorMessage: insightRunItems.errorMessage,
				finishedAt: insightRunItems.finishedAt,
				status: insightRunItems.status,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		expect(item).toMatchObject({
			attempts: 3,
			errorMessage: null,
			status: "succeeded",
		});
		expect(item.finishedAt).toBeInstanceOf(Date);
	});

	it("rejects a crossed queue item before changing either tenant", async () => {
		const { processInsightsJob } = await import("./jobs");
		const firstOrg = await insertOrganization();
		const secondOrg = await insertOrganization();
		const firstWebsite = await insertWebsite({ organizationId: firstOrg.id });
		const secondWebsite = await insertWebsite({ organizationId: secondOrg.id });
		const firstRunId = randomUUIDv7();
		const secondRunId = randomUUIDv7();
		const firstItemId = randomUUIDv7();
		const secondItemId = randomUUIDv7();
		const firstJobId = `job-${firstItemId}`;
		const secondJobId = `job-${secondItemId}`;
		await db().insert(insightRuns).values([
			{
				id: firstRunId,
				organizationId: firstOrg.id,
				status: "queued",
				totalItems: 1,
			},
			{
				id: secondRunId,
				organizationId: secondOrg.id,
				status: "queued",
				totalItems: 1,
			},
		]);
		await db().insert(insightRunItems).values([
			{
				id: firstItemId,
				queueJobId: firstJobId,
				runId: firstRunId,
				organizationId: firstOrg.id,
				websiteId: firstWebsite.id,
			},
			{
				id: secondItemId,
				queueJobId: secondJobId,
				runId: secondRunId,
				organizationId: secondOrg.id,
				websiteId: secondWebsite.id,
			},
		]);
		const runState = () =>
			db()
				.select({
					id: insightRuns.id,
					organizationId: insightRuns.organizationId,
					startedAt: insightRuns.startedAt,
					status: insightRuns.status,
					updatedAt: insightRuns.updatedAt,
				})
				.from(insightRuns)
				.orderBy(insightRuns.id);
		const itemState = () =>
			db()
				.select({
					attempts: insightRunItems.attempts,
					id: insightRunItems.id,
					organizationId: insightRunItems.organizationId,
					queueJobId: insightRunItems.queueJobId,
					runId: insightRunItems.runId,
					startedAt: insightRunItems.startedAt,
					status: insightRunItems.status,
					updatedAt: insightRunItems.updatedAt,
					websiteId: insightRunItems.websiteId,
				})
				.from(insightRunItems)
				.orderBy(insightRunItems.id);
		const [runsBefore, itemsBefore] = await Promise.all([
			runState(),
			itemState(),
		]);

		await expect(
			processInsightsJob({
				attemptsMade: 0,
				data: {
					itemId: firstItemId,
					organizationId: secondOrg.id,
					reason: "manual",
					runId: secondRunId,
					websiteId: secondWebsite.id,
				},
				id: secondJobId,
				name: INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
				opts: { attempts: 3 },
			})
		).rejects.toThrow("identity does not match");

		const [runsAfter, itemsAfter] = await Promise.all([
			runState(),
			itemState(),
		]);
		expect(runsAfter).toEqual(runsBefore);
		expect(itemsAfter).toEqual(itemsBefore);
	});

	it("recovers a prepared item after its final worker dies before item success", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
			totalItems: 1,
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "running",
		});
		await prepareInsightRun({
			itemId,
			organizationId: org.id,
			queueJobId: null,
			runId,
			websiteId: website.id,
			effects: [],
			result: { resultCount: 0, status: "succeeded" },
		});

		expect(await finalizeCompletedPreparedItem(itemId)).toBe(true);
		const [item] = await db()
			.select({ status: insightRunItems.status })
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		expect(item.status).toBe("succeeded");
	});

	it("rescues a stale failed item after all prepared effects succeeded", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const pendingWebsite = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const pendingItemId = randomUUIDv7();
		const now = new Date();
		const staleAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "failed",
			totalItems: 2,
			failedItems: 1,
			errorMessage: "stale run failure",
			finishedAt: staleAt,
			updatedAt: staleAt,
		});
		await db().insert(insightRunItems).values([
			{
				id: itemId,
				runId,
				organizationId: org.id,
				websiteId: website.id,
				status: "running",
			},
			{
				id: pendingItemId,
				runId,
				organizationId: org.id,
				websiteId: pendingWebsite.id,
				status: "running",
				updatedAt: now,
			},
		]);
		await prepareInsightRun({
			itemId,
			organizationId: org.id,
			queueJobId: null,
			runId,
			websiteId: website.id,
			effects: [
				{
					effectKey: "completed-channel",
					payload: {
						blocks: [],
						channelId: "completed-channel",
						organizationId: org.id,
						text: "A bounded finding",
						websiteId: website.id,
					},
				},
			],
			result: { resultCount: 0, status: "succeeded" },
		});
		await db()
			.update(insightRunEffects)
			.set({ completedAt: staleAt, status: "succeeded" })
			.where(eq(insightRunEffects.runItemId, itemId));
		await db()
			.update(insightRunItems)
			.set({
				errorMessage: "late worker failure",
				finishedAt: staleAt,
				status: "failed",
				updatedAt: staleAt,
			})
			.where(eq(insightRunItems.id, itemId));

		const result = await recoverStaleInsightRuns(now);
		const [item] = await db()
			.select({
				errorMessage: insightRunItems.errorMessage,
				finishedAt: insightRunItems.finishedAt,
				status: insightRunItems.status,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		const [run] = await db()
			.select({
				completedItems: insightRuns.completedItems,
				errorMessage: insightRuns.errorMessage,
				failedItems: insightRuns.failedItems,
				finishedAt: insightRuns.finishedAt,
				status: insightRuns.status,
			})
			.from(insightRuns)
			.where(eq(insightRuns.id, runId));

		expect(result).toMatchObject({
			failedItems: 0,
			keptItems: 1,
			scannedItems: 1,
			syncedRuns: 1,
		});
		expect(item).toEqual({
			errorMessage: null,
			finishedAt: now,
			status: "succeeded",
		});
		expect(run).toEqual({
			completedItems: 1,
			errorMessage: null,
			failedItems: 0,
			finishedAt: null,
			status: "running",
		});
	});

	it("clears stale failed run fields when item state resolves to success", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const staleAt = new Date("2025-01-01T00:00:00.000Z");
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "failed",
			totalItems: 1,
			failedItems: 1,
			errorMessage: "stale run failure",
			finishedAt: staleAt,
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "succeeded",
		});

		const summary = await syncRunStatus(runId);
		const [run] = await db()
			.select({
				completedItems: insightRuns.completedItems,
				errorMessage: insightRuns.errorMessage,
				failedItems: insightRuns.failedItems,
				finishedAt: insightRuns.finishedAt,
				status: insightRuns.status,
			})
			.from(insightRuns)
			.where(eq(insightRuns.id, runId));

		expect(summary).toMatchObject({
			completedItems: 1,
			failedItems: 0,
			status: "succeeded",
		});
		expect(run).toMatchObject({
			completedItems: 1,
			errorMessage: null,
			failedItems: 0,
			status: "succeeded",
		});
		expect(run.finishedAt).toBeInstanceOf(Date);
		expect(run.finishedAt).not.toEqual(staleAt);
	});

	it("locks the run before deriving status from its items", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
			totalItems: 1,
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "running",
		});

		let releaseLock: (() => void) | undefined;
		let reportLock: (() => void) | undefined;
		const locked = new Promise<void>((resolve) => {
			reportLock = resolve;
		});
		const release = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		const terminalAt = new Date();
		const terminalWriter = db().transaction(async (tx) => {
			await tx
				.select({ id: insightRuns.id })
				.from(insightRuns)
				.where(eq(insightRuns.id, runId))
				.for("update");
			reportLock?.();
			await release;
			await tx
				.update(insightRunItems)
				.set({
					errorMessage: null,
					finishedAt: terminalAt,
					status: "succeeded",
					updatedAt: terminalAt,
				})
				.where(eq(insightRunItems.id, itemId));
			await tx
				.update(insightRuns)
				.set({
					completedItems: 1,
					errorMessage: null,
					failedItems: 0,
					finishedAt: terminalAt,
					status: "succeeded",
					updatedAt: terminalAt,
				})
				.where(eq(insightRuns.id, runId));
		});
		await locked;

		const staleSync = syncRunStatus(runId);
		await waitForDatabaseLock("insight_runs");
		releaseLock?.();
		const [, summary] = await Promise.all([terminalWriter, staleSync]);
		const [run] = await db()
			.select({
				completedItems: insightRuns.completedItems,
				failedItems: insightRuns.failedItems,
				status: insightRuns.status,
			})
			.from(insightRuns)
			.where(eq(insightRuns.id, runId));

		expect(summary).toMatchObject({
			completedItems: 1,
			failedItems: 0,
			status: "succeeded",
		});
		expect(run).toEqual({
			completedItems: 1,
			failedItems: 0,
			status: "succeeded",
		});
	});

	it("does not fail a stale item completed by a concurrent worker", async () => {
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const pendingWebsite = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const pendingItemId = randomUUIDv7();
		const now = new Date();
		const staleAt = new Date(now.getTime() - 24 * 60 * 60 * 1000);
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
			totalItems: 2,
			updatedAt: now,
		});
		await db().insert(insightRunItems).values([
			{
				id: itemId,
				runId,
				organizationId: org.id,
				websiteId: website.id,
				status: "running",
				updatedAt: staleAt,
			},
			{
				id: pendingItemId,
				runId,
				organizationId: org.id,
				websiteId: pendingWebsite.id,
				status: "running",
				updatedAt: now,
			},
		]);

		let releaseLock: (() => void) | undefined;
		let reportLock: (() => void) | undefined;
		const locked = new Promise<void>((resolve) => {
			reportLock = resolve;
		});
		const release = new Promise<void>((resolve) => {
			releaseLock = resolve;
		});
		const completedAt = new Date(now.getTime() + 1000);
		const worker = db().transaction(async (tx) => {
			await tx
				.select({ id: insightRunItems.id })
				.from(insightRunItems)
				.where(eq(insightRunItems.id, itemId))
				.for("update");
			reportLock?.();
			await release;
			await tx
				.update(insightRunItems)
				.set({
					errorMessage: null,
					finishedAt: completedAt,
					status: "succeeded",
					updatedAt: completedAt,
				})
				.where(eq(insightRunItems.id, itemId));
		});
		await locked;

		const recovery = recoverStaleInsightRuns(now);
		await waitForDatabaseLock("insight_run_items");
		releaseLock?.();
		const [, result] = await Promise.all([worker, recovery]);
		const [item] = await db()
			.select({
				errorMessage: insightRunItems.errorMessage,
				finishedAt: insightRunItems.finishedAt,
				status: insightRunItems.status,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		const [run] = await db()
			.select({
				completedItems: insightRuns.completedItems,
				failedItems: insightRuns.failedItems,
				status: insightRuns.status,
			})
			.from(insightRuns)
			.where(eq(insightRuns.id, runId));

		expect(result).toMatchObject({
			failedItems: 0,
			keptItems: 1,
			scannedItems: 1,
		});
		expect(item).toEqual({
			errorMessage: null,
			finishedAt: completedAt,
			status: "succeeded",
		});
		expect(run).toEqual({
			completedItems: 1,
			failedItems: 0,
			status: "running",
		});
	});

	it("still fails a final item when its prepared effect genuinely fails", async () => {
		const { processInsightsJob } = await import("./jobs");
		const org = await insertOrganization();
		const website = await insertWebsite({ organizationId: org.id });
		const runId = randomUUIDv7();
		const itemId = randomUUIDv7();
		const queueJobId = `job-${itemId}`;
		await db().insert(insightRuns).values({
			id: runId,
			organizationId: org.id,
			status: "running",
			totalItems: 1,
		});
		await db().insert(insightRunItems).values({
			id: itemId,
			queueJobId,
			runId,
			organizationId: org.id,
			websiteId: website.id,
			status: "running",
		});
		await prepareInsightRun({
			itemId,
			organizationId: org.id,
			queueJobId,
			runId,
			websiteId: website.id,
			effects: [
				{
					effectKey: "missing-channel",
					payload: {
						blocks: [],
						channelId: "missing-channel",
						organizationId: org.id,
						text: "A bounded finding",
						websiteId: website.id,
					},
				},
			],
			result: { resultCount: 0, status: "succeeded" },
		});

		const data: InsightsGenerateWebsiteJobData = {
			itemId,
			organizationId: org.id,
			reason: "manual",
			runId,
			websiteId: website.id,
		};
		await expect(
			processInsightsJob({
				attemptsMade: 2,
				data,
				id: queueJobId,
				name: INSIGHTS_GENERATE_WEBSITE_JOB_NAME,
				opts: { attempts: 3 },
			})
		).rejects.toThrow("Slack channel binding is missing");

		const [item] = await db()
			.select({
				errorMessage: insightRunItems.errorMessage,
				status: insightRunItems.status,
			})
			.from(insightRunItems)
			.where(eq(insightRunItems.id, itemId));
		const [effect] = await db()
			.select({ status: insightRunEffects.status })
			.from(insightRunEffects)
			.where(eq(insightRunEffects.runItemId, itemId));
		const [run] = await db()
			.select({ status: insightRuns.status })
			.from(insightRuns)
			.where(eq(insightRuns.id, runId));
		expect(item).toEqual({
			errorMessage: "Slack channel binding is missing",
			status: "failed",
		});
		expect(effect.status).toBe("failed");
		expect(run.status).toBe("failed");
	});
});

function insightRow(input: {
	dedupeKey: string;
	id: string;
	organizationId: string;
	runId: string;
	title: string;
	websiteId: string;
}): typeof analyticsInsights.$inferInsert {
	return {
		id: input.id,
		organizationId: input.organizationId,
		websiteId: input.websiteId,
		runId: input.runId,
		dedupeKey: input.dedupeKey,
		title: input.title,
		description: "A test insight description.",
		suggestion: "Inspect the affected flow.",
		severity: "warning",
		sentiment: "negative",
		type: "conversion_leak",
		priority: 8,
		changePercent: -12,
		subjectKey: "checkout",
		sources: ["web"],
		confidence: 0.82,
		impactSummary: "Checkout needs review.",
		metrics: [{ label: "Errors", current: 12, previous: 6, format: "number" }],
		timezone: "UTC",
		currentPeriodFrom: "2026-01-01",
		currentPeriodTo: "2026-01-08",
		previousPeriodFrom: "2025-12-25",
		previousPeriodTo: "2026-01-01",
	};
}

function investigationOutcome(
	next: "ask" | "resolve" | "watch" = "watch",
	title = "Checkout conversion fell"
): InvestigationOutcome {
	const nextStep: InvestigationOutcome["next"] =
		next === "ask"
			? {
					question: "Was the checkout change intentional?",
					who: "Product",
					why: "The answer determines whether to restore the flow.",
					type: "ask",
				}
			: next === "resolve"
				? { reason: "The measured regression recovered.", type: "resolve" }
				: {
						escalation: "Reopen the case if checkout falls again.",
						type: "watch",
					};
	return {
		evidence: ["Checkout conversion fell from 40% to 20%."],
		impact: "Checkout completion is affected.",
		impactConfidence: 0.8,
		next: nextStep,
		rootCause: null,
		rootCauseConfidence: 0.2,
		sources: ["web"],
		summary: "Checkout conversion needs investigation.",
		title,
	};
}

function websiteInvestigation(input: {
	impact?: string | null;
	next?: "ask" | "resolve" | "watch";
	title: string;
	website: { domain: string; id: string; name: string | null };
}): WebsiteInvestigation {
	const prepared = prepareInvestigation(
		{
			baseline: 40,
			current: 20,
			deltaPercent: -50,
			detectedAt: "2026-07-10",
			direction: "down",
			label: "Checkout",
			method: "wow",
			metric: "checkout",
			severity: "warning",
		},
		{ lookbackDays: 7, websiteId: input.website.id }
	);
	return {
		id: randomUUIDv7(),
		outcome: {
			...investigationOutcome(input.next ?? "ask", input.title),
			...(input.impact === undefined ? {} : { impact: input.impact }),
		},
		signal: prepared.signal,
		websiteDomain: input.website.domain,
		websiteId: input.website.id,
		websiteName: input.website.name,
	};
}
