import { and, db, desc, eq, gte, inArray, isNull, sql } from "@databuddy/db";
import {
	analyticsInsights,
	type AnalyticsInsightMetric,
	type AnalyticsInsightSource,
	insightRollups,
	insightUserFeedback,
	websites,
} from "@databuddy/db/schema";
import {
	cacheNamespaces,
	cacheTags,
	cacheable,
	getRedisCache,
	invalidateAgentContextSnapshotsForOwner,
	invalidateInsightsCachesForOrganization,
} from "@databuddy/redis";
import { ratelimit } from "@databuddy/redis/rate-limit";
import { randomUUIDv7 } from "bun";
import dayjs from "dayjs";
import { z } from "zod";
import { rpcError } from "../errors";
import { sessionProcedure } from "../orpc";
import { withWorkspace } from "../procedures/with-workspace";
import { queueInsightGenerationRun } from "./insight-generation";

const voteSchema = z.enum(["up", "down"]);
const rangeSchema = z.enum(["7d", "30d", "90d"]);
const insightStatusSchema = z.enum(["open", "resolved"]);
const insightResolvedReasonSchema = z.enum(["recovered", "stale"]);

const CACHE_TTL = 900;
const NEGATIVE_CACHE_TTL = Math.floor(CACHE_TTL / 3);
const CACHE_KEY_PREFIX = "ai-insights";
const GENERATION_COOLDOWN_HOURS = 6;
const STALE_INSIGHTS_LOOKBACK_DAYS = 14;
const TOP_INSIGHTS_LIMIT = 10;
const NARRATIVE_RATE_LIMIT = 30;
const NARRATIVE_RATE_WINDOW_SECS = 3600;
const NARRATIVE_CACHE_TTL_SECS = 3600;
const NARRATIVE_INSIGHTS_LIMIT = 5;

const insightMetricSchema = z.object({
	current: z.number(),
	format: z.enum(["number", "percent", "duration_ms", "duration_s"]),
	label: z.string(),
	previous: z.number().optional(),
});

const insightEvidenceSchema = z.object({
	description: z.string(),
	type: z.string(),
});

const insightActionSchema = z.object({
	label: z.string(),
	params: z.record(z.string(), z.string()),
	type: z.string(),
});

const investigationDepthSchema = z.enum(["surface", "investigated", "deep"]);

const websiteInsightSchema = z.object({
	actions: z.array(insightActionSchema).nullable().optional(),
	chainId: z.string().nullable().optional(),
	changePercent: z.number().optional(),
	confidence: z.number(),
	description: z.string(),
	evidence: z.array(insightEvidenceSchema).nullable().optional(),
	id: z.string(),
	impactSummary: z.string().optional(),
	investigationDepth: investigationDepthSchema.nullable().optional(),
	link: z.string(),
	metrics: z.array(insightMetricSchema),
	priority: z.number(),
	rootCause: z.string().nullable().optional(),
	sentiment: z.string(),
	severity: z.string(),
	sources: z.array(z.enum(["web", "product", "ops", "business"])),
	subjectKey: z.string(),
	suggestion: z.string(),
	title: z.string(),
	type: z.string(),
	websiteDomain: z.string(),
	websiteId: z.string(),
	websiteName: z.string().nullable(),
});

const historyInsightSchema = websiteInsightSchema.extend({
	createdAt: z.string(),
	currentPeriodFrom: z.string().nullable(),
	currentPeriodTo: z.string().nullable(),
	previousPeriodFrom: z.string().nullable(),
	previousPeriodTo: z.string().nullable(),
	resolvedAt: z.string().nullable(),
	resolvedReason: insightResolvedReasonSchema.nullable(),
	runId: z.string(),
	status: insightStatusSchema,
	timezone: z.string().nullable(),
});

interface RawInsightShape {
	changePercent: number | null;
	impactSummary: string | null;
	metrics: unknown;
	sentiment: string;
	severity: string;
	sources: unknown;
	type: string;
}

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

