import { and, annotations, desc, eq, isNull } from "@databuddy/db";
import { createDrizzleCache, redis } from "@databuddy/redis";
import { ORPCError } from "@orpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure } from "../orpc";
import { authorizeWebsiteAccess } from "../utils/auth";
import { getCacheAuthContext } from "../utils/cache-keys";

const annotationsCache = createDrizzleCache({
	redis,
	namespace: "annotations",
});
const CACHE_TTL = 300; // 5 minutes

const chartContextSchema = z.object({
	dateRange: z.object({
		start_date: z.string(),
		end_date: z.string(),
		granularity: z.enum(["hourly", "daily", "weekly", "monthly"]),
	}),
	filters: z
		.array(
			z.object({
				field: z.string(),
				operator: z.enum(["eq", "ne", "gt", "lt", "contains"]),
				value: z.string(),
			})
		)
		.optional(),
	metrics: z.array(z.string()).optional(),
	tabId: z.string().optional(),
});

export const annotationsRouter = {
	// List annotations for a chart context
	list: publicProcedure
		.input(
			z.object({
				websiteId: z.string(),
				chartType: z.enum(["metrics"]),
				chartContext: chartContextSchema,
			})
		)
		.handler(async ({ context, input }) => {
			const authContext = await getCacheAuthContext(context, {
				websiteId: input.websiteId,
			});

			return annotationsCache.withCache({
				key: `annotations:list:${input.websiteId}:${input.chartType}:${authContext}`,
				ttl: CACHE_TTL,
				tables: ["annotations"],
				queryFn: async () => {
					await authorizeWebsiteAccess(context, input.websiteId, "read");

					return context.db
						.select()
						.from(annotations)
						.where(
							and(
								eq(annotations.websiteId, input.websiteId),
								eq(annotations.chartType, input.chartType),
								isNull(annotations.deletedAt)
							)
						)
						.orderBy(desc(annotations.createdAt));
				},
			});
		}),

	// Get annotation by ID
	getById: publicProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			const annotation = await context.db.query.annotations.findFirst({
				where: and(eq(annotations.id, input.id), isNull(annotations.deletedAt)),
				columns: { websiteId: true },
			});

			if (!annotation) {
				throw new ORPCError("NOT_FOUND", {
					message: "Annotation not found",
				});
			}

			const authContext = await getCacheAuthContext(context, {
				websiteId: annotation.websiteId,
			});

			return annotationsCache.withCache({
				key: `annotations:byId:${input.id}:${authContext}`,
				ttl: CACHE_TTL,
				tables: ["annotations"],
				queryFn: async () => {
					const result = await context.db
						.select()
						.from(annotations)
						.where(
							and(eq(annotations.id, input.id), isNull(annotations.deletedAt))
						)
						.limit(1);

					if (result.length === 0) {
						throw new ORPCError("NOT_FOUND", {
							message: "Annotation not found",
						});
					}

					const annotationResult = result[0];
					if (!annotationResult) {
						throw new ORPCError("NOT_FOUND", {
							message: "Annotation not found",
						});
					}
					await authorizeWebsiteAccess(
						context,
						annotationResult.websiteId,
						"read"
					);

					return annotationResult;
				},
			});
		}),

	// Create annotation
	create: protectedProcedure
		.input(
			z.object({
				websiteId: z.string(),
				chartType: z.enum(["metrics"]),
				chartContext: chartContextSchema,
				annotationType: z.enum(["point", "line", "range"]),
				xValue: z.string(),
				xEndValue: z.string().optional(),
				yValue: z.number().optional(),
				text: z.string().min(1).max(500),
				tags: z.array(z.string()).optional(),
				color: z.string().optional(),
				isPublic: z.boolean().default(false),
			})
		)
		.handler(async ({ context, input }) => {
			await authorizeWebsiteAccess(context, input.websiteId, "update");

			const annotationId = crypto.randomUUID();
			const [newAnnotation] = await context.db
				.insert(annotations)
				.values({
					id: annotationId,
					websiteId: input.websiteId,
					chartType: input.chartType,
					chartContext: input.chartContext,
					annotationType: input.annotationType,
					xValue: new Date(input.xValue),
					xEndValue: input.xEndValue ? new Date(input.xEndValue) : null,
					yValue: input.yValue,
					text: input.text,
					tags: input.tags || [],
					color: input.color || "#3B82F6",
					isPublic: input.isPublic,
					createdBy: context.user.id,
				})
				.returning();

			await annotationsCache.invalidateByTables(["annotations"]);

			return newAnnotation;
		}),

	// Update annotation
	update: protectedProcedure
		.input(
			z.object({
				id: z.string(),
				text: z.string().min(1).max(500).optional(),
				tags: z.array(z.string()).optional(),
				color: z.string().optional(),
				isPublic: z.boolean().optional(),
			})
		)
		.handler(async ({ context, input }) => {
			// First verify the annotation exists and get website ID
			const existingAnnotation = await context.db
				.select()
				.from(annotations)
				.where(and(eq(annotations.id, input.id), isNull(annotations.deletedAt)))
				.limit(1);

			if (existingAnnotation.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Annotation not found",
				});
			}

			await authorizeWebsiteAccess(
				context,
				existingAnnotation[0].websiteId,
				"update"
			);

			const [updatedAnnotation] = await context.db
				.update(annotations)
				.set({
					...input,
					updatedAt: new Date(),
				})
				.where(eq(annotations.id, input.id))
				.returning();

			await annotationsCache.invalidateByTables(["annotations"]);

			return updatedAnnotation;
		}),

	// Delete annotation (soft delete)
	delete: protectedProcedure
		.input(z.object({ id: z.string() }))
		.handler(async ({ context, input }) => {
			// First verify the annotation exists and get website ID
			const existingAnnotation = await context.db
				.select()
				.from(annotations)
				.where(and(eq(annotations.id, input.id), isNull(annotations.deletedAt)))
				.limit(1);

			if (existingAnnotation.length === 0) {
				throw new ORPCError("NOT_FOUND", {
					message: "Annotation not found",
				});
			}

			await authorizeWebsiteAccess(
				context,
				existingAnnotation[0].websiteId,
				"update"
			);

			await context.db
				.update(annotations)
				.set({ deletedAt: new Date() })
				.where(eq(annotations.id, input.id));

			await annotationsCache.invalidateByTables(["annotations"]);

			return { success: true };
		}),
};
