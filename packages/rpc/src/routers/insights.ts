import { and, db, desc, eq, inArray, isNull, sql } from "@databuddy/db";
import {
	analyticsInsights,
	insightObservations,
	insightReplies,
	websites,
} from "@databuddy/db/schema";
import {
	enqueueInsightsResume,
	getInsightsQueue,
	insightsResumeJobId,
} from "@databuddy/redis";
import { ratelimit } from "@databuddy/redis/rate-limit";
import {
	investigationOutcomeSchema,
	insightSentimentSchema,
	insightSeveritySchema,
	parseInvestigationOutcome,
	weekOverWeekPeriodSchema,
} from "@databuddy/shared/insights";
import { ORPCError } from "@orpc/server";
import { roleHasPermission } from "@databuddy/auth/permissions";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { sessionProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const insightStatusSchema = z.enum(["open", "resolved"]);
const insightResolvedReasonSchema = z.enum(["recovered", "stale"]);
const insightReplyStatusSchema = z.enum([
	"queued",
	"running",
	"succeeded",
	"failed",
]);

const INSIGHT_TIMELINE_ROWS_PER_KIND = 50;

function isAccessDenied(error: unknown): boolean {
	return (
		error instanceof ORPCError &&
		(error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
	);
}

const historyInsightSchema = z.object({
	changePercent: z.number().optional(),
	description: z.string(),
	id: z.string(),
	resolvedReason: insightResolvedReasonSchema.nullable(),
	sentiment: insightSentimentSchema,
	severity: insightSeveritySchema,
	status: insightStatusSchema,
	title: z.string(),
	websiteDomain: z.string(),
	websiteId: z.string(),
	websiteName: z.string().nullable(),
});

const timelineOutcomeSchema = investigationOutcomeSchema
	.omit({ sources: true })
	.strip();

const insightTimelineInvestigationSchema = z.object({
	createdAt: z.string(),
	id: z.string(),
	kind: z.literal("investigation"),
	outcome: timelineOutcomeSchema,
	period: weekOverWeekPeriodSchema,
});

const insightTimelineReplySchema = z.object({
	author: z.string(),
	body: z.string(),
	createdAt: z.string(),
	id: z.string(),
	kind: z.literal("reply"),
	status: insightReplyStatusSchema,
});

const insightTimelineItemSchema = z.discriminatedUnion("kind", [
	insightTimelineInvestigationSchema,
	insightTimelineReplySchema,
]);

type InsightTimelineItem = z.infer<typeof insightTimelineItemSchema>;

async function queueInsightReply(
	replyId: string
): Promise<z.infer<typeof insightReplyStatusSchema>> {
	try {
		const status = await enqueueInsightsResume(replyId);
		if (status === "succeeded") {
			await db
				.update(insightReplies)
				.set({ status })
				.where(eq(insightReplies.id, replyId));
		}
		return status;
	} catch (error) {
		logger.error({ error, replyId }, "Failed to queue investigation reply");
		try {
			if (await getInsightsQueue().getJob(insightsResumeJobId(replyId))) {
				const status = await enqueueInsightsResume(replyId);
				if (status === "succeeded") {
					await db
						.update(insightReplies)
						.set({ status })
						.where(eq(insightReplies.id, replyId));
				}
				return status;
			}
		} catch (reconciliationError) {
			logger.warn(
				{ error: reconciliationError, replyId },
				"Could not confirm investigation reply queue state"
			);
			return "queued";
		}
		await db
			.update(insightReplies)
			.set({ status: "failed" })
			.where(
				and(eq(insightReplies.id, replyId), eq(insightReplies.status, "queued"))
			);
		return "failed";
	}
}

const insightSelection = {
	changePercent: analyticsInsights.changePercent,
	description: analyticsInsights.description,
	id: analyticsInsights.id,
	organizationId: analyticsInsights.organizationId,
	resolvedReason: analyticsInsights.resolvedReason,
	sentiment: analyticsInsights.sentiment,
	severity: analyticsInsights.severity,
	status: analyticsInsights.status,
	subjectKey: analyticsInsights.subjectKey,
	title: analyticsInsights.title,
	websiteDomain: websites.domain,
	websiteId: analyticsInsights.websiteId,
	websiteName: websites.name,
};

function selectInsights() {
	return db
		.select(insightSelection)
		.from(analyticsInsights)
		.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id));
}

type InsightRow = Awaited<ReturnType<typeof selectInsights>>[number];