function parseInsightShape(row: RawInsightShape) {
	return {
		severity: row.severity,
		sentiment: row.sentiment,
		type: row.type,
		sources: (row.sources as AnalyticsInsightSource[] | null) ?? [],
		metrics: (row.metrics as AnalyticsInsightMetric[] | null) ?? [],
		changePercent: row.changePercent ?? undefined,
		impactSummary: row.impactSummary ?? undefined,
	};
}

function getRedis() {
	try {
		return getRedisCache();
	} catch {
		return null;
	}
}

function tryCacheSet(
	redis: ReturnType<typeof getRedis>,
	key: string,
	ttl: number,
	payload: unknown
): void {
	if (!redis) {
		return;
	}
	redis.setex(key, ttl, JSON.stringify(payload)).catch(() => {});
}

async function invalidateInsightsCacheForOrg(
	organizationId: string
): Promise<void> {
	await Promise.all([
		invalidateInsightsCachesForOrganization(organizationId),
		invalidateAgentContextSnapshotsForOwner(organizationId),
	]);
}

async function getInsightsFromDb(options: {
	limit?: number;
	organizationId: string;
	since?: Date;
}): Promise<z.infer<typeof websiteInsightSchema>[]> {
	const whereClause = options.since
		? and(
				eq(analyticsInsights.organizationId, options.organizationId),
				eq(analyticsInsights.status, "open"),
				gte(analyticsInsights.createdAt, options.since),
				isNull(websites.deletedAt)
			)
		: and(
				eq(analyticsInsights.organizationId, options.organizationId),
				eq(analyticsInsights.status, "open"),
				isNull(websites.deletedAt)
			);

	const rows = await db
		.select({
			id: analyticsInsights.id,
			websiteId: analyticsInsights.websiteId,
			websiteName: websites.name,
			websiteDomain: websites.domain,
			title: analyticsInsights.title,
			description: analyticsInsights.description,
			suggestion: analyticsInsights.suggestion,
			severity: analyticsInsights.severity,
			sentiment: analyticsInsights.sentiment,
			type: analyticsInsights.type,
			priority: analyticsInsights.priority,
			changePercent: analyticsInsights.changePercent,
			subjectKey: analyticsInsights.subjectKey,
			sources: analyticsInsights.sources,
			confidence: analyticsInsights.confidence,
			impactSummary: analyticsInsights.impactSummary,
			rootCause: analyticsInsights.rootCause,
			evidence: analyticsInsights.evidence,
			investigationDepth: analyticsInsights.investigationDepth,
			actions: analyticsInsights.actions,
			chainId: analyticsInsights.chainId,
			metrics: analyticsInsights.metrics,
			createdAt: analyticsInsights.createdAt,
		})
		.from(analyticsInsights)
		.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
		.where(whereClause)
		.orderBy(
			desc(analyticsInsights.priority),
			desc(analyticsInsights.createdAt)
		)
		.limit(options.limit ?? TOP_INSIGHTS_LIMIT);

	return rows.map((row) => ({
		id: row.id,
		websiteId: row.websiteId,
		websiteName: row.websiteName,
		websiteDomain: row.websiteDomain,
		link: buildInsightLink(row.websiteId, row.type),
		title: row.title,
		description: row.description,
		suggestion: row.suggestion,
		priority: row.priority,
		subjectKey: row.subjectKey,
		confidence: row.confidence,
		rootCause: row.rootCause,
		evidence: row.evidence ?? null,
		investigationDepth: row.investigationDepth ?? null,
		actions: row.actions ?? null,
		chainId: row.chainId ?? null,
		...parseInsightShape(row),
	}));
}

const RANGE_WORDS: Record<z.infer<typeof rangeSchema>, string> = {
	"7d": "week",
	"30d": "month",
	"90d": "quarter",
};

function rangeWord(range: z.infer<typeof rangeSchema>): string {
	return RANGE_WORDS[range];
}

