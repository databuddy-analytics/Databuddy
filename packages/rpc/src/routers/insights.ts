import {
	and,
	db,
	desc,
	eq,
	inArray,
	isNull,
	notExists,
	sql,
} from "@databuddy/db";
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
	historyInsightSchema,
	insightBriefItemSchema,
	insightReplySlackDeliverySchema,
	insightReplyStatusSchema,
	insightTimelineItemSchema,
	insightTimelineReplySchema,
	parseInvestigationOutcome,
	parseInvestigationSignal,
} from "@databuddy/shared/insights";
import { ORPCError } from "@orpc/server";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { logger } from "../lib/logger";
import { type Context, protectedProcedure, sessionProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const INSIGHT_TIMELINE_ROWS_PER_KIND = 50;

function isAccessDenied(error: unknown): boolean {
	return (
		error instanceof ORPCError &&
		(error.code === "FORBIDDEN" || error.code === "UNAUTHORIZED")
	);
}

const appendInvestigationReplyInputSchema = z
	.object({
		body: z.string().trim().min(1).max(2000),
		insightId: z.string().min(1).max(256),
		replyId: z
			.string()
			.trim()
			.min(1)
			.max(200)
			.refine((value) => !value.includes(":"), {
				message: "Reply ids cannot contain colons",
			})
			.optional(),
	})
	.strict();

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

const insightBriefSelection = {
	asOf: insightObservations.asOf,
	createdAt: insightObservations.createdAt,
	id: insightObservations.id,
	investigationId: analyticsInsights.id,
	outcome: insightObservations.outcome,
	signal: insightObservations.signal,
	websiteDomain: websites.domain,
	websiteId: insightObservations.websiteId,
	websiteName: websites.name,
};

interface InsightBriefRow {
	asOf: Date;
	createdAt: Date;
	id: string;
	investigationId: string | null;
	outcome: (typeof insightObservations.$inferSelect)["outcome"];
	signal: (typeof insightObservations.$inferSelect)["signal"];
	websiteDomain: string;
	websiteId: string;
	websiteName: string | null;
}

function serializeInsightBrief(
	row: InsightBriefRow
): z.infer<typeof insightBriefItemSchema> | null {
	const outcome = parseInvestigationOutcome(row.outcome);
	const signal = parseInvestigationSignal(row.signal);
	if (!(outcome && signal)) {
		return null;
	}
	return {
		asOf: row.asOf.toISOString(),
		createdAt: row.createdAt.toISOString(),
		evidence: outcome.evidence,
		id: row.id,
		impact: outcome.impact,
		investigationId: row.investigationId ?? null,
		recommendation: outcome.recommendation ?? null,
		rootCause: outcome.rootCause,
		signal,
		summary: outcome.summary,
		title: outcome.title,
		websiteDomain: row.websiteDomain,
		websiteId: row.websiteId,
		websiteName: row.websiteName,
	};
}

async function authorizeInsightsRead(
	context: Context,
	input: { organizationId: string; websiteId?: string }
) {
	if (input.websiteId) {
		await withWorkspace(context, {
			organizationId: input.organizationId,
			permissions: ["read"],
			websiteId: input.websiteId,
		});
		return;
	}
	await withWorkspace(context, {
		organizationId: input.organizationId,
		resource: "organization",
		permissions: ["read"],
	});
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
			return {
				createdAt: observation.createdAt.toISOString(),
				entity: observation.signal.entity,
				id: observation.id,
				kind: "investigation" as const,
				metric: observation.signal.metric,
				outcome: parsed,
				period: observation.signal.period,
				subject: observation.signal.entity.label,
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

const investigationReplyAuthorNameSchema = z.string().trim().min(1).max(120);

function replyAuthor(
	context: Context,
	authorName?: string
): {
	authorId: string | null;
	authorName: string;
} {
	if (authorName) {
		return {
			authorId: context.user?.id ?? null,
			authorName,
		};
	}
	if (context.user) {
		return {
			authorId: context.user.id,
			authorName: context.user.name.trim() || "Team member",
		};
	}

	return {
		authorId: null,
		authorName: context.apiKey?.name.trim() || "API client",
	};
}

export async function appendInvestigationReply(
	input: z.input<typeof appendInvestigationReplyInputSchema> & {
		authorName?: string;
		context: Context;
		slackDelivery?: z.input<typeof insightReplySlackDeliverySchema>;
	}
): Promise<{
	created: boolean;
	reply: z.infer<typeof insightTimelineReplySchema>;
}> {
	const {
		authorName: rawAuthorName,
		context,
		slackDelivery: rawSlackDelivery,
		...rawInput
	} = input;
	const parsed = appendInvestigationReplyInputSchema.parse(rawInput);
	const slackDelivery =
		rawSlackDelivery === undefined
			? null
			: insightReplySlackDeliverySchema.parse(rawSlackDelivery);
	const authorName =
		rawAuthorName === undefined
			? undefined
			: investigationReplyAuthorNameSchema.parse(rawAuthorName);
	const id = parsed.replyId ?? randomUUIDv7();
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
				eq(analyticsInsights.id, parsed.insightId),
				isNull(websites.deletedAt)
			)
		)
		.limit(1);

	if (!insight) {
		throw rpcError.notFound("insight", parsed.insightId);
	}

	await withWorkspace(context, {
		allowCrossOrg: true,
		organizationId: insight.organizationId,
		permissions: ["update"],
		websiteId: insight.websiteId,
	});

	const author = replyAuthor(context, authorName);
	const createdAt = new Date();
	const stored = await db.transaction(async (tx) => {
		const insightCase = and(
			eq(analyticsInsights.organizationId, insight.organizationId),
			eq(analyticsInsights.websiteId, insight.websiteId),
			eq(analyticsInsights.subjectKey, insight.subjectKey)
		);
		const [current] = await tx
			.select({ id: analyticsInsights.id })
			.from(analyticsInsights)
			.where(insightCase)
			.orderBy(desc(analyticsInsights.createdAt), desc(analyticsInsights.id))
			.limit(1)
			.for("update");
		if (!current) {
			throw rpcError.notFound("insight", parsed.insightId);
		}

		const [existing] = await tx
			.select({
				authorName: insightReplies.authorName,
				body: insightReplies.body,
				createdAt: insightReplies.createdAt,
				id: insightReplies.id,
				organizationId: analyticsInsights.organizationId,
				slackDelivery: insightReplies.slackDelivery,
				status: insightReplies.status,
				subjectKey: analyticsInsights.subjectKey,
				websiteId: analyticsInsights.websiteId,
			})
			.from(insightReplies)
			.innerJoin(
				analyticsInsights,
				eq(insightReplies.insightId, analyticsInsights.id)
			)
			.where(eq(insightReplies.id, id))
			.limit(1);
		if (existing) {
			if (
				existing.organizationId !== insight.organizationId ||
				existing.websiteId !== insight.websiteId ||
				existing.subjectKey !== insight.subjectKey ||
				existing.body !== parsed.body ||
				existing.slackDelivery?.channelId !== slackDelivery?.channelId ||
				existing.slackDelivery?.threadTs !== slackDelivery?.threadTs
			) {
				throw rpcError.conflict(
					"Reply id is already used for different context"
				);
			}
			return {
				created: false as const,
				reply: {
					author: existing.authorName,
					body: existing.body,
					createdAt: existing.createdAt,
					id: existing.id,
					status: existing.status,
				},
			};
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
				"This investigation has no history to continue"
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
				and(inArray(insightReplies.status, ["queued", "running"]), insightCase)
			)
			.limit(1);
		if (active) {
			throw rpcError.badRequest(
				"Databuddy is already investigating the latest reply"
			);
		}

		await tx.insert(insightReplies).values({
			...author,
			body: parsed.body,
			createdAt,
			id,
			insightId: current.id,
			slackDelivery,
			status: "queued",
		});
		return {
			created: true as const,
			reply: {
				author: author.authorName,
				body: parsed.body,
				createdAt,
				id,
				status: "queued" as const,
			},
		};
	});

	const status =
		stored.created || stored.reply.status === "queued"
			? await queueInsightReply(stored.reply.id)
			: stored.reply.status;
	return {
		created: stored.created,
		reply: {
			author: stored.reply.author,
			body: stored.reply.body,
			createdAt: stored.reply.createdAt.toISOString(),
			id: stored.reply.id,
			kind: "reply",
			status,
		},
	};
}

export const insightsRouter = {
	brief: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/brief",
			tags: ["Insights"],
			summary: "List chronological insight observations",
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
				insights: z.array(insightBriefItemSchema),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeInsightsRead(context, input);
			const rows = await db
				.select(insightBriefSelection)
				.from(insightObservations)
				.innerJoin(websites, eq(insightObservations.websiteId, websites.id))
				.leftJoin(
					analyticsInsights,
					and(
						eq(insightObservations.insightId, analyticsInsights.id),
						eq(
							insightObservations.organizationId,
							analyticsInsights.organizationId
						),
						eq(insightObservations.websiteId, analyticsInsights.websiteId),
						eq(insightObservations.signalKey, analyticsInsights.subjectKey)
					)
				)
				.where(
					and(
						eq(insightObservations.organizationId, input.organizationId),
						input.websiteId
							? eq(insightObservations.websiteId, input.websiteId)
							: undefined,
						sql`${insightObservations.outcome}->>'publish' = 'true'`,
						isNull(websites.deletedAt)
					)
				)
				.orderBy(
					desc(insightObservations.createdAt),
					desc(insightObservations.id)
				)
				.limit(input.limit + 1)
				.offset(input.offset);
			const page = rows.slice(0, input.limit).flatMap((row) => {
				const insight = serializeInsightBrief(row);
				return insight ? [insight] : [];
			});
			return {
				hasMore: rows.length > input.limit,
				insights: page,
			};
		}),

	history: protectedProcedure
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
			await authorizeInsightsRead(context, input);
			const hasNoActiveReply = notExists(
				db
					.select({ id: insightReplies.id })
					.from(insightReplies)
					.where(
						and(
							eq(insightReplies.insightId, analyticsInsights.id),
							inArray(insightReplies.status, ["queued", "running"])
						)
					)
			);

			const whereClause = input.websiteId
				? and(
						eq(analyticsInsights.organizationId, input.organizationId),
						eq(analyticsInsights.websiteId, input.websiteId),
						hasNoActiveReply,
						isNull(websites.deletedAt)
					)
				: and(
						eq(analyticsInsights.organizationId, input.organizationId),
						hasNoActiveReply,
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
						eq(insightObservations.insightId, analyticsInsights.id),
						eq(insightObservations.websiteId, analyticsInsights.websiteId),
						eq(insightObservations.signalKey, analyticsInsights.subjectKey),
						sql`${insightObservations.outcome}->'next'->>'type' in ('act', 'ask')`
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

	getById: protectedProcedure
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
			const principalId = context.user?.id ?? `apikey:${context.apiKey?.id}`;
			const rate = await ratelimit(`insights:getById:${principalId}`, 120, 60);
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
				websiteId: row.websiteId,
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

			const canReply = await withWorkspace(context, {
				allowCrossOrg: true,
				organizationId: row.organizationId,
				permissions: ["update"],
				websiteId: row.websiteId,
			})
				.then(() => true)
				.catch((error) => {
					if (isAccessDenied(error)) {
						return false;
					}
					throw error;
				});

			return {
				canReply,
				insight: serializeInsight(insight),
				timeline,
			};
		}),

	reply: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/reply",
			tags: ["Insights"],
			summary: "Add context to an investigation",
		})
		.input(appendInvestigationReplyInputSchema)
		.output(
			z.object({
				reply: insightTimelineReplySchema,
			})
		)
		.handler(async ({ context, input }) => {
			const { reply } = await appendInvestigationReply({ context, ...input });
			return { reply };
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
						"This investigation has no history to continue"
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
