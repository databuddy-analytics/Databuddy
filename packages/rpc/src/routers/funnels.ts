import { and, desc, eq, funnelDefinitions, isNull, sql } from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
	type AnalyticsStep,
	processFunnelAnalytics,
	processFunnelAnalyticsByReferrer,
} from "../lib/analytics-utils";
import { protectedProcedure, publicProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

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
	await Promise.all(keys.map((key) => cache.invalidateByKey(key)));
};

const toAnalyticsSteps = (steps: Step[]): AnalyticsStep[] =>
	steps.map((step, index) => ({
		step_number: index + 1,
		type: step.type as "PAGE_VIEW" | "EVENT",
		target: step.target,
		name: step.name,
	}));

export const funnelsRouter = {
	list: publicProcedure
		.input(z.object({ websiteId: z.string() }))
		.handler(({ context, input }) =>
			cache.withCache({
				key: `list:${input.websiteId}`,
				ttl: CACHE_TTL,
				tables: ["funnelDefinitions"],
				queryFn: async () => {
					await authorizeWebsiteAccess(context, input.websiteId, "read");
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
		.input(z.object({ id: z.string(), websiteId: z.string() }))
		.handler(({ context, input }) =>
			cache.withCache({
				key: `byId:${input.id}:${input.websiteId}`,
				ttl: CACHE_TTL,
				tables: ["funnelDefinitions"],
				queryFn: async () => {
					await authorizeWebsiteAccess(context, input.websiteId, "read");
					const [funnel] = await context.db
						.select()
						.from(funnelDefinitions)
						.where(
							and(
								eq(funnelDefinitions.id, input.id),
								eq(funnelDefinitions.websiteId, input.websiteId),
								isNull(funnelDefinitions.deletedAt)
							)
						)
						.limit(1);

					if (!funnel) {
						throw new ORPCError("NOT_FOUND", { message: "Funnel not found" });
					}
					return funnel;
				},
			})
		),

	create: protectedProcedure
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
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "update");

			const [newFunnel] = await context.db
				.insert(funnelDefinitions)
				.values({
					id: crypto.randomUUID(),
					websiteId: input.websiteId,
					name: input.name,
					description: input.description,
					steps: input.steps,
					filters: input.filters,
					ignoreHistoricData: input.ignoreHistoricData ?? false,
					createdBy: context.user.id,
				})
				.returning();

			await invalidateFunnelsCache(input.websiteId);
			return newFunnel;
		}),

	update: protectedProcedure
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
				throw new ORPCError("NOT_FOUND", { message: "Funnel not found" });
			}

			await authorizeWebsiteAccess(context, existingFunnel.websiteId, "update");

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
		.input(z.object({ id: z.string() }))
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
				throw new ORPCError("NOT_FOUND", { message: "Funnel not found" });
			}

			await authorizeWebsiteAccess(context, existingFunnel.websiteId, "delete");

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
		.input(
			z.object({
				funnelId: z.string(),
				websiteId: z.string(),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

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
				throw new ORPCError("NOT_FOUND", { message: "Funnel not found" });
			}

			const steps = funnel.steps as Step[];
			if (!steps?.length) {
				throw new ORPCError("BAD_REQUEST", { message: "Funnel has no steps" });
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
		.input(
			z.object({
				funnelId: z.string(),
				websiteId: z.string(),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "read");

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
				throw new ORPCError("NOT_FOUND", { message: "Funnel not found" });
			}

			const steps = funnel.steps as Step[];
			if (!steps?.length) {
				throw new ORPCError("BAD_REQUEST", { message: "Funnel has no steps" });
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
};
