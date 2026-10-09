import { analyticsCohortSchema } from "@databuddy/shared/analytics-filters";
import { insightMeasurementSchema } from "@databuddy/shared/insights";
import { successOutputSchema } from "../lib/schemas";
import { and, desc, eq, isNull, sql } from "@databuddy/db";
import { funnelDefinitions } from "@databuddy/db/schema";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import {
	analyticsDateRangeSchema,
	resolveAnalyticsDateRange,
} from "@databuddy/validation";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import { funnelCache, invalidateFunnelsCache } from "../lib/funnels-cache";
import { getEffectiveStartDate } from "../lib/goals-bulk-analytics-grouping";
import {
	processFunnelAnalytics,
	processFunnelAnalyticsByReferrer,
	queryLinkVisitorIds,
} from "../lib/analytics-utils";
import { setTrackProperties } from "../middleware/track-mutation";
import {
	type Context,
	protectedProcedure,
	publicProcedure,
	trackedProcedure,
} from "../orpc";
import {
	withPublicWorkspace,
	withWebsiteRead,
	withWorkspace,
} from "../procedures/with-workspace";
import { requireFeatureWithLimit } from "../types/billing";
import {
	conversionAnalyticsOutputSchema,
	filterSchema,
	funnelStepSchema,
	requireFunnelSteps,
	toAnalyticsSteps,
} from "./funnel-steps";
import { queueDefinitionChangeRechecks } from "./insights";

const CACHE_TTL = 300;
const ANALYTICS_CACHE_TTL = 180;

const funnelAnalyticsInputSchema = analyticsDateRangeSchema.safeExtend({
	cohort: analyticsCohortSchema.optional(),
	funnelId: z.string(),
	websiteId: z.string(),
});
const funnelAnalyticsByLinkInputSchema = funnelAnalyticsInputSchema.safeExtend({
	cohort: z.undefined(),
	linkId: z.string(),
});

async function loadFunnelAnalyticsQuery(
	db: Context["db"],
	input: z.infer<typeof funnelAnalyticsInputSchema>
) {
	const { startDate, endDate } = resolveAnalyticsDateRange(input);

	const [funnel] = await db
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

	const steps = toAnalyticsSteps(requireFunnelSteps(funnel.steps));
	const effectiveStartDate = getEffectiveStartDate(
		startDate,
		funnel.createdAt,
		funnel.ignoreHistoricData
	);

	const filters = [...(funnel.filters ?? []), ...(input.cohort?.filters ?? [])];
	return {
		savedDefinition: insightMeasurementSchema.shape.definition.parse({
			...funnel,
			filters: funnel.filters ?? [],
		}),
		measurement: insightMeasurementSchema.parse({
			websiteId: input.websiteId,
			definitionId: funnel.id,
			startDate: effectiveStartDate,
			endDate,
			definition: { ...funnel, filters },
		}),
		effectiveStartDate,
		endDate,
		filters,
		queryParams: {
			endDate: `${endDate} 23:59:59`,
			startDate: effectiveStartDate,
			websiteId: input.websiteId,
		},
		steps,
	};
}

const funnelListOutputSchema = z.object({
	createdAt: z.coerce.date(),
	description: z.string().nullable(),
	filters: z.array(filterSchema).nullable(),
	id: z.string(),
	ignoreHistoricData: z.boolean(),
	isActive: z.boolean(),
	name: z.string(),
	steps: z.array(funnelStepSchema),
	updatedAt: z.coerce.date(),
});

