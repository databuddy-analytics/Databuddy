import {
	and,
	count,
	db,
	desc,
	eq,
	inArray,
	isNull,
	notExists,
	or,
	sql,
} from "@databuddy/db";
import {
	analyticsInsights,
	funnelDefinitions,
	goals,
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
	insightRecommendationItemSchema,
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
import { invalidateGoalsCache } from "../lib/goals-cache";
import { invalidateFunnelsCache } from "../lib/funnels-cache";
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

type RecheckableDefinitionType = "funnel" | "goal";

function definitionChangeReply(type: RecheckableDefinitionType): string {
	return `Databuddy detected a ${type} definition change. Recheck the current evidence and resolve this investigation if the change addressed it.`;
}

/**
 * Wakes only open investigations tied to the exact definition that changed.
 * The persisted reply gives the normal investigation worker a durable recheck
 * request; a failed queue must never roll back the teammate's saved edit.
 */
export async function queueDefinitionChangeRechecks(input: {
	definitionId: string;
	type: RecheckableDefinitionType;
	websiteId: string;
}): Promise<void> {
	const subjectPrefix = `${input.type}:${input.definitionId}`;
	try {
		const cases = await db
			.select({
				organizationId: analyticsInsights.organizationId,
				subjectKey: analyticsInsights.subjectKey,
			})
			.from(analyticsInsights)
			.where(
				and(
					eq(analyticsInsights.websiteId, input.websiteId),
					eq(analyticsInsights.status, "open")
				)
			);
		const subjects = new Map<
			string,
			{ organizationId: string; subjectKey: string }
		>();
		for (const insight of cases) {
			const matchesDefinition =
				insight.subjectKey === subjectPrefix ||
				(input.type === "funnel" &&
					insight.subjectKey.startsWith(`${subjectPrefix}:step:`));
			if (matchesDefinition) {
				subjects.set(
					`${insight.organizationId}:${insight.subjectKey}`,
					insight
				);
			}
		}

		const replyIds = await Promise.all(
			[...subjects.values()].map(async (insight) =>
				db.transaction(async (tx) => {
					const insightCase = and(
						eq(analyticsInsights.organizationId, insight.organizationId),
						eq(analyticsInsights.websiteId, input.websiteId),
						eq(analyticsInsights.subjectKey, insight.subjectKey)
					);
					const [current] = await tx
						.select({
							id: analyticsInsights.id,
							status: analyticsInsights.status,
						})
						.from(analyticsInsights)
						.where(insightCase)
						.orderBy(
							desc(analyticsInsights.createdAt),
							desc(analyticsInsights.id)
						)
						.limit(1)
						.for("update");
					if (!current || current.status !== "open") {
						return null;
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
						return null;
					}

					const id = randomUUIDv7();
					await tx.insert(insightReplies).values({
						authorId: null,
						authorName: "Databuddy",
						body: definitionChangeReply(input.type),
						id,
						insightId: current.id,
						status: "queued",
					});
					return id;
				})
			)
		);
		await Promise.all(
			replyIds.flatMap((replyId) =>
				replyId ? [queueInsightReply(replyId)] : []
			)
		);
	} catch (error) {
		logger.error(
			{
				error,
				definitionId: input.definitionId,
				type: input.type,
				websiteId: input.websiteId,
			},
			"Could not queue a definition-change investigation recheck"
		);
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
	input: { organizationId: string; runId?: string; websiteId?: string }
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

const applyInsightActionInputSchema = z
	.object({ insightId: z.string().trim().min(1).max(256) })
	.strict();

type ExecutableDefinitionOperation = Exclude<
	NonNullable<
		Extract<
			NonNullable<ReturnType<typeof parseInvestigationOutcome>>["next"],
			{ type: "act" }
		>["execution"]
	>,
	{ operation: null }
>;

function executableDefinitionAction(
	outcome: NonNullable<ReturnType<typeof parseInvestigationOutcome>>
): ExecutableDefinitionOperation | null {
	if (outcome.next.type !== "act") {
		return null;
	}
	const execution = outcome.next.execution;
	return execution?.operation ? execution : null;
}

function sameDefinitionExecution(
	left: ExecutableDefinitionOperation,
	right: ExecutableDefinitionOperation
): boolean {
	if (left.operation !== right.operation) {
		return false;
	}
	if (left.operation === "delete" || right.operation === "delete") {
		return true;
	}
	return (
		left.changes.name === right.changes.name &&
		left.changes.description === right.changes.description
	);
}

function definitionActionError(
	phase: "initial" | "current"
): ReturnType<typeof rpcError.badRequest | typeof rpcError.conflict> {
	return phase === "initial"
		? rpcError.badRequest(
				"This investigation has no executable definition action to apply"
			)
		: rpcError.conflict("This definition action is no longer available");
}

export async function applyInsightAction(input: {
	context: Context;
	insightId: string;
}): Promise<{ reply: z.infer<typeof insightTimelineReplySchema> }> {
	const { context, ...rawInput } = input;
	const parsed = applyInsightActionInputSchema.parse(rawInput);
	const [target] = await db
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
	if (!target) {
		throw rpcError.notFound("insight", parsed.insightId);
	}

	const [latestObservation] = await db
		.select({
			outcome: insightObservations.outcome,
			signal: insightObservations.signal,
		})
		.from(insightObservations)
		.where(
			and(
				eq(insightObservations.insightId, parsed.insightId),
				eq(insightObservations.organizationId, target.organizationId),
				eq(insightObservations.websiteId, target.websiteId)
			)
		)
		.orderBy(desc(insightObservations.createdAt), desc(insightObservations.id))
		.limit(1);
	const initialOutcome = parseInvestigationOutcome(latestObservation?.outcome);
	const initialSignal = parseInvestigationSignal(latestObservation?.signal);
	const initialEntityType =
		initialSignal?.entity.type === "goal" ||
		initialSignal?.entity.type === "funnel"
			? initialSignal.entity.type
			: null;
	const initialAction = initialOutcome
		? executableDefinitionAction(initialOutcome)
		: null;
	if (!(initialAction && initialSignal && initialEntityType)) {
		throw definitionActionError("initial");
	}

	await withWorkspace(context, {
		allowCrossOrg: true,
		organizationId: target.organizationId,
		permissions: initialAction.operation === "delete" ? ["delete"] : ["update"],
		websiteId: target.websiteId,
	});

	const author = replyAuthor(context);
	const completed = await db.transaction(async (tx) => {
		const [current] = await tx
			.select({
				id: analyticsInsights.id,
				status: analyticsInsights.status,
			})
			.from(analyticsInsights)
			.where(
				and(
					eq(analyticsInsights.organizationId, target.organizationId),
					eq(analyticsInsights.websiteId, target.websiteId),
					eq(analyticsInsights.subjectKey, target.subjectKey)
				)
			)
			.orderBy(desc(analyticsInsights.createdAt), desc(analyticsInsights.id))
			.limit(1)
			.for("update");
		if (
			!current ||
			current.id !== parsed.insightId ||
			current.status !== "open"
		) {
			throw rpcError.conflict(
				"This investigation changed before the action could apply"
			);
		}

		const [observation] = await tx
			.select({
				createdAt: insightObservations.createdAt,
				outcome: insightObservations.outcome,
				signal: insightObservations.signal,
			})
			.from(insightObservations)
			.where(
				and(
					eq(insightObservations.insightId, current.id),
					eq(insightObservations.organizationId, target.organizationId),
					eq(insightObservations.websiteId, target.websiteId)
				)
			)
			.orderBy(
				desc(insightObservations.createdAt),
				desc(insightObservations.id)
			)
			.limit(1)
			.for("update");
		const outcome = parseInvestigationOutcome(observation?.outcome);
		const signal = parseInvestigationSignal(observation?.signal);
		const entityType =
			signal?.entity.type === "goal" || signal?.entity.type === "funnel"
				? signal.entity.type
				: null;
		const action = outcome ? executableDefinitionAction(outcome) : null;
		if (
			!(action && signal && entityType && observation) ||
			entityType !== initialEntityType ||
			signal.entity.id !== initialSignal.entity.id ||
			!sameDefinitionExecution(action, initialAction)
		) {
			throw definitionActionError("current");
		}

		const [activeReply] = await tx
			.select({ id: insightReplies.id })
			.from(insightReplies)
			.where(
				and(
					eq(insightReplies.insightId, current.id),
					inArray(insightReplies.status, ["queued", "running"])
				)
			)
			.limit(1);
		if (activeReply) {
			throw rpcError.conflict(
				"Databuddy is already verifying this investigation"
			);
		}

		const completedAt = new Date();
		if (entityType === "goal") {
			const [goal] = await tx
				.select({
					description: goals.description,
					id: goals.id,
					name: goals.name,
					updatedAt: goals.updatedAt,
				})
				.from(goals)
				.where(
					and(
						eq(goals.id, signal.entity.id),
						eq(goals.websiteId, target.websiteId),
						isNull(goals.deletedAt)
					)
				)
				.limit(1)
				.for("update");
			if (!goal) {
				throw rpcError.notFound("goal", signal.entity.id);
			}
			if (
				goal.name !== initialSignal.entity.label ||
				goal.updatedAt > observation.createdAt
			) {
				throw definitionActionError("current");
			}
			if (action.operation === "delete") {
				await tx
					.update(goals)
					.set({
						deletedAt: completedAt,
						isActive: false,
						updatedAt: completedAt,
					})
					.where(eq(goals.id, goal.id));
			} else {
				await tx
					.update(goals)
					.set({
						description: action.changes.description ?? goal.description,
						name: action.changes.name ?? goal.name,
						updatedAt: completedAt,
					})
					.where(eq(goals.id, goal.id));
			}
		} else {
			const [funnel] = await tx
				.select({
					description: funnelDefinitions.description,
					id: funnelDefinitions.id,
					name: funnelDefinitions.name,
					updatedAt: funnelDefinitions.updatedAt,
				})
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.id, signal.entity.id),
						eq(funnelDefinitions.websiteId, target.websiteId),
						isNull(funnelDefinitions.deletedAt)
					)
				)
				.limit(1)
				.for("update");
			if (!funnel) {
				throw rpcError.notFound("funnel", signal.entity.id);
			}
			if (
				funnel.name !== initialSignal.entity.label ||
				funnel.updatedAt > observation.createdAt
			) {
				throw definitionActionError("current");
			}
			if (action.operation === "delete") {
				await tx
					.update(funnelDefinitions)
					.set({
						deletedAt: completedAt,
						isActive: false,
						updatedAt: completedAt,
					})
					.where(eq(funnelDefinitions.id, funnel.id));
			} else {
				await tx
					.update(funnelDefinitions)
					.set({
						description: action.changes.description ?? funnel.description,
						name: action.changes.name ?? funnel.name,
						updatedAt: completedAt,
					})
					.where(eq(funnelDefinitions.id, funnel.id));
			}
		}

		const replyId = randomUUIDv7();
		const body = `Databuddy applied the ${entityType} action. Recheck its verification condition against current data.`;
		await tx.insert(insightReplies).values({
			...author,
			body,
			createdAt: completedAt,
			id: replyId,
			insightId: current.id,
			status: "queued",
		});
		return { body, createdAt: completedAt, id: replyId, type: entityType };
	});

	if (completed.type === "goal") {
		await invalidateGoalsCache(target.websiteId);
	} else {
		await invalidateFunnelsCache(target.websiteId, initialSignal.entity.id);
	}
	await queueDefinitionChangeRechecks({
		definitionId: initialSignal.entity.id,
		type: completed.type,
		websiteId: target.websiteId,
	});
	const status = await queueInsightReply(completed.id);
	return {
		reply: {
			author: author.authorName,
			body: completed.body,
			createdAt: completed.createdAt.toISOString(),
			id: completed.id,
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
				runId: z.string().min(1).optional(),
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
						input.runId
							? eq(insightObservations.runId, input.runId)
							: undefined,
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

	recommendations: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/recommendations",
			tags: ["Insights"],
			summary: "List current insight recommendations",
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
				recommendations: z.array(insightRecommendationItemSchema),
				total: z.number().int().nonnegative(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeInsightsRead(context, input);
			const latestRecommendation = (alias: string) => {
				const latestBySignal = db
					.selectDistinctOn(
						[insightObservations.websiteId, insightObservations.signalKey],
						{
							...insightBriefSelection,
							investigationId: sql<string | null>`${analyticsInsights.id}`.as(
								"investigation_id"
							),
							recheckAt: insightObservations.recheckAt,
							signalKey: insightObservations.signalKey,
						}
					)
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
							isNull(websites.deletedAt)
						)
					)
					.orderBy(
						insightObservations.websiteId,
						insightObservations.signalKey,
						desc(insightObservations.asOf),
						desc(insightObservations.createdAt),
						desc(insightObservations.id)
					)
					.as(`${alias}_state`);
				const recommendation = sql`${latestBySignal.outcome}->'recommendation'`;
				return db
					.selectDistinctOn([latestBySignal.websiteId, recommendation], {
						asOf: latestBySignal.asOf,
						createdAt: latestBySignal.createdAt,
						id: latestBySignal.id,
						investigationId: latestBySignal.investigationId,
						outcome: latestBySignal.outcome,
						recheckAt: latestBySignal.recheckAt,
						signal: latestBySignal.signal,
						signalKey: latestBySignal.signalKey,
						websiteDomain: latestBySignal.websiteDomain,
						websiteId: latestBySignal.websiteId,
						websiteName: latestBySignal.websiteName,
					})
					.from(latestBySignal)
					.where(sql`${recommendation} is not null`)
					.orderBy(
						latestBySignal.websiteId,
						recommendation,
						desc(latestBySignal.asOf),
						desc(latestBySignal.createdAt),
						desc(latestBySignal.id)
					)
					.as(alias);
			};

			const pageSource = latestRecommendation("latest_recommendations");
			const recommendation = sql`${pageSource.outcome}->'recommendation'`;
			const recommendationKind = sql`${recommendation}->>'kind'`;
			const recommendationDraft = sql`${recommendation}->'draft'`;
			const isFreshStandaloneRecommendation = or(
				sql`coalesce(${recommendationKind}, '') not in ('instrumentation', 'databuddy_setup')`,
				sql`${pageSource.outcome}->'next'->>'type' <> 'resolve'`,
				sql`${pageSource.recheckAt} > now()`
			);
			const noEquivalentGoalDraft = notExists(
				db
					.select({ id: goals.id })
					.from(goals)
					.where(
						and(
							eq(goals.websiteId, pageSource.websiteId),
							eq(goals.isActive, true),
							isNull(goals.deletedAt),
							sql`${goals.type} = ${recommendationDraft}->>'type'`,
							sql`${goals.target} = ${recommendationDraft}->>'target'`,
							sql`coalesce(${goals.filters}, '[]'::jsonb) = coalesce(${recommendationDraft}->'filters', '[]'::jsonb)`,
							sql`${goals.ignoreHistoricData} = CASE ${recommendationDraft}->>'ignoreHistoricData' WHEN 'true' THEN true ELSE false END`
						)
					)
			);
			const noEquivalentFunnelDraft = notExists(
				db
					.select({ id: funnelDefinitions.id })
					.from(funnelDefinitions)
					.where(
						and(
							eq(funnelDefinitions.websiteId, pageSource.websiteId),
							eq(funnelDefinitions.isActive, true),
							isNull(funnelDefinitions.deletedAt),
							sql`coalesce(${funnelDefinitions.filters}, '[]'::jsonb) = coalesce(${recommendationDraft}->'filters', '[]'::jsonb)`,
							sql`${funnelDefinitions.ignoreHistoricData} = CASE ${recommendationDraft}->>'ignoreHistoricData' WHEN 'true' THEN true ELSE false END`,
							sql`(
								SELECT jsonb_agg(
									jsonb_build_object(
										'type', existing_step.value->>'type',
										'target', existing_step.value->>'target',
										'conditions', coalesce(nullif(existing_step.value->'conditions', 'null'::jsonb), '{}'::jsonb)
									)
									ORDER BY existing_step.ordinality
								)
								FROM jsonb_array_elements(${funnelDefinitions.steps}) WITH ORDINALITY AS existing_step(value, ordinality)
							) = (
								SELECT jsonb_agg(
									jsonb_build_object(
										'type', draft_step.value->>'type',
										'target', draft_step.value->>'target',
										'conditions', '{}'::jsonb
									)
									ORDER BY draft_step.ordinality
								)
								FROM jsonb_array_elements(${recommendationDraft}->'steps') WITH ORDINALITY AS draft_step(value, ordinality)
							)`
						)
					)
			);
			const isCurrentRecommendation = and(
				or(
					and(sql`${recommendationKind} = 'goal_draft'`, noEquivalentGoalDraft),
					and(
						sql`${recommendationKind} = 'funnel_draft'`,
						noEquivalentFunnelDraft
					),
					sql`${recommendationKind} is null or ${recommendationKind} not in ('goal_draft', 'funnel_draft')`
				),
				isFreshStandaloneRecommendation
			);
			const hasNativeRecommendation = or(
				sql`${pageSource.outcome}->'recommendation'->>'operation' in ('edit', 'delete')`,
				sql`${pageSource.outcome}->'recommendation'->>'kind' in ('goal_draft', 'funnel_draft', 'instrumentation', 'databuddy_setup')`
			);
			const [rows, [summary]] = await Promise.all([
				db
					.select()
					.from(pageSource)
					.where(
						and(
							sql`${pageSource.outcome}->>'recommendation' is not null`,
							hasNativeRecommendation,
							isCurrentRecommendation
						)
					)
					.orderBy(
						desc(pageSource.asOf),
						desc(pageSource.createdAt),
						desc(pageSource.id)
					)
					.limit(input.limit + 1)
					.offset(input.offset),
				db
					.select({ total: count() })
					.from(pageSource)
					.where(
						and(
							sql`${pageSource.outcome}->>'recommendation' is not null`,
							hasNativeRecommendation,
							isCurrentRecommendation
						)
					),
			]);
			const page = rows.slice(0, input.limit).flatMap((row) => {
				const insight = serializeInsightBrief(row);
				return insight?.recommendation
					? [{ ...insight, recommendation: insight.recommendation }]
					: [];
			});
			return {
				hasMore: rows.length > input.limit,
				recommendations: page,
				total: summary?.total ?? 0,
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
				status: z.enum(["open", "resolved"]).optional(),
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
				.where(input.status ? eq(latestCases.status, input.status) : undefined)
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

	applyAction: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/actions/apply",
			tags: ["Insights"],
			summary: "Apply an executable insight action and verify it",
		})
		.input(applyInsightActionInputSchema)
		.output(z.object({ reply: insightTimelineReplySchema }))
		.handler(async ({ context, input }) =>
			applyInsightAction({ context, ...input })
		),

	// Keep the old route for clients that have not migrated to applyAction yet.
	applyGoalAction: protectedProcedure
		.route({
			method: "POST",
			path: "/insights/actions/goal/apply",
			tags: ["Insights"],
			summary: "Apply an executable insight action and verify it",
		})
		.input(applyInsightActionInputSchema)
		.output(z.object({ reply: insightTimelineReplySchema }))
		.handler(async ({ context, input }) =>
			applyInsightAction({ context, ...input })
		),

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