function buildDeterministicNarrative(
	range: z.infer<typeof rangeSchema>,
	topInsights: {
		changePercent: number | null;
		severity: string;
		title: string;
		websiteName: string | null;
	}[]
): string {
	const word = rangeWord(range);
	const headline = topInsights[0];
	if (!headline) {
		return `All systems healthy this ${word}. No actionable signals detected.`;
	}
	const siteSuffix = headline.websiteName ? ` on ${headline.websiteName}` : "";
	const change =
		headline.changePercent == null
			? ""
			: ` (${headline.changePercent > 0 ? "+" : ""}${headline.changePercent.toFixed(0)}%)`;
	if (topInsights.length === 1) {
		return `This ${word}: ${headline.title}${change}${siteSuffix}.`;
	}
	const extra = topInsights.length - 1;
	return `This ${word}: ${headline.title}${change}${siteSuffix}, plus ${extra} more signal${extra === 1 ? "" : "s"} worth reviewing.`;
}

const RANGE_TO_DAYS = { "7d": 7, "30d": 30, "90d": 90 } as const;

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

		if (rollup) {
			return {
				generatedAt: rollup.generatedAt.toISOString(),
				narrative: rollup.narrative,
			};
		}

		const cutoff = dayjs().subtract(RANGE_TO_DAYS[range], "day").toDate();
		const topInsights = await db
			.select({
				title: analyticsInsights.title,
				severity: analyticsInsights.severity,
				changePercent: analyticsInsights.changePercent,
				websiteName: websites.name,
			})
			.from(analyticsInsights)
			.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
			.where(
				and(
					eq(analyticsInsights.organizationId, organizationId),
					eq(analyticsInsights.status, "open"),
					gte(analyticsInsights.createdAt, cutoff),
					isNull(websites.deletedAt)
				)
			)
			.orderBy(desc(analyticsInsights.priority))
			.limit(NARRATIVE_INSIGHTS_LIMIT);

		return {
			generatedAt: new Date().toISOString(),
			narrative: buildDeterministicNarrative(range, topInsights),
		};
	},
	{
		expireInSec: NARRATIVE_CACHE_TTL_SECS,
		prefix: cacheNamespaces.insightsNarrative,
		tags: (_result, organizationId) => [cacheTags.organization(organizationId)],
	}
);

