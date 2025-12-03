import { and, desc, eq, goals, inArray, isNull } from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
	type AnalyticsStep,
	getTotalWebsiteUsers,
	processGoalAnalytics,
} from "../lib/analytics-utils";
import { protectedProcedure, publicProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

const cache = createDrizzleCache({ redis, namespace: "goals" });

const CACHE_TTL = 300;
const ANALYTICS_CACHE_TTL = 180;

const filterSchema = z.object({
	field: z.string(),
	operator: z.enum(["equals", "contains", "not_equals", "in", "not_in"]),
	value: z.union([z.string(), z.array(z.string())]),
});

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
	if (!(ignoreHistoricData && createdAt)) return requestedStartDate;

	const createdDate = new Date(createdAt).toISOString().split("T")[0];
	return new Date(requestedStartDate) > new Date(createdDate)
		? requestedStartDate
		: createdDate;
};

const invalidateGoalsCache = async (websiteId: string, goalId?: string) => {
	const keys = [`list:${websiteId}`];
	if (goalId) {
		keys.push(`byId:${goalId}:${websiteId}`);
	}
	await Promise.all(keys.map((key) => cache.invalidateByKey(key)));
};

export const goalsRouter = {
	list: publicProcedure
		.input(z.object({ websiteId: z.string() }))
		.handler(({ context, input }) =>
			cache.withCache({
				key: `list:${input.websiteId}`,
				ttl: CACHE_TTL,
				tables: ["goals"],
				queryFn: async () => {
					await authorizeWebsiteAccess(context, input.websiteId, "read");
					return context.db
						.select()
						.from(goals)
						.where(
							and(eq(goals.websiteId, input.websiteId), isNull(goals.deletedAt))
						)
						.orderBy(desc(goals.createdAt));
				},
			})
		),

	getById: publicProcedure
		.input(z.object({ id: z.string(), websiteId: z.string() }))
		.handler(({ context, input }) =>
			cache.withCache({
				key: `byId:${input.id}:${input.websiteId}`,
				ttl: CACHE_TTL,
				tables: ["goals"],
				queryFn: async () => {
					await authorizeWebsiteAccess(context, input.websiteId, "read");
					const [goal] = await context.db
						.select()
						.from(goals)
						.where(
							and(
								eq(goals.id, input.id),
								eq(goals.websiteId, input.websiteId),
								isNull(goals.deletedAt)
							)
						)
						.limit(1);

					if (!goal) {
						throw new ORPCError("NOT_FOUND", { message: "Goal not found" });
					}
					return goal;
				},
			})
		),

	create: protectedProcedure
		.input(
			z.object({
				websiteId: z.string(),
				type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
				target: z.string().min(1),
				name: z.string().min(1).max(100),
				description: z.string().nullable().optional(),
				filters: z.array(filterSchema).optional(),
				ignoreHistoricData: z.boolean().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "update");

			const [newGoal] = await context.db
				.insert(goals)
				.values({
					id: crypto.randomUUID(),
					websiteId: input.websiteId,
					type: input.type,
					target: input.target,
					name: input.name,
					description: input.description,
					filters: input.filters,
					ignoreHistoricData: input.ignoreHistoricData ?? false,
					isActive: true,
					createdBy: context.user.id,
				})
				.returning();

			await invalidateGoalsCache(input.websiteId);
			return newGoal;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]).optional(),
				target: z.string().min(1).optional(),
				name: z.string().min(1).max(100).optional(),
				description: z.string().nullable().optional(),
				filters: z.array(filterSchema).optional(),
				ignoreHistoricData: z.boolean().optional(),
				isActive: z.boolean().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const [existingGoal] = await context.db
				.select({ websiteId: goals.websiteId })
				.from(goals)
				.where(and(eq(goals.id, input.id), isNull(goals.deletedAt)))
				.limit(1);

			if (!existingGoal) {
				throw new ORPCError("NOT_FOUND", { message: "Goal not found" });
			}

			await authorizeWebsiteAccess(context, existingGoal.websiteId, "update");

			const { id, ...updates } = input;
			const [updatedGoal] = await context.db
				.update(goals)
				.set({ ...updates, updatedAt: new Date() })
				.where(and(eq(goals.id, id), isNull(goals.deletedAt)))
				.returning();

			await invalidateGoalsCache(existingGoal.websiteId, id);
			return updatedGoal;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			const [existingGoal] = await context.db
				.select({ websiteId: goals.websiteId })
				.from(goals)
				.where(and(eq(goals.id, input.id), isNull(goals.deletedAt)))
				.limit(1);

			if (!existingGoal) {
				throw new ORPCError("NOT_FOUND", { message: "Goal not found" });
			}

			await authorizeWebsiteAccess(context, existingGoal.websiteId, "delete");

			await context.db
				.update(goals)
				.set({ deletedAt: new Date(), isActive: false })
				.where(and(eq(goals.id, input.id), isNull(goals.deletedAt)));

			await invalidateGoalsCache(existingGoal.websiteId, input.id);
			return { success: true };
		}),

	getAnalytics: publicProcedure
		.input(
			z.object({
				goalId: z.string(),
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

			const [goal] = await context.db
				.select()
				.from(goals)
				.where(
					and(
						eq(goals.id, input.goalId),
						eq(goals.websiteId, input.websiteId),
						isNull(goals.deletedAt)
					)
				)
				.limit(1);

			if (!goal) {
				throw new ORPCError("NOT_FOUND", { message: "Goal not found" });
			}

			const effectiveStartDate = getEffectiveStartDate(
				startDate,
				goal.createdAt,
				goal.ignoreHistoricData
			);

			const cacheKey = `analytics:${input.goalId}:${effectiveStartDate}:${endDate}`;

			return cache.withCache({
				key: cacheKey,
				ttl: ANALYTICS_CACHE_TTL,
				tables: ["goals"],
				queryFn: async () => {
					const steps: AnalyticsStep[] = [
						{
							step_number: 1,
							type: goal.type as "PAGE_VIEW" | "EVENT",
							target: goal.target,
							name: goal.name,
						},
					];

					const filters = (goal.filters as Filter[]) || [];
					const totalWebsiteUsers = await getTotalWebsiteUsers(
						input.websiteId,
						effectiveStartDate,
						endDate
					);

					return processGoalAnalytics(
						steps,
						filters,
						{
							websiteId: input.websiteId,
							startDate: effectiveStartDate,
							endDate: `${endDate} 23:59:59`,
						},
						totalWebsiteUsers
					);
				},
			});
		}),

	bulkAnalytics: publicProcedure
		.input(
			z.object({
				websiteId: z.string(),
				goalIds: z.array(z.string()).min(1),
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

			const goalsList = await context.db
				.select()
				.from(goals)
				.where(
					and(
						eq(goals.websiteId, input.websiteId),
						isNull(goals.deletedAt),
						inArray(goals.id, input.goalIds)
					)
				)
				.orderBy(desc(goals.createdAt));

			const baseTotalUsers = await getTotalWebsiteUsers(
				input.websiteId,
				startDate,
				endDate
			);

			const results = await Promise.all(
				goalsList.map(async (goal) => {
					const effectiveStartDate = getEffectiveStartDate(
						startDate,
						goal.createdAt,
						goal.ignoreHistoricData
					);

					const steps: AnalyticsStep[] = [
						{
							step_number: 1,
							type: goal.type as "PAGE_VIEW" | "EVENT",
							target: goal.target,
							name: goal.name,
						},
					];

					const filters = (goal.filters as Filter[]) || [];
					const totalUsers = goal.ignoreHistoricData
						? await getTotalWebsiteUsers(
								input.websiteId,
								effectiveStartDate,
								endDate
							)
						: baseTotalUsers;

					try {
						const analytics = await processGoalAnalytics(
							steps,
							filters,
							{
								websiteId: input.websiteId,
								startDate: effectiveStartDate,
								endDate: `${endDate} 23:59:59`,
							},
							totalUsers
						);
						return { id: goal.id, result: analytics };
					} catch (error) {
						return {
							id: goal.id,
							result: {
								error: `Failed to process: ${error instanceof Error ? error.message : "Unknown error"}`,
							},
						};
					}
				})
			);

			return Object.fromEntries(results.map(({ id, result }) => [id, result]));
		}),
};