function serializeInsight(
	row: InsightRow
): z.infer<typeof historyInsightSchema> {
	return {
		changePercent: row.changePercent ?? undefined,
		description: row.description,
		id: row.id,
		resolvedReason: row.resolvedReason ?? null,
		sentiment: row.sentiment,
		severity: row.severity,
		status: row.status,
		title: row.title,
		websiteDomain: row.websiteDomain,
		websiteId: row.websiteId,
		websiteName: row.websiteName,
	};
}

async function loadInsightTimeline(
	insight: InsightRow
): Promise<InsightTimelineItem[]> {
	const [observations, replies] = await Promise.all([
		db
			.select({
				createdAt: insightObservations.createdAt,
				id: insightObservations.id,
				outcome: insightObservations.outcome,
				signal: insightObservations.signal,
			})
			.from(insightObservations)
			.where(
				and(
					eq(insightObservations.organizationId, insight.organizationId),
					eq(insightObservations.websiteId, insight.websiteId),
					eq(insightObservations.signalKey, insight.subjectKey)
				)
			)
			.orderBy(
				desc(insightObservations.createdAt),
				desc(insightObservations.id)
			)
			.limit(INSIGHT_TIMELINE_ROWS_PER_KIND),
		db
			.select({
				authorName: insightReplies.authorName,
				body: insightReplies.body,
				createdAt: insightReplies.createdAt,
				id: insightReplies.id,
				status: insightReplies.status,
			})
			.from(insightReplies)
			.innerJoin(
				analyticsInsights,
				eq(insightReplies.insightId, analyticsInsights.id)
			)
			.where(
				and(
					eq(analyticsInsights.organizationId, insight.organizationId),
					eq(analyticsInsights.websiteId, insight.websiteId),
					eq(analyticsInsights.subjectKey, insight.subjectKey)
				)
			)
			.orderBy(desc(insightReplies.createdAt), desc(insightReplies.id))
			.limit(INSIGHT_TIMELINE_ROWS_PER_KIND),
	]);

	const timeline: InsightTimelineItem[] = [
		...observations.flatMap((observation) => {
			const parsed = parseInvestigationOutcome(observation.outcome);
			if (!parsed) {
				return [];
			}
			const { sources: _sources, ...outcome } = parsed;
			return {
				createdAt: observation.createdAt.toISOString(),
				id: observation.id,
				kind: "investigation" as const,
				outcome,
				period: observation.signal.period,
			};
		}),
		...replies.map((reply) => ({
			author: reply.authorName,
			body: reply.body,
			createdAt: reply.createdAt.toISOString(),
			id: reply.id,
			kind: "reply" as const,
			status: reply.status,
		})),
	];

	return timeline.sort(
		(a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
	);
}

export const insightsRouter = {
	history: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/history",
			tags: ["Insights"],
			summary: "List persisted insight history",
		})
		.input(
			z.object({
				limit: z.number().int().min(1).max(100).default(50),
				offset: z.number().int().min(0).default(0),
				organizationId: z.string().min(1),
				websiteId: z.string().min(1).optional(),
			})
		)
		.output(
			z.object({
				hasMore: z.boolean(),
				insights: z.array(historyInsightSchema),
			})
		)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["read"],
			});

			const whereClause = input.websiteId
				? and(
						eq(analyticsInsights.organizationId, input.organizationId),
						eq(analyticsInsights.websiteId, input.websiteId),
						isNull(websites.deletedAt)
					)
				: and(
						eq(analyticsInsights.organizationId, input.organizationId),
						isNull(websites.deletedAt)
					);

			const latestCases = db
				.selectDistinctOn(
					[analyticsInsights.websiteId, analyticsInsights.subjectKey],
					{
						...insightSelection,
						activityAt:
							sql<Date>`coalesce(${analyticsInsights.resolvedAt}, ${analyticsInsights.createdAt})`.as(
								"activity_at"
							),
					}
				)
				.from(analyticsInsights)
				.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
				.innerJoin(
					insightObservations,
					and(
						eq(
							insightObservations.organizationId,
							analyticsInsights.organizationId
						),
						eq(insightObservations.websiteId, analyticsInsights.websiteId),
						eq(insightObservations.signalKey, analyticsInsights.subjectKey)
					)
				)
				.where(whereClause)
				.orderBy(
					analyticsInsights.websiteId,
					analyticsInsights.subjectKey,
					desc(analyticsInsights.createdAt),
					desc(analyticsInsights.id)
				)
				.as("latest_insight_cases");
			const rows = await db
				.select()
				.from(latestCases)
				.orderBy(desc(latestCases.activityAt), desc(latestCases.id))
				.limit(input.limit + 1)
				.offset(input.offset);
			const page = rows.slice(0, input.limit);

			return {
				insights: page.map(serializeInsight),
				hasMore: rows.length > input.limit,
			};
		}),

	getById: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/getById",
			tags: ["Insights"],
			summary: "Get a single insight by id",
			description:
				"Resolves one insight regardless of status or feed position so deep links always open it. Authorized against the insight's own organization.",
		})
		.input(z.object({ insightId: z.string().min(1).max(256) }))
		.output(
			z.object({
				canReply: z.boolean(),
				insight: historyInsightSchema.nullable(),
				timeline: z.array(insightTimelineItemSchema),
			})
		)
		.handler(async ({ context, input }) => {
			const rate = await ratelimit(
				`insights:getById:${context.user.id}`,
				120,
				60
			);
			if (!rate.success) {
				throw rpcError.rateLimited(
					Math.max(1, Math.ceil((rate.reset - Date.now()) / 1000))
				);
			}

			const [row] = await selectInsights()
				.where(
					and(
						eq(analyticsInsights.id, input.insightId),
						isNull(websites.deletedAt)
					)
				)
				.limit(1);

			if (!row) {
				return {
					canReply: false,
					insight: null,
					timeline: [],
				};
			}

			const workspace = await withWorkspace(context, {
				organizationId: row.organizationId,
				resource: "organization",
				permissions: ["read"],
				allowCrossOrg: true,
			}).catch((error) => {
				if (isAccessDenied(error)) {
					return null;
				}
				throw error;
			});

			if (!workspace) {
				return {
					canReply: false,
					insight: null,
					timeline: [],
				};
			}

			const [current] = await selectInsights()
				.where(
					and(
						eq(analyticsInsights.organizationId, row.organizationId),
						eq(analyticsInsights.websiteId, row.websiteId),
						eq(analyticsInsights.subjectKey, row.subjectKey),
						isNull(websites.deletedAt)
					)
				)
				.orderBy(desc(analyticsInsights.createdAt), desc(analyticsInsights.id))
				.limit(1);
			const insight = current ?? row;
			const timeline = await loadInsightTimeline(insight);
			const hasInvestigation = timeline.some(
				(item) => item.kind === "investigation"
			);
			if (!hasInvestigation) {
				return {
					canReply: false,
					insight: null,
					timeline: [],
				};
			}

			return {
				canReply: roleHasPermission(workspace.role ?? "", "website", [
					"update",
				]),
				insight: serializeInsight(insight),
				timeline,
			};
		}),

	reply: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/reply",
			tags: ["Insights"],
			summary: "Add context to an investigation",
		})
		.input(
			z.object({
				body: z.string().trim().min(1).max(2000),
				insightId: z.string().min(1).max(256),
			})
		)
		.output(
			z.object({
				reply: insightTimelineReplySchema,
			})
		)
		.handler(async ({ context, input }) => {
			const [insight] = await db
				.select({
					organizationId: analyticsInsights.organizationId,
					subjectKey: analyticsInsights.subjectKey,
					websiteId: analyticsInsights.websiteId,
				})
				.from(analyticsInsights)
				.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
				.where(
					and(
						eq(analyticsInsights.id, input.insightId),
						isNull(websites.deletedAt)
					)
				)
				.limit(1);

			if (!insight) {
				throw rpcError.notFound("insight", input.insightId);
			}

			await withWorkspace(context, {
				allowCrossOrg: true,
				organizationId: insight.organizationId,
				permissions: ["update"],
				websiteId: insight.websiteId,
			});
			const id = randomUUIDv7();
			const createdAt = new Date();
			const authorName = context.user.name.trim() || "Team member";
			await db.transaction(async (tx) => {
				const insightCase = and(
					eq(analyticsInsights.organizationId, insight.organizationId),
					eq(analyticsInsights.websiteId, insight.websiteId),
					eq(analyticsInsights.subjectKey, insight.subjectKey)
				);
				const [current] = await tx
					.select({ id: analyticsInsights.id })
					.from(analyticsInsights)
					.where(insightCase)
					.orderBy(
						desc(analyticsInsights.createdAt),
						desc(analyticsInsights.id)
					)
					.limit(1)
					.for("update");
				if (!current) {
					throw rpcError.notFound("insight", input.insightId);
				}

				const [observation] = await tx
					.select({ id: insightObservations.id })
					.from(insightObservations)
					.where(
						and(
							eq(insightObservations.organizationId, insight.organizationId),
							eq(insightObservations.websiteId, insight.websiteId),
							eq(insightObservations.signalKey, insight.subjectKey)
						)
					)
					.limit(1);
				if (!observation) {
					throw rpcError.badRequest(
						"This finding has no investigation history to continue"
					);
				}

				const [active] = await tx
					.select({ id: insightReplies.id })
					.from(insightReplies)
					.innerJoin(
						analyticsInsights,
						eq(insightReplies.insightId, analyticsInsights.id)
					)
					.where(
						and(
							inArray(insightReplies.status, ["queued", "running"]),
							insightCase
						)
					)
					.limit(1);
				if (active) {
					throw rpcError.badRequest(
						"Databuddy is already investigating the latest reply"
					);
				}

				await tx.insert(insightReplies).values({
					authorId: context.user.id,
					authorName,
					body: input.body,
					createdAt,
					id,
					insightId: current.id,
					status: "queued",
				});
			});
			const status = await queueInsightReply(id);

			return {
				reply: {
					author: authorName,
					body: input.body,
					createdAt: createdAt.toISOString(),
					id,
					kind: "reply" as const,
					status,
				},
			};
		}),

	retryReply: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/reply/retry",
			tags: ["Insights"],
			summary: "Retry an investigation reply",
		})
		.input(z.object({ replyId: z.string().min(1).max(256) }))
		.output(
			z.object({
				replyId: z.string(),
				status: insightReplyStatusSchema,
			})
		)
		.handler(async ({ context, input }) => {
			const [reply] = await db
				.select({
					organizationId: analyticsInsights.organizationId,
					status: insightReplies.status,
					subjectKey: analyticsInsights.subjectKey,
					websiteId: analyticsInsights.websiteId,
				})
				.from(insightReplies)
				.innerJoin(
					analyticsInsights,
					eq(insightReplies.insightId, analyticsInsights.id)
				)
				.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
				.where(
					and(eq(insightReplies.id, input.replyId), isNull(websites.deletedAt))
				)
				.limit(1);
			if (!reply) {
				throw rpcError.notFound("insight reply", input.replyId);
			}
			await withWorkspace(context, {
				allowCrossOrg: true,
				organizationId: reply.organizationId,
				permissions: ["update"],
				websiteId: reply.websiteId,
			});
			const pendingStatus = await db.transaction(async (tx) => {
				const insightCase = and(
					eq(analyticsInsights.organizationId, reply.organizationId),
					eq(analyticsInsights.websiteId, reply.websiteId),
					eq(analyticsInsights.subjectKey, reply.subjectKey)
				);
				const [current] = await tx
					.select({ id: analyticsInsights.id })
					.from(analyticsInsights)
					.where(insightCase)
					.orderBy(
						desc(analyticsInsights.createdAt),
						desc(analyticsInsights.id)
					)
					.limit(1)
					.for("update");
				if (!current) {
					throw rpcError.notFound("insight reply", input.replyId);
				}

				const [latest] = await tx
					.select({ id: insightReplies.id, status: insightReplies.status })
					.from(insightReplies)
					.innerJoin(
						analyticsInsights,
						eq(insightReplies.insightId, analyticsInsights.id)
					)
					.where(insightCase)
					.orderBy(desc(insightReplies.createdAt), desc(insightReplies.id))
					.limit(1);
				if (latest?.id !== input.replyId) {
					throw rpcError.badRequest("Only the latest reply can be retried");
				}
				if (latest.status !== "failed") {
					return latest.status;
				}

				const [observation] = await tx
					.select({ id: insightObservations.id })
					.from(insightObservations)
					.where(
						and(
							eq(insightObservations.organizationId, reply.organizationId),
							eq(insightObservations.websiteId, reply.websiteId),
							eq(insightObservations.signalKey, reply.subjectKey)
						)
					)
					.limit(1);
				if (!observation) {
					throw rpcError.badRequest(
						"This finding has no investigation history to continue"
					);
				}

				const [active] = await tx
					.select({ id: insightReplies.id })
					.from(insightReplies)
					.innerJoin(
						analyticsInsights,
						eq(insightReplies.insightId, analyticsInsights.id)
					)
					.where(
						and(
							insightCase,
							inArray(insightReplies.status, ["queued", "running"])
						)
					)
					.limit(1);
				if (active) {
					throw rpcError.badRequest(
						"Databuddy is already investigating the latest reply"
					);
				}

				await tx
					.update(insightReplies)
					.set({ status: "queued" })
					.where(
						and(
							eq(insightReplies.id, input.replyId),
							eq(insightReplies.status, "failed")
						)
					);
				return "queued" as const;
			});

			if (pendingStatus !== "queued") {
				return {
					replyId: input.replyId,
					status: pendingStatus,
				};
			}
			const status = await queueInsightReply(input.replyId);
			return { replyId: input.replyId, status };
		}),
};
