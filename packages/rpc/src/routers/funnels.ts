import { and, desc, eq, isNull, sql } from "@databuddy/db";
import { funnelDefinitions } from "@databuddy/db/schema";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import {
	type AnalyticsStep,
	processFunnelAnalytics,
	processFunnelAnalyticsByReferrer,
	queryLinkVisitorIds,
} from "../lib/analytics-utils";
import { protectedProcedure, publicProcedure } from "../orpc";
import { withWebsiteRead, withWorkspace } from "../procedures/with-workspace";
import { requireFeatureWithLimit } from "../types/billing";

const cache = createDrizzleCache({ redis, namespace: "funnels" });

const CACHE_TTL = 300;
const ANALYTICS_CACHE_TTL = 180;

const stepSchema = z.object({
	type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
	target: z.string().min(1),
	name: z.string().min(1),
	conditions: z.record(z.string(), z.unknown()).optional(),
});

const filterSchema = z.object({
	field: z.string(),
	operator: z.enum(["equals", "contains", "not_equals", "in", "not_in"]),
	value: z.union([z.string(), z.array(z.string())]),
});

type Step = z.infer<typeof stepSchema>;
type Filter = z.infer<typeof filterSchema>;

const getDefaultDateRange = () => {
	const endDate = new Date().toISOString().split("T")[0];
	const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
		.toISOString()
		.split("T")[0];
	return { startDate, endDate };
};

const getEffectiveStartDate = (
	requestedStartDate: string,
	createdAt: Date | null,
	ignoreHistoricData: boolean
): string => {
	if (!(ignoreHistoricData && createdAt)) {
		return requestedStartDate;
	}

	const createdDate = new Date(createdAt).toISOString().split("T")[0];
	return new Date(requestedStartDate) > new Date(createdDate)
		? requestedStartDate
		: createdDate;
};

const invalidateFunnelsCache = async (websiteId: string, funnelId?: string) => {
	const keys = [`list:${websiteId}`];
	if (funnelId) {
		keys.push(`byId:${funnelId}:${websiteId}`);
	}
	const operations: Promise<void>[] = keys.map((key) =>
		cache.invalidateByKey(key)
	);
	if (funnelId) {
		operations.push(cache.invalidateByTags([`funnel:${funnelId}`]));
	}
	await Promise.all(operations);
};

const toAnalyticsSteps = (steps: Step[]): AnalyticsStep[] =>
	steps.map((step, index) => ({
		step_number: index + 1,
		type: step.type as "PAGE_VIEW" | "EVENT",
		target: step.target,
		name: step.name,
	}));

const funnelListOutputSchema = z.object({
	createdAt: z.coerce.date(),
	description: z.string().nullable(),
	filters: z.unknown().nullable(),
	id: z.string(),
	ignoreHistoricData: z.boolean(),
	isActive: z.boolean(),
	name: z.string(),
	steps: z.unknown(),
	updatedAt: z.coerce.date(),
});

const funnelOutputSchema = z.object({
	createdAt: z.coerce.date(),
	createdBy: z.string(),
	deletedAt: z.nullable(z.coerce.date()),
	description: z.string().nullable(),
	filters: z.unknown().nullable(),
	id: z.string(),
	ignoreHistoricData: z.boolean(),
	isActive: z.boolean(),
	name: z.string(),
	steps: z.unknown(),
	updatedAt: z.coerce.date(),
	websiteId: z.string(),
});

const successOutputSchema = z.object({ success: z.literal(true) });

const stepErrorInsightOutputSchema = z.object({
	message: z.string(),
	error_type: z.string(),
	count: z.number(),
});

const stepAnalyticsOutputSchema = z.object({
	step_number: z.number(),
	step_name: z.string(),
	users: z.number(),
	total_users: z.number(),
	conversion_rate: z.number(),
	dropoffs: z.number(),
	dropoff_rate: z.number(),
	avg_time_to_complete: z.number(),
	error_count: z.number(),
	error_rate: z.number(),
	top_errors: z.array(stepErrorInsightOutputSchema),
});

const timeSeriesPointSchema = z.object({
	date: z.string(),
	users: z.number(),
	conversions: z.number(),
	conversion_rate: z.number(),
	dropoffs: z.number(),
	avg_time: z.number(),
});

const funnelAnalyticsOutputSchema = z.object({
	overall_conversion_rate: z.number(),
	total_users_entered: z.number(),
	total_users_completed: z.number(),
	avg_completion_time: z.number(),
	avg_completion_time_formatted: z.string(),
	biggest_dropoff_step: z.number(),
	biggest_dropoff_rate: z.number(),
	steps_analytics: z.array(stepAnalyticsOutputSchema),
	time_series: z.array(timeSeriesPointSchema).optional(),
	error_insights: z.object({
		total_errors: z.number(),
		sessions_with_errors: z.number(),
		dropoffs_with_errors: z.number(),
		error_correlation_rate: z.number(),
	}),
});