const funnelOutputSchema = z.object({
	createdAt: z.coerce.date(),
	createdBy: z.string().nullable(),
	deletedAt: z.nullable(z.coerce.date()),
	description: z.string().nullable(),
	filters: z.array(filterSchema).nullable(),
	id: z.string(),
	ignoreHistoricData: z.boolean(),
	isActive: z.boolean(),
	name: z.string(),
	steps: z.array(funnelStepSchema),
	updatedAt: z.coerce.date(),
	websiteId: z.string(),
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
		.handler(async ({ context, input }) => {
			await withPublicWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["read"],
			});

			return funnelCache.withCache({
				key: `list:${input.websiteId}`,
				ttl: CACHE_TTL,
				tables: ["funnelDefinitions"],
				queryFn: () =>
					context.db
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
						.orderBy(desc(funnelDefinitions.createdAt)),
			});
		}),

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
		.handler(async ({ context, input }) => {
			const [funnelRef] = await context.db
				.select({ websiteId: funnelDefinitions.websiteId })
				.from(funnelDefinitions)
				.where(
					and(
						eq(funnelDefinitions.id, input.id),
						isNull(funnelDefinitions.deletedAt)
					)
				)
				.limit(1);

			if (!funnelRef) {
				throw rpcError.notFound("funnel", input.id);
			}

			await withWorkspace(context, {
				websiteId: funnelRef.websiteId,
				permissions: ["read"],
			});

			return funnelCache.withCache({
				key: `byId:${input.id}`,
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

					return funnel;
				},
			});
		}),

	create: trackedProcedure
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
				steps: z.array(funnelStepSchema).min(2).max(10),
				filters: z.array(filterSchema).optional(),
				ignoreHistoricData: z.boolean().optional(),
			})
		)
		.output(funnelOutputSchema)
		.handler(async ({ context, input }) => {
			setTrackProperties({ step_count: input.steps.length });
			const workspace = await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["update"],
				includePlan: true,
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

			if (!newFunnel) {
				throw rpcError.internal(
					"The funnel could not be created. Try again in a moment."
				);
			}

			await invalidateFunnelsCache(input.websiteId);
			return newFunnel;
		}),

	update: trackedProcedure
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
				steps: z.array(funnelStepSchema).min(2).max(10).optional(),
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

			if (!updatedFunnel) {
				throw rpcError.notFound("funnel", id);
			}

			await invalidateFunnelsCache(existingFunnel.websiteId, id);
			await queueDefinitionChangeRechecks({
				definitionId: id,
				type: "funnel",
				websiteId: existingFunnel.websiteId,
			});
			return updatedFunnel;
		}),

	delete: trackedProcedure
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
			await queueDefinitionChangeRechecks({
				definitionId: input.id,
				type: "funnel",
				websiteId: existingFunnel.websiteId,
			});
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
		.input(funnelAnalyticsInputSchema)
		.output(
			conversionAnalyticsOutputSchema.extend({
				measurement: insightMeasurementSchema,
				savedDefinition: insightMeasurementSchema.shape.definition,
				cohort: analyticsCohortSchema.optional(),
			})
		)
		.use(withWebsiteRead)
		.handler(async ({ context, input }) => {
			const { filters, queryParams, steps, measurement, savedDefinition } =
				await loadFunnelAnalyticsQuery(context.db, input);

			const analytics = await funnelCache.withCache({
				key: `analytics:${JSON.stringify(measurement)}`,
				ttl: ANALYTICS_CACHE_TTL,
				tables: ["funnelDefinitions"],
				tag: `funnel:${input.funnelId}`,
				queryFn: () => processFunnelAnalytics(steps, filters, queryParams),
			});
			return {
				...analytics,
				measurement,
				savedDefinition,
				cohort: input.cohort,
			};
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
		.input(funnelAnalyticsInputSchema)
		.output(
			funnelAnalyticsByReferrerOutputSchema.extend({
				measurement: insightMeasurementSchema,
				savedDefinition: insightMeasurementSchema.shape.definition,
				cohort: analyticsCohortSchema.optional(),
			})
		)
		.use(withWebsiteRead)
		.handler(async ({ context, input }) => {
			const { filters, queryParams, steps, measurement, savedDefinition } =
				await loadFunnelAnalyticsQuery(context.db, input);

			const analytics = await funnelCache.withCache({
				key: `analyticsByReferrer:${JSON.stringify(measurement)}`,
				ttl: ANALYTICS_CACHE_TTL,
				tables: ["funnelDefinitions"],
				tag: `funnel:${input.funnelId}`,
				queryFn: () =>
					processFunnelAnalyticsByReferrer(steps, filters, queryParams),
			});
			return {
				...analytics,
				measurement,
				savedDefinition,
				cohort: input.cohort,
			};
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
		.input(funnelAnalyticsByLinkInputSchema)
		.output(conversionAnalyticsOutputSchema)
		.use(withWebsiteRead)
		.handler(async ({ context, input }) => {
			const { effectiveStartDate, endDate, filters, queryParams, steps } =
				await loadFunnelAnalyticsQuery(context.db, input);

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
					duration_available: false,
					steps_analytics: [],
					error_insights: {
						available: false,
						total_errors: 0,
						sessions_with_errors: 0,
						dropoffs_with_errors: 0,
						error_correlation_rate: 0,
					},
				};
			}

			return funnelCache.withCache({
				key: `analyticsByLink:${input.funnelId}:${input.linkId}:${effectiveStartDate}:${endDate}`,
				ttl: ANALYTICS_CACHE_TTL,
				tables: ["funnelDefinitions"],
				tag: `funnel:${input.funnelId}`,
				queryFn: () =>
					processFunnelAnalytics(steps, filters, queryParams, linkVisitors),
			});
		}),
};