export const insightsRouter = {
	feed: sessionProcedure
		.route({
			method: "POST",
			path: "/insights/feed",
			tags: ["Insights"],
			summary: "Get current insight feed and queue generation when stale",
		})
		.input(
			z.object({
				organizationId: z.string().min(1),
				timezone: z.string().min(1).max(80).default("UTC"),
			})
		)
		.output(
			z.object({
				generation: z
					.object({
						queuedItems: z.number().optional(),
						runId: z.string().optional(),
						status: z.enum(["queued", "skipped", "disabled", "unavailable"]),
					})
					.optional(),
				insights: z.array(websiteInsightSchema),
				source: z.enum(["ai", "fallback"]),
				success: z.literal(true),
			})
		)
		.handler(async ({ context, input }) => {
			await withWorkspace(context, {
				organizationId: input.organizationId,
				resource: "organization",
				permissions: ["read"],
			});

			const redis = getRedis();
			const cacheKey = `${CACHE_KEY_PREFIX}:${input.organizationId}:${input.timezone}`;

			if (redis) {
				try {
					const cached = await redis.get(cacheKey);
					if (cached) {
						return JSON.parse(cached) as {
							generation?: {
								queuedItems?: number;
								runId?: string;
								status: "queued" | "skipped" | "disabled" | "unavailable";
							};
							insights: z.infer<typeof websiteInsightSchema>[];
							source: "ai" | "fallback";
							success: true;
						};
					}
				} catch {
					// Insights cache is advisory; continue to DB/queue.
				}
			}

			const recentInsights = await getInsightsFromDb({
				organizationId: input.organizationId,
				since: dayjs().subtract(GENERATION_COOLDOWN_HOURS, "hour").toDate(),
			});

			if (recentInsights.length > 0) {
				const payload = {
					insights: recentInsights,
					source: "ai" as const,
					success: true as const,
				};
				tryCacheSet(redis, cacheKey, CACHE_TTL, payload);
				return payload;
			}

			const staleInsights = await getInsightsFromDb({
				organizationId: input.organizationId,
				since: dayjs().subtract(STALE_INSIGHTS_LOOKBACK_DAYS, "day").toDate(),
			});

			let generation: {
				queuedItems?: number;
				runId?: string;
				status: "queued" | "skipped" | "disabled" | "unavailable";
			};

			try {
				const queued = await queueInsightGenerationRun({
					organizationId: input.organizationId,
					requestedByUserId: context.user.id,
					reason: "cooldown_refresh",
					timezone: input.timezone,
				});
				generation = {
					status: queued.status,
					runId: queued.runId,
					queuedItems: queued.queuedItems,
				};
			} catch {
				generation = { status: "unavailable" };
			}

			const payload = {
				generation,
				insights: staleInsights,
				source:
					staleInsights.length > 0 ? ("ai" as const) : ("fallback" as const),
				success: true as const,
			};
			tryCacheSet(redis, cacheKey, NEGATIVE_CACHE_TTL, payload);
			return payload;
		}),

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

			const rows = await db
				.select({
					id: analyticsInsights.id,
					runId: analyticsInsights.runId,
					websiteId: analyticsInsights.websiteId,
					websiteName: websites.name,
					websiteDomain: websites.domain,
					title: analyticsInsights.title,
					description: analyticsInsights.description,
					suggestion: analyticsInsights.suggestion,
					severity: analyticsInsights.severity,
					sentiment: analyticsInsights.sentiment,
					type: analyticsInsights.type,
					priority: analyticsInsights.priority,
					changePercent: analyticsInsights.changePercent,
					subjectKey: analyticsInsights.subjectKey,
					sources: analyticsInsights.sources,
					confidence: analyticsInsights.confidence,
					impactSummary: analyticsInsights.impactSummary,
					rootCause: analyticsInsights.rootCause,
					evidence: analyticsInsights.evidence,
					investigationDepth: analyticsInsights.investigationDepth,
					actions: analyticsInsights.actions,
					chainId: analyticsInsights.chainId,
					metrics: analyticsInsights.metrics,
					createdAt: analyticsInsights.createdAt,
					status: analyticsInsights.status,
					resolvedAt: analyticsInsights.resolvedAt,
					resolvedReason: analyticsInsights.resolvedReason,
					currentPeriodFrom: analyticsInsights.currentPeriodFrom,
					currentPeriodTo: analyticsInsights.currentPeriodTo,
					previousPeriodFrom: analyticsInsights.previousPeriodFrom,
					previousPeriodTo: analyticsInsights.previousPeriodTo,
					timezone: analyticsInsights.timezone,
				})
				.from(analyticsInsights)
				.innerJoin(websites, eq(analyticsInsights.websiteId, websites.id))
				.where(whereClause)
				.orderBy(
					desc(
						sql`coalesce(${analyticsInsights.resolvedAt}, ${analyticsInsights.createdAt})`
					)
				)
				.limit(input.limit)
				.offset(input.offset);

			const insights = rows.map((row) => ({
				id: row.id,
				runId: row.runId,
				websiteId: row.websiteId,
				websiteName: row.websiteName,
				websiteDomain: row.websiteDomain,
				link: buildInsightLink(row.websiteId, row.type),
				title: row.title,
				description: row.description,
				suggestion: row.suggestion,
				priority: row.priority,
				subjectKey: row.subjectKey,
				confidence: row.confidence,
				rootCause: row.rootCause,
				evidence: row.evidence ?? null,
				investigationDepth: row.investigationDepth ?? null,
				actions: row.actions ?? null,
				chainId: row.chainId ?? null,
				...parseInsightShape(row),
				createdAt: row.createdAt.toISOString(),
				status: row.status,
				resolvedAt: row.resolvedAt?.toISOString() ?? null,
				resolvedReason: row.resolvedReason ?? null,
				currentPeriodFrom: row.currentPeriodFrom,
				currentPeriodTo: row.currentPeriodTo,
				previousPeriodFrom: row.previousPeriodFrom,
				previousPeriodTo: row.previousPeriodTo,
				timezone: row.timezone,
			}));

			return {
				success: true as const,
				insights,
				hasMore: rows.length === input.limit,
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
