import { and, db, desc, eq, inArray, isNull, ne, sql } from "@databuddy/db";
import {
	analyticsInsights,
	insightRollups,
	insightUserFeedback,
	websites,
} from "@databuddy/db/schema";
import {
	cacheNamespaces,
	cacheTags,
	cacheable,
	invalidateAgentContextSnapshotsForOwner,
	invalidateInsightsCachesForOrganization,
} from "@databuddy/redis";
import { ratelimit } from "@databuddy/redis/rate-limit";
import {
	insightEvidenceSchema,
	insightMetricSchema,
	insightSentimentSchema,
	insightSeveritySchema,
	insightSourceSchema,
	storedInsightActionSchema,
	storedInsightTypeSchema,
} from "@databuddy/shared/insights";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { sessionProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";

const voteSchema = z.enum(["up", "down"]);
const rangeSchema = z.enum(["7d", "30d", "90d"]);
const insightStatusSchema = z.enum(["open", "resolved"]);
const insightResolvedReasonSchema = z.enum(["recovered", "stale"]);

const NARRATIVE_RATE_LIMIT = 30;
const NARRATIVE_RATE_WINDOW_SECS = 3600;
const NARRATIVE_CACHE_TTL_SECS = 3600;
const INSIGHT_READ_RATE_LIMIT = 120;
const INSIGHT_READ_RATE_WINDOW_SECS = 60;

const investigationDepthSchema = z.enum(["surface", "investigated", "deep"]);
const historyInsightEvidenceSchema = insightEvidenceSchema.extend({
	type: z.string(),
});

const historyInsightSchema = z.object({
	actions: z.array(storedInsightActionSchema).nullable().optional(),
	changePercent: z.number().optional(),
	confidence: z.number(),
	createdAt: z.string(),
	currentPeriodFrom: z.string().nullable(),
	currentPeriodTo: z.string().nullable(),
	description: z.string(),
	evidence: z.array(historyInsightEvidenceSchema).nullable().optional(),
	id: z.string(),
	impactSummary: z.string().optional(),
	investigationDepth: investigationDepthSchema.nullable().optional(),
	link: z.string(),
	metrics: z.array(insightMetricSchema),
	previousPeriodFrom: z.string().nullable(),
	previousPeriodTo: z.string().nullable(),
	priority: z.number(),
	resolvedAt: z.string().nullable(),
	resolvedReason: insightResolvedReasonSchema.nullable(),
	rootCause: z.string().nullable().optional(),
	runId: z.string(),
	sentiment: insightSentimentSchema,
	severity: insightSeveritySchema,
	sources: z.array(insightSourceSchema),
	status: insightStatusSchema,
	subjectKey: z.string(),
	suggestion: z.string(),
	timezone: z.string().nullable(),
	title: z.string(),
	type: storedInsightTypeSchema,
	websiteDomain: z.string(),
	websiteId: z.string(),
	websiteName: z.string().nullable(),
});

const insightSelection = {
	actions: analyticsInsights.actions,
	changePercent: analyticsInsights.changePercent,
	confidence: analyticsInsights.confidence,
	createdAt: analyticsInsights.createdAt,
	currentPeriodFrom: analyticsInsights.currentPeriodFrom,
	currentPeriodTo: analyticsInsights.currentPeriodTo,
	description: analyticsInsights.description,
	evidence: analyticsInsights.evidence,
	id: analyticsInsights.id,
	impactSummary: analyticsInsights.impactSummary,
	investigationDepth: analyticsInsights.investigationDepth,
	metrics: analyticsInsights.metrics,
	organizationId: analyticsInsights.organizationId,
	previousPeriodFrom: analyticsInsights.previousPeriodFrom,
	previousPeriodTo: analyticsInsights.previousPeriodTo,
	priority: analyticsInsights.priority,
	resolvedAt: analyticsInsights.resolvedAt,
	resolvedReason: analyticsInsights.resolvedReason,
	rootCause: analyticsInsights.rootCause,
	runId: analyticsInsights.runId,
	sentiment: analyticsInsights.sentiment,
	severity: analyticsInsights.severity,
	sources: analyticsInsights.sources,
	status: analyticsInsights.status,
	subjectKey: analyticsInsights.subjectKey,
	suggestion: analyticsInsights.suggestion,
	timezone: analyticsInsights.timezone,
	title: analyticsInsights.title,
	type: analyticsInsights.type,
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

function buildInsightLink(websiteId: string, type: string): string {
	const base = `/websites/${websiteId}`;
	if (
		[
			"error_spike",
			"new_errors",
			"persistent_error_hotspot",
			"reliability_improved",
		].includes(type)
	) {
		return `${base}/errors`;
	}
	if (
		["vitals_degraded", "performance", "performance_improved"].includes(type)
	) {
		return `${base}/vitals`;
	}
	if (["conversion_leak", "funnel_regression"].includes(type)) {
		return `${base}/funnels`;
	}
	if (
		["custom_event_spike", "engagement_change", "quality_shift"].includes(type)
	) {
		return `${base}/events/stream`;
	}
	if (type === "uptime_issue") {
		return `${base}/anomalies`;
	}
	return base;
}

function serializeInsight(
	row: InsightRow
): z.infer<typeof historyInsightSchema> {
	return {
		actions: row.actions ?? null,
		changePercent: row.changePercent ?? undefined,
		confidence: row.confidence,
		createdAt: row.createdAt.toISOString(),
		currentPeriodFrom: row.currentPeriodFrom,
		currentPeriodTo: row.currentPeriodTo,
		description: row.description,
		evidence: row.evidence ?? null,
		id: row.id,
		impactSummary: row.impactSummary ?? undefined,
		investigationDepth: row.investigationDepth ?? null,
		link: buildInsightLink(row.websiteId, row.type),
		metrics: row.metrics ?? [],
		previousPeriodFrom: row.previousPeriodFrom,
		previousPeriodTo: row.previousPeriodTo,
		priority: row.priority,
		resolvedAt: row.resolvedAt?.toISOString() ?? null,
		resolvedReason: row.resolvedReason ?? null,
		rootCause: row.rootCause,
		runId: row.runId,
		sentiment: row.sentiment,
		severity: row.severity,
		sources: row.sources ?? [],
		status: row.status,
		subjectKey: row.subjectKey,
		suggestion: row.suggestion,
		timezone: row.timezone,
		title: row.title,
		type: row.type,
		websiteDomain: row.websiteDomain,
		websiteId: row.websiteId,
		websiteName: row.websiteName,
	};
}

async function invalidateInsightsCacheForOrg(
	organizationId: string
): Promise<void> {
	await Promise.all([
		invalidateInsightsCachesForOrganization(organizationId),
		invalidateAgentContextSnapshotsForOwner(organizationId),
	]);
}

const loadNarrativeCached = cacheable(
	async function loadNarrativeCached(
		organizationId: string,
		range: z.infer<typeof rangeSchema>
	): Promise<{ generatedAt: string; narrative: string }> {
		const [rollup] = await db
			.select({
				generatedAt: insightRollups.generatedAt,
				narrative: insightRollups.narrative,
			})
			.from(insightRollups)
			.where(
				and(
					eq(insightRollups.organizationId, organizationId),
					eq(insightRollups.range, range)
				)
			)
			.limit(1);

		return {
			generatedAt:
				rollup?.generatedAt.toISOString() ?? new Date().toISOString(),
			narrative:
				rollup?.narrative ?? "No summary yet. Run an analysis to create one.",
		};
	},
	{
		expireInSec: NARRATIVE_CACHE_TTL_SECS,
		prefix: cacheNamespaces.insightsNarrative,
		tags: (_result, organizationId) => [cacheTags.organization(organizationId)],
	}
);

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
				success: z.literal(true),
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

			const rows = await selectInsights()
				.where(whereClause)
				.orderBy(
					desc(
						sql`coalesce(${analyticsInsights.resolvedAt}, ${analyticsInsights.createdAt})`
					)
				)
				.limit(input.limit)
				.offset(input.offset);

			return {
				success: true as const,
				insights: rows.map(serializeInsight),
				hasMore: rows.length === input.limit,
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
				insight: historyInsightSchema.nullable(),
				success: z.literal(true),
			})
		)
		.handler(async ({ context, input }) => {
			const rl = await ratelimit(
				`insights:getById:${context.user.id}`,
				INSIGHT_READ_RATE_LIMIT,
				INSIGHT_READ_RATE_WINDOW_SECS
			);
			if (!rl.success) {
				throw rpcError.rateLimited(
					Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000))
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
				return { success: true as const, insight: null };
			}

			const canRead = await withWorkspace(context, {
				organizationId: row.organizationId,
				resource: "organization",
				permissions: ["read"],
				allowCrossOrg: true,
			})
				.then(() => true)
				.catch(() => false);

			if (!canRead) {
				return { success: true as const, insight: null };
			}

			return {
				success: true as const,
				insight: serializeInsight(row),
			};
		}),

	related: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/related",
			tags: ["Insights"],
			summary: "Get other open insights for the same website",
		})
		.input(
			z.object({
				insightId: z.string().min(1).max(256),
				limit: z.number().int().min(1).max(10).default(5),
			})
		)
		.output(
			z.object({
				insights: z.array(
					z.object({
						changePercent: z.number().nullable(),
						createdAt: z.string(),
						id: z.string(),
						sentiment: insightSentimentSchema,
						severity: insightSeveritySchema,
						title: z.string(),
						type: storedInsightTypeSchema,
					})
				),
				success: z.literal(true),
			})
		)
		.handler(async ({ context, input }) => {
			const rl = await ratelimit(
				`insights:related:${context.user.id}`,
				INSIGHT_READ_RATE_LIMIT,
				INSIGHT_READ_RATE_WINDOW_SECS
			);
			if (!rl.success) {
				throw rpcError.rateLimited(
					Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000))
				);
			}

			const [current] = await db
				.select({
					organizationId: analyticsInsights.organizationId,
					websiteId: analyticsInsights.websiteId,
				})
				.from(analyticsInsights)
				.where(eq(analyticsInsights.id, input.insightId))
				.limit(1);

			if (!current) {
				return { success: true as const, insights: [] };
			}

			const canRead = await withWorkspace(context, {
				organizationId: current.organizationId,
				resource: "organization",
				permissions: ["read"],
				allowCrossOrg: true,
			})
				.then(() => true)
				.catch(() => false);

			if (!canRead) {
				return { success: true as const, insights: [] };
			}

			const rows = await db
				.select({
					id: analyticsInsights.id,
					title: analyticsInsights.title,
					severity: analyticsInsights.severity,
					sentiment: analyticsInsights.sentiment,
					type: analyticsInsights.type,
					changePercent: analyticsInsights.changePercent,
					createdAt: analyticsInsights.createdAt,
				})
				.from(analyticsInsights)
				.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
				.where(
					and(
						eq(analyticsInsights.websiteId, current.websiteId),
						eq(analyticsInsights.status, "open"),
						ne(analyticsInsights.id, input.insightId),
						isNull(websites.deletedAt)
					)
				)
				.orderBy(
					desc(analyticsInsights.priority),
					desc(analyticsInsights.createdAt)
				)
				.limit(input.limit);

			return {
				success: true as const,
				insights: rows.map((row) => ({
					id: row.id,
					title: row.title,
					severity: row.severity,
					sentiment: row.sentiment,
					type: row.type,
					changePercent: row.changePercent,
					createdAt: row.createdAt.toISOString(),
				})),
			};
		}),

	orgNarrative: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/orgNarrative",
			tags: ["Insights"],
			summary: "Get organization insights narrative",
		})
		.input(
			z.object({
				organizationId: z.string().min(1),
				range: rangeSchema,
			})
		)
		.output(
			z.object({
				generatedAt: z.string(),
				narrative: z.string(),
				success: z.literal(true),
			})
		)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["read"],
			});

			const rl = await ratelimit(
				`insights:narrative:${input.organizationId}:${context.user.id}`,
				NARRATIVE_RATE_LIMIT,
				NARRATIVE_RATE_WINDOW_SECS
			);
			if (!rl.success) {
				throw rpcError.rateLimited(
					Math.max(1, Math.ceil((rl.reset - Date.now()) / 1000))
				);
			}

			const cached = await loadNarrativeCached(
				input.organizationId,
				input.range
			);
			return {
				success: true as const,
				narrative: cached.narrative,
				generatedAt: new Date(cached.generatedAt).toISOString(),
			};
		}),

	clearHistory: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/clearHistory",
			tags: ["Insights"],
			summary: "Clear persisted insights for an organization",
		})
		.input(z.object({ organizationId: z.string().min(1) }))
		.output(z.object({ deleted: z.number(), success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["update"],
			});

			const idRows = await db
				.select({ id: analyticsInsights.id })
				.from(analyticsInsights)
				.where(eq(analyticsInsights.organizationId, input.organizationId));
			const ids = idRows.map((row) => row.id);

			await db
				.delete(insightRollups)
				.where(eq(insightRollups.organizationId, input.organizationId));

			await db
				.delete(insightUserFeedback)
				.where(eq(insightUserFeedback.organizationId, input.organizationId));

			if (ids.length > 0) {
				await db
					.delete(analyticsInsights)
					.where(eq(analyticsInsights.organizationId, input.organizationId));
			}

			await invalidateInsightsCacheForOrg(input.organizationId);
			return { success: true as const, deleted: ids.length };
		}),

	getVotes: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/getVotes",
			tags: ["Insights"],
			summary: "Get insight feedback votes",
			description:
				"Returns thumbs up/down votes for the given insight ids for the current user in the active organization.",
		})
		.input(
			z.object({
				insightIds: z.array(z.string().min(1)).max(200),
			})
		)
		.output(
			z.object({
				votes: z.record(z.string(), voteSchema),
			})
		)
		.handler(async ({ context, input }) => {
			if (!context.organizationId) {
				throw rpcError.badRequest("Organization context is required");
			}
			if (input.insightIds.length === 0) {
				return { votes: {} };
			}

			const rows = await context.db
				.select({
					insightId: insightUserFeedback.insightId,
					vote: insightUserFeedback.vote,
				})
				.from(insightUserFeedback)
				.where(
					and(
						eq(insightUserFeedback.userId, context.user.id),
						eq(insightUserFeedback.organizationId, context.organizationId),
						inArray(insightUserFeedback.insightId, input.insightIds),
						inArray(insightUserFeedback.vote, ["up", "down"])
					)
				);

			const votes: Record<string, "up" | "down"> = {};
			for (const row of rows) {
				if (row.vote === "up" || row.vote === "down") {
					votes[row.insightId] = row.vote;
				}
			}
			return { votes };
		}),

	setVote: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/setVote",
			tags: ["Insights"],
			summary: "Set or clear insight vote",
			description:
				"Sets thumbs up/down for an insight, or clears the vote when vote is null.",
		})
		.input(
			z.object({
				insightId: z.string().min(1).max(256),
				vote: voteSchema.nullable(),
			})
		)
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			if (!context.organizationId) {
				throw rpcError.badRequest("Organization context is required");
			}

			if (input.vote === null) {
				await context.db
					.delete(insightUserFeedback)
					.where(
						and(
							eq(insightUserFeedback.userId, context.user.id),
							eq(insightUserFeedback.organizationId, context.organizationId),
							eq(insightUserFeedback.insightId, input.insightId)
						)
					);
				return { success: true as const };
			}

			const now = new Date();
			await context.db
				.insert(insightUserFeedback)
				.values({
					id: randomUUIDv7(),
					userId: context.user.id,
					organizationId: context.organizationId,
					insightId: input.insightId,
					vote: input.vote,
					createdAt: now,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: [
						insightUserFeedback.userId,
						insightUserFeedback.organizationId,
						insightUserFeedback.insightId,
					],
					set: {
						vote: input.vote,
						updatedAt: now,
					},
				});

			return { success: true as const };
		}),

	setDismissed: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/setDismissed",
			tags: ["Insights"],
			summary: "Dismiss or restore an insight",
			description:
				"Marks an insight as dismissed so its pattern is suppressed in future generation, or restores it when dismissed is false.",
		})
		.input(
			z.object({
				insightId: z.string().min(1).max(256),
				dismissed: z.boolean(),
			})
		)
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context, input }) => {
			if (!context.organizationId) {
				throw rpcError.badRequest("Organization context is required");
			}

			if (!input.dismissed) {
				await context.db
					.delete(insightUserFeedback)
					.where(
						and(
							eq(insightUserFeedback.userId, context.user.id),
							eq(insightUserFeedback.organizationId, context.organizationId),
							eq(insightUserFeedback.insightId, input.insightId),
							eq(insightUserFeedback.vote, "dismissed")
						)
					);
				return { success: true as const };
			}

			const now = new Date();
			await context.db
				.insert(insightUserFeedback)
				.values({
					id: randomUUIDv7(),
					userId: context.user.id,
					organizationId: context.organizationId,
					insightId: input.insightId,
					vote: "dismissed",
					createdAt: now,
					updatedAt: now,
				})
				.onConflictDoUpdate({
					target: [
						insightUserFeedback.userId,
						insightUserFeedback.organizationId,
						insightUserFeedback.insightId,
					],
					set: {
						vote: "dismissed",
						updatedAt: now,
					},
				});

			return { success: true as const };
		}),

	clearDismissed: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/clearDismissed",
			tags: ["Insights"],
			summary: "Clear all dismissed insights",
			description:
				"Removes every dismissal for the current user in the active organization.",
		})
		.input(z.object({}))
		.output(z.object({ success: z.literal(true) }))
		.handler(async ({ context }) => {
			if (!context.organizationId) {
				throw rpcError.badRequest("Organization context is required");
			}

			await context.db
				.delete(insightUserFeedback)
				.where(
					and(
						eq(insightUserFeedback.userId, context.user.id),
						eq(insightUserFeedback.organizationId, context.organizationId),
						eq(insightUserFeedback.vote, "dismissed")
					)
				);

			return { success: true as const };
		}),
};
