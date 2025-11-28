import { and, desc, eq, goals, inArray, isNull, sql } from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import {
	type AnalyticsStep,
	getTotalWebsiteUsers,
	processGoalAnalytics,
} from "../lib/analytics-utils";
import { logger } from "../lib/logger";
import { protectedProcedure, publicProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";

const drizzleCache = createDrizzleCache({ redis, namespace: "goals" });

const CACHE_TTL = 300;
const ANALYTICS_CACHE_TTL = 600;

const getDefaultDateRange = () => {
	const endDate = new Date().toISOString().split("T")[0];
	const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
		.toISOString()
		.split("T")[0];
	return { startDate, endDate };
};

export const goalsRouter = {
	list: publicProcedure
		.input(z.object({ websiteId: z.string() }))
		.handler(({ context, input }) => {
			const cacheKey = `goals:list:${input.websiteId}`;

			return drizzleCache.withCache({
				key: cacheKey,
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
			});
		}),

	getById: publicProcedure
		.input(z.object({ id: z.string(), websiteId: z.string() }))
		.handler(({ context, input }) => {
			const cacheKey = `goals:byId:${input.id}:${input.websiteId}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: CACHE_TTL,
				tables: ["goals"],
				queryFn: async () => {
					await authorizeWebsiteAccess(context, input.websiteId, "read");
					const result = await context.db
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
					if (result.length === 0) {
						throw new ORPCError("NOT_FOUND", {
							message: "Goal not found",
						});
					}
					return result[0];
				},
			});
		}),

	create: protectedProcedure
		.input(
			z.object({
				websiteId: z.string(),
				type: z.string(),
				target: z.string(),
				name: z.string(),
				description: z.string().nullable().optional(),
				filters: z.unknown().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "update");
			const goalId = crypto.randomUUID();
			const [newGoal] = await context.db
				.insert(goals)
				.values({
					id: goalId,
					websiteId: input.websiteId,
					type: input.type,
					target: input.target,
					name: input.name,
					description: input.description,
					filters: input.filters,
					isActive: true,
					createdBy: context.user.id,
				})
				.returning();

			await drizzleCache.invalidateByTables(["goals"]);

			return newGoal;
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				type: z.string().optional(),
				target: z.string().optional(),
				name: z.string().optional(),
				description: z.string().nullable().optional(),
				filters: z.unknown().optional(),
				isActive: z.boolean().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			const existingGoal = await context.db
				.select({ websiteId: goals.websiteId })
				.from(goals)
				.where(and(eq(goals.id, input.id), isNull(goals.deletedAt)))
				.limit(1);
			if (existingGoal.length === 0) {
				throw new ORPCError("NOT_FOUND", { message: "Goal not found" });
			}
			await authorizeWebsiteAccess(
				context,
				existingGoal[0].websiteId,
				"update"
			);
			const { id, ...updates } = input;
			const [updatedGoal] = await context.db
				.update(goals)
				.set({
					...updates,
					updatedAt: new Date(),
				})
				.where(and(eq(goals.id, id), isNull(goals.deletedAt)))
				.returning();

			await Promise.all([
				drizzleCache.invalidateByTables(["goals"]),
				drizzleCache.invalidateByKey(
					`goals:byId:${id}:${existingGoal[0].websiteId}`
				),
			]);

			return updatedGoal;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			const existingGoal = await context.db
				.select({ websiteId: goals.websiteId })
				.from(goals)
				.where(and(eq(goals.id, input.id), isNull(goals.deletedAt)))
				.limit(1);
			if (existingGoal.length === 0) {
				throw new ORPCError("NOT_FOUND", { message: "Goal not found" });
			}
			await authorizeWebsiteAccess(
				context,
				existingGoal[0].websiteId,
				"delete"
			);
			await context.db
				.update(goals)
				.set({
					deletedAt: new Date(),
					isActive: false,
				})
				.where(and(eq(goals.id, input.id), isNull(goals.deletedAt)));

			await Promise.all([
				drizzleCache.invalidateByTables(["goals"]),
				drizzleCache.invalidateByKey(
					`goals:byId:${input.id}:${existingGoal[0].websiteId}`
				),
			]);

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
		.handler(({ context, input }) => {
			const { startDate, endDate } =
				input.startDate && input.endDate
					? { startDate: input.startDate, endDate: input.endDate }
					: getDefaultDateRange();

			const cacheKey = `goals:analytics:${input.goalId}:${input.websiteId}:${startDate}:${endDate}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: ANALYTICS_CACHE_TTL,
				tables: ["goals"],
				queryFn: async () => {
					await authorizeWebsiteAccess(context, input.websiteId, "read");
					const goal = await context.db
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
					if (goal.length === 0) {
						throw new ORPCError("NOT_FOUND", {
							message: "Goal not found",
						});
					}
					const goalData = goal[0];
					const steps: AnalyticsStep[] = [
						{
							step_number: 1,
							type: goalData.type as "PAGE_VIEW" | "EVENT",
							target: goalData.target,
							name: goalData.name,
						},
					];
					const filters =
						(goalData.filters as Array<{
							field: string;
							operator: string;
							value: string | string[];
						}>) || [];
					const totalWebsiteUsers = await getTotalWebsiteUsers(
						input.websiteId,
						startDate,
						endDate
					);
					const params: Record<string, unknown> = {
						websiteId: input.websiteId,
						startDate,
						endDate: `${endDate} 23:59:59`,
					};
					return processGoalAnalytics(
						steps,
						filters,
						params,
						totalWebsiteUsers
					);
				},
			});
		}),

	bulkAnalytics: publicProcedure
		.input(
			z.object({
				websiteId: z.string(),
				goalIds: z.array(z.string()),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			})
		)
		.handler(({ context, input }) => {
			const { startDate, endDate } =
				input.startDate && input.endDate
					? { startDate: input.startDate, endDate: input.endDate }
					: getDefaultDateRange();

			const cacheKey = `goals:bulkAnalytics:${input.websiteId}:${input.goalIds.sort().join(",")}:${startDate}:${endDate}`;

			return drizzleCache.withCache({
				key: cacheKey,
				ttl: ANALYTICS_CACHE_TTL,
				tables: ["goals"],
				queryFn: async () => {
					await authorizeWebsiteAccess(context, input.websiteId, "read");
					const goalsList = await context.db
						.select()
						.from(goals)
						.where(
							and(
								eq(goals.websiteId, input.websiteId),
								isNull(goals.deletedAt),
								input.goalIds.length > 0
									? inArray(goals.id, input.goalIds)
									: sql`1=0`
							)
						)
						.orderBy(desc(goals.createdAt));
					const totalWebsiteUsers = await getTotalWebsiteUsers(
						input.websiteId,
						startDate,
						endDate
					);

					const analyticsPromises = goalsList.map(async (goalData) => {
						const steps: AnalyticsStep[] = [
							{
								step_number: 1,
								type: goalData.type as "PAGE_VIEW" | "EVENT",
								target: goalData.target,
								name: goalData.name,
							},
						];
						const localParams: Record<string, unknown> = {
							websiteId: input.websiteId,
							startDate,
							endDate: `${endDate} 23:59:59`,
						};
						const filters =
							(goalData.filters as Array<{
								field: string;
								operator: string;
								value: string | string[];
							}>) || [];
						try {
							const processedAnalytics = await processGoalAnalytics(
								steps,
								filters,
								localParams,
								totalWebsiteUsers
							);
							return { id: goalData.id, result: processedAnalytics };
						} catch (error) {
							logger.error("Failed to process goal analytics", {
								goalId: goalData.id,
								error: error instanceof Error ? error.message : String(error),
							});
							return {
								id: goalData.id,
								result: {
									error: `Error processing goal ${goalData.id}: ${error instanceof Error ? error.message : "Unknown error"}`,
								},
							};
						}
					});

					const analyticsResultsArray = await Promise.all(analyticsPromises);
					const analyticsResults: Record<
						string,
						| {
							overall_conversion_rate: number;
							total_users_entered: number;
							total_users_completed: number;
							avg_completion_time: number;
							avg_completion_time_formatted: string;
							steps_analytics: Array<{
								step_number: number;
								step_name: string;
								users: number;
								total_users: number;
								conversion_rate: number;
								dropoffs: number;
								dropoff_rate: number;
								avg_time_to_complete: number;
							}>;
						}
						| { error: string }
					> = {};
					for (const { id, result } of analyticsResultsArray) {
						analyticsResults[id] = result;
					}
					return analyticsResults;
				},
			});
		}),
};
