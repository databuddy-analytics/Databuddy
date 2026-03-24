import { and, desc, eq, goals, inArray, isNull } from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { GATED_FEATURES } from "@databuddy/shared/types/features";
import { randomUUIDv7 } from "bun";
import { z } from "zod";
import { rpcError } from "../errors";
import {
	type AnalyticsStep,
	getTotalWebsiteUsers,
	processGoalAnalytics,
} from "../lib/analytics-utils";
import { protectedProcedure, publicProcedure } from "../orpc";
import { withWebsiteRead, withWorkspace } from "../procedures/with-workspace";
import { requireFeatureWithLimit } from "../types/billing";

const cache = createDrizzleCache({ redis, namespace: "goals" });

const ANALYTICS_CACHE_TTL = 180;

const filterSchema = z.object({
	field: z.string(),
	operator: z.enum(["equals", "contains", "not_equals", "in", "not_in"]),
	value: z.union([z.string(), z.array(z.string())]),
});

type Filter = z.infer<typeof filterSchema>;

const goalOutputSchema = z.object({
	id: z.string(),
	websiteId: z.string(),
	type: z.enum(["PAGE_VIEW", "EVENT", "CUSTOM"]),
	target: z.string(),
	name: z.string(),
	description: z.string().nullable(),
	filters: z.array(filterSchema).nullable(),
	ignoreHistoricData: z.boolean(),
	isActive: z.boolean(),
	createdBy: z.string(),
	createdAt: z.coerce.date(),
	updatedAt: z.coerce.date(),
	deletedAt: z.nullable(z.coerce.date()),
});

const successOutputSchema = z.object({ success: z.literal(true) });

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

export const goalsRouter = {
	list: publicProcedure
		.route({
			method: "POST",
			path: "/goals/list",
			tags: ["Goals"],
			summary: "List goals",
			description:
				"Returns all goals for a website. Requires website read permission.",
		})
		.input(z.object({ websiteId: z.string() }))
		.output(z.array(goalOutputSchema))
		.use(withWebsiteRead)
		.handler(async ({ context, input }) => {
			return await context.db
				.select()
				.from(goals)
				.where(
					and(eq(goals.websiteId, input.websiteId), isNull(goals.deletedAt))
				)
				.orderBy(desc(goals.createdAt));
		}),

	getById: publicProcedure
		.route({
			method: "POST",
			path: "/goals/getById",
			tags: ["Goals"],
			summary: "Get goal",
			description:
				"Returns a single goal by id. Requires website read permission.",
		})
		.input(z.object({ id: z.string(), websiteId: z.string() }))
		.output(goalOutputSchema)
		.use(withWebsiteRead)
		.handler(async ({ context, input }) => {
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
				throw rpcError.notFound("goal", input.id);
			}
			return goal;
		}),

	create: protectedProcedure
		.route({
			method: "POST",
			path: "/goals/create",
			tags: ["Goals"],
			summary: "Create goal",
			description:
				"Creates a new conversion goal. Requires goals feature and website update permission.",
		})
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
		.output(goalOutputSchema)
		.handler(async ({ context, input }) => {
			const workspace = await withWorkspace(context, {
				websiteId: input.websiteId,
				permissions: ["update"],
			});

			const existingGoals = await context.db
				.select({ id: goals.id })
				.from(goals)
				.where(
					and(eq(goals.websiteId, input.websiteId), isNull(goals.deletedAt))
				);

			requireFeatureWithLimit(
				workspace.plan,
				GATED_FEATURES.GOALS,
				existingGoals.length
			);

			const createdBy = await workspace.getCreatedBy();

			const [newGoal] = await context.db
				.insert(goals)
				.values({
					id: randomUUIDv7(),
					websiteId: input.websiteId,
					type: input.type,
					target: input.target,
					name: input.name,
					description: input.description,
					filters: input.filters,
					ignoreHistoricData: input.ignoreHistoricData ?? false,
					isActive: true,
					createdBy,
				})
				.returning();

			return newGoal;
		}),

	update: protectedProcedure
		.route({
			method: "POST",
			path: "/goals/update",
			tags: ["Goals"],
			summary: "Update goal",
			description:
				"Updates an existing goal. Requires website update permission.",
		})
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
		.output(goalOutputSchema)
		.handler(async ({ context, input }) => {
			const [existingGoal] = await context.db
				.select({ websiteId: goals.websiteId })
				.from(goals)
				.where(and(eq(goals.id, input.id), isNull(goals.deletedAt)))
				.limit(1);

			if (!existingGoal) {
				throw rpcError.notFound("goal", input.id);
			}

			await withWorkspace(context, {
				websiteId: existingGoal.websiteId,
				permissions: ["update"],
			});

			const { id, ...updates } = input;
			const [updatedGoal] = await context.db
				.update(goals)
				.set({ ...updates, updatedAt: new Date() })
				.where(and(eq(goals.id, id), isNull(goals.deletedAt)))
				.returning();

			return updatedGoal;
		}),

	delete: protectedProcedure
		.route({
			method: "POST",
			path: "/goals/delete",
			tags: ["Goals"],
			summary: "Delete goal",
			description: "Soft-deletes a goal. Requires website delete permission.",
		})
		.input(z.object({ id: z.string() }))
		.output(successOutputSchema)
		.handler(async ({ context, input }) => {
			const [existingGoal] = await context.db
				.select({ websiteId: goals.websiteId })
				.from(goals)
				.where(and(eq(goals.id, input.id), isNull(goals.deletedAt)))
				.limit(1);

			if (!existingGoal) {
				throw rpcError.notFound("goal", input.id);
			}

			await withWorkspace(context, {
				websiteId: existingGoal.websiteId,
				permissions: ["delete"],
			});

			await context.db
				.update(goals)
				.set({ deletedAt: new Date(), isActive: false })
				.where(and(eq(goals.id, input.id), isNull(goals.deletedAt)));

			return { success: true };
		}),

	getAnalytics: publicProcedure
		.route({
			method: "POST",
			path: "/goals/getAnalytics",
			tags: ["Goals"],
			summary: "Get goal analytics",
			description:
				"Returns conversion analytics for a single goal. Requires website read permission.",
		})
		.input(
			z.object({
				goalId: z.string(),
				websiteId: z.string(),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			})
		)
		.output(z.record(z.string(), z.unknown()))
		.use(withWebsiteRead)
		.handler(async ({ context, input }) => {
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
				throw rpcError.notFound("goal", input.goalId);
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
					return await processGoalAnalytics(
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
		.route({
			method: "POST",
			path: "/goals/bulkAnalytics",
			tags: ["Goals"],
			summary: "Get bulk goal analytics",
			description:
				"Returns conversion analytics for multiple goals. Requires website read permission.",
		})
		.input(
			z.object({
				websiteId: z.string(),
				goalIds: z.array(z.string()).min(1),
				startDate: z.string().optional(),
				endDate: z.string().optional(),
			})
		)
		.output(z.record(z.string(), z.any()))
		.use(withWebsiteRead)
		.handler(async ({ context, input }) => {
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