const referrerAnalyticsOutputSchema = z.object({
	referrer: z.string(),
	referrer_parsed: z.object({
		name: z.string(),
		type: z.string(),
		domain: z.string(),
	}),
	total_users: z.number(),
	completed_users: z.number(),
	conversion_rate: z.number(),
});

const funnelAnalyticsByReferrerOutputSchema = z.object({
	referrer_analytics: z.array(referrerAnalyticsOutputSchema),
});

export const funnelsRouter = {
	list: publicProcedure
		.route({
			description:
				"Returns all funnels for a website. Requires website read permission.",
			method: "POST",
			path: "/funnels/list",
			summary: "List funnels",
			tags: ["Funnels"],
		})
		.input(z.object({ websiteId: z.string() }))
		.output(z.array(funnelListOutputSchema))
		.handler(({ context, input }) =>
			cache.withCache({
				key: `list:${input.websiteId}`,
				disabled: true, // TODO: Remove this once we have a way to invalidate the cache
				ttl: CACHE_TTL,
				tables: ["funnelDefinitions"],
				queryFn: async () => {
					await withWorkspace(context, {
						websiteId: input.websiteId,
						permissions: ["read"],
						allowPublicAccess: true,
					});
					return context.db
						.select({
							id: funnelDefinitions.id,
							name: funnelDefinitions.name,
							description: funnelDefinitions.description,
							steps: funnelDefinitions.steps,
							filters: funnelDefinitions.filters,
							ignoreHistoricData: funnelDefinitions.ignoreHistoricData,
							isActive: funnelDefinitions.isActive,
							createdAt: funnelDefinitions.createdAt,
							updatedAt: funnelDefinitions.updatedAt,
						})
						.from(funnelDefinitions)
						.where(
							and(
								eq(funnelDefinitions.websiteId, input.websiteId),
								isNull(funnelDefinitions.deletedAt),
								sql`jsonb_array_length(${funnelDefinitions.steps}) > 1`
							)
						)
						.orderBy(desc(funnelDefinitions.createdAt));
				},
			})
		),

	getById: protectedProcedure
		.route({
			description:
				"Returns a single funnel by id; website is resolved from the funnel. Requires website read permission.",
			method: "POST",
			path: "/funnels/getById",
			summary: "Get funnel",
			tags: ["Funnels"],
		})
		.input(z.object({ id: z.string() }))
		.output(funnelOutputSchema)
		.handler(({ context, input }) =>
			cache.withCache({
				key: `byId:${input.id}`,
				disabled: true, // TODO: Remove this once we have a way to invalidate the cache
				ttl: CACHE_TTL,
				tables: ["funnelDefinitions"],
				queryFn: async () => {
					const [funnel] = await context.db
						.select()
						.from(funnelDefinitions)
						.where(
							and(
								eq(funnelDefinitions.id, input.id),
								isNull(funnelDefinitions.deletedAt)
							)
						)
						.limit(1);

					if (!funnel) {
						throw rpcError.notFound("funnel", input.id);
					}

					await withWorkspace(context, {
						websiteId: funnel.websiteId,
						permissions: ["read"],
					});

					return funnel;
				},
			})
		),

	create: protectedProcedure
		.route({
			description:
				"Creates a new funnel. Requires funnels feature and website update permission.",
			method: "POST",
			path: "/funnels/create",
			summary: "Create funnel",
			tags: ["Funnels"],
		})
		.input(
			z.object({
				websiteId: z.string(),
				name: z.string().min(1).max(100),
				description: z.string().optional(),
				steps: z.array(stepSchema).min(2).max(10),
				filters: z.array(filterSchema).optional(),
				ignoreHistoricData: z.boolean().optional(),
			})
		)
		.output(funnelOutputSchema)
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["update"],
			});

			const createdBy = await workspace.getCreatedBy();

			const existingFunnels = await context.db
				.select({ id: funnelDefinitions.id })
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.websiteId, input.websiteId),
						isNull(funnelDefinitions.deletedAt)
					)
				);

			requireFeatureWithLimit(
				workspace.plan,
				GATED_FEATURES.FUNNELS,
				existingFunnels.length
			);

			const [newFunnel] = await context.db
				.insert(funnelDefinitions)
				.values({
					id: randomUUIDv7(),
					websiteId: input.websiteId,
					name: input.name,
					description: input.description,
					steps: input.steps,
					filters: input.filters,
					ignoreHistoricData: input.ignoreHistoricData ?? false,
					createdBy,
				})
				.returning();

			await invalidateFunnelsCache(input.websiteId);
			return newFunnel;
		}),

	update: protectedProcedure
		.route({
			description:
				"Updates an existing funnel. Requires website update permission.",
			method: "POST",
			path: "/funnels/update",
			summary: "Update funnel",
			tags: ["Funnels"],
		})
		.input(
			z.object({
				id: z.string(),
				name: z.string().min(1).max(100).optional(),
				description: z.string().optional(),
				steps: z.array(stepSchema).min(2).max(10).optional(),
				filters: z.array(filterSchema).optional(),
				ignoreHistoricData: z.boolean().optional(),
				isActive: z.boolean().optional(),
			})
		)
		.output(funnelOutputSchema)
		.handler(async ({ context, input }) => {
			const [existingFunnel] = await context.db
				.select({ websiteId: funnelDefinitions.websiteId })
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.id, input.id),
						isNull(funnelDefinitions.deletedAt)
					)
				)
				.limit(1);

			if (!existingFunnel) {
				throw rpcError.notFound("funnel", input.id);
			}

			await withWorkspace(context, {
				websiteId: existingFunnel.websiteId,
				permissions: ["update"],
			});

			const { id, ...updates } = input;
			const [updatedFunnel] = await context.db
				.update(funnelDefinitions)
				.set({ ...updates, updatedAt: new Date() })
				.where(
					and(eq(funnelDefinitions.id, id), isNull(funnelDefinitions.deletedAt))
				)
				.returning();

			await invalidateFunnelsCache(existingFunnel.websiteId, id);
			return updatedFunnel;
		}),

	delete: protectedProcedure
		.route({
			description: "Soft-deletes a funnel. Requires website delete permission.",
			method: "POST",
			path: "/funnels/delete",
			summary: "Delete funnel",
			tags: ["Funnels"],
		})
		.input(z.object({ id: z.string() }))
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const [existingFunnel] = await context.db
				.select({ websiteId: funnelDefinitions.websiteId })
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.id, input.id),
						isNull(funnelDefinitions.deletedAt)
					)
				)
				.limit(1);

			if (!existingFunnel) {
				throw rpcError.notFound("funnel", input.id);
			}

			await withWorkspace(context, {
				websiteId: existingFunnel.websiteId,
				permissions: ["delete"],
			});

			await context.db
				.update(funnelDefinitions)
				.set({ deletedAt: new Date(), isActive: false })
				.where(
					and(
						eq(funnelDefinitions.id, input.id),
						isNull(funnelDefinitions.deletedAt)
					)
				);

			await invalidateFunnelsCache(existingFunnel.websiteId, input.id);
			return { success: true };
		}),

	getAnalytics: publicProcedure
		.route({
			description:
				"Returns funnel conversion analytics. Requires website read permission.",
			method: "POST",
			path: "/funnels/getAnalytics",
			summary: "Get funnel analytics",
			tags: ["Funnels"],
		})
		.input(
			z.object({
				funnelId: z.string(),
				websiteId: z.string(),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			})
		)
		.output(funnelAnalyticsOutputSchema)
		.use(withWebsiteRead)
		.handler(async ({ context, input }) => {
			const { startDate, endDate } =
				input.startDate && input.endDate
					? { startDate: input.startDate, endDate: input.endDate }
					: getDefaultDateRange();

			const [funnel] = await context.db
				.select()
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.id, input.funnelId),
						eq(funnelDefinitions.websiteId, input.websiteId),
						isNull(funnelDefinitions.deletedAt)
					)
				)
				.limit(1);

			if (!funnel) {
				throw rpcError.notFound("funnel", input.funnelId);
			}

			const steps = funnel.steps as Step[];
			if (!steps?.length) {
				throw rpcError.badRequest("Funnel has no steps");
			}

			const effectiveStartDate = getEffectiveStartDate(
				startDate,
				funnel.createdAt,
				funnel.ignoreHistoricData
			);

			const cacheKey = `analytics:${input.funnelId}:${effectiveStartDate}:${endDate}`;

			return cache.withCache({
				key: cacheKey,
				ttl: ANALYTICS_CACHE_TTL,
				tables: ["funnelDefinitions"],
				tag: `funnel:${input.funnelId}`,
				queryFn: () =>
					processFunnelAnalytics(
						toAnalyticsSteps(steps),
						(funnel.filters as Filter[]) || [],
						{
							websiteId: input.websiteId,
							startDate: effectiveStartDate,
							endDate: `${endDate} 23:59:59`,
						}
					),
			});
		}),

	getAnalyticsByReferrer: publicProcedure
		.route({
			description:
				"Returns funnel analytics broken down by referrer. Requires website read permission.",
			method: "POST",
			path: "/funnels/getAnalyticsByReferrer",
			summary: "Get funnel analytics by referrer",
			tags: ["Funnels"],
		})
		.input(
			z.object({
				funnelId: z.string(),
				websiteId: z.string(),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			})
		)
		.output(funnelAnalyticsByReferrerOutputSchema)
		.use(withWebsiteRead)
		.handler(async ({ context, input }) => {
			const { startDate, endDate } =
				input.startDate && input.endDate
					? { startDate: input.startDate, endDate: input.endDate }
					: getDefaultDateRange();

			const [funnel] = await context.db
				.select()
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.id, input.funnelId),
						eq(funnelDefinitions.websiteId, input.websiteId),
						isNull(funnelDefinitions.deletedAt)
					)
				)
				.limit(1);

			if (!funnel) {
				throw rpcError.notFound("funnel", input.funnelId);
			}

			const steps = funnel.steps as Step[];
			if (!steps?.length) {
				throw rpcError.badRequest("Funnel has no steps");
			}

			const effectiveStartDate = getEffectiveStartDate(
				startDate,
				funnel.createdAt,
				funnel.ignoreHistoricData
			);

			const cacheKey = `analyticsByReferrer:${input.funnelId}:${effectiveStartDate}:${endDate}`;

			return cache.withCache({
				key: cacheKey,
				ttl: ANALYTICS_CACHE_TTL,
				tables: ["funnelDefinitions"],
				tag: `funnel:${input.funnelId}`,
				queryFn: () =>
					processFunnelAnalyticsByReferrer(
						toAnalyticsSteps(steps),
						(funnel.filters as Filter[]) || [],
						{
							websiteId: input.websiteId,
							startDate: effectiveStartDate,
							endDate: `${endDate} 23:59:59`,
						}
					),
			});
		}),

	getAnalyticsByLink: publicProcedure
		.route({
			description:
				"Returns funnel analytics filtered to visitors who arrived via a specific link. Requires website read permission.",
			method: "POST",
			path: "/funnels/getAnalyticsByLink",
			summary: "Get funnel analytics by link",
			tags: ["Funnels"],
		})
		.input(
			z.object({
				funnelId: z.string(),
				websiteId: z.string(),
				linkId: z.string(),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			})
		)
		.output(funnelAnalyticsOutputSchema)
		.use(withWebsiteRead)
		.handler(async ({ context, input }) => {
			const { startDate, endDate } =
				input.startDate && input.endDate
					? { startDate: input.startDate, endDate: input.endDate }
					: getDefaultDateRange();

			const [funnel] = await context.db
				.select()
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.id, input.funnelId),
						eq(funnelDefinitions.websiteId, input.websiteId),
						isNull(funnelDefinitions.deletedAt)
					)
				)
				.limit(1);

			if (!funnel) {
				throw rpcError.notFound("funnel", input.funnelId);
			}

			const steps = funnel.steps as Step[];
			if (!steps?.length) {
				throw rpcError.badRequest("Funnel has no steps");
			}

			const effectiveStartDate = getEffectiveStartDate(
				startDate,
				funnel.createdAt,
				funnel.ignoreHistoricData
			);

			const queryParams = {
				websiteId: input.websiteId,
				startDate: effectiveStartDate,
				endDate: `${endDate} 23:59:59`,
			};

			const linkVisitors = await queryLinkVisitorIds(input.linkId, queryParams);

			if (linkVisitors.size === 0) {
				return {
					overall_conversion_rate: 0,
					total_users_entered: 0,
					total_users_completed: 0,
					avg_completion_time: 0,
					avg_completion_time_formatted: "—",
					biggest_dropoff_step: 1,
					biggest_dropoff_rate: 0,
					steps_analytics: [],
					error_insights: {
						total_errors: 0,
						sessions_with_errors: 0,
						dropoffs_with_errors: 0,
						error_correlation_rate: 0,
					},
				};
			}

			const cacheKey = `analyticsByLink:${input.funnelId}:${input.linkId}:${effectiveStartDate}:${endDate}`;

			return cache.withCache({
				key: cacheKey,
				disabled: true, // TODO: Remove this once we have a way to invalidate the cache
				ttl: ANALYTICS_CACHE_TTL,
				tables: ["funnelDefinitions"],
				tag: `funnel:${input.funnelId}`,
				queryFn: () =>
					processFunnelAnalytics(
						toAnalyticsSteps(steps),
						(funnel.filters as Filter[]) || [],
						queryParams,
						linkVisitors
					),
			});
		}),
};
